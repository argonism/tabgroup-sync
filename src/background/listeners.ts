// All Chrome event listeners and side effects (single place for all subscriptions)

import { groupMap, groupWindowMap, groupKey, parseGroupKey, registerGroup, unregisterGroup, findKeyForGroup, getSiblingGroupIds, getSyncStatus } from "./state";
import { shouldSyncGroup, applySettings } from "./settings";
import type { Settings } from "./settings";
import { syncInProgress, tabSyncInProgress, windowSyncInProgress, fullSyncRunning, withSyncLock, updateTimers } from "./locks";
import { DEBOUNCE_MS } from "./constants";
import { handleGroupUpdated, mirrorGroupToOtherWindows, createMirrorGroup } from "./group-sync";
import { scheduleTabSync, scheduleAllGroupSync } from "./tab-sync";
import { handleTabUrlChanged } from "./tab-url-sync";
import { fullSync } from "./full-sync";

// --- Settings Change Listener ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.tabGroupSync) {
    applySettings(changes.tabGroupSync.newValue as Partial<Settings>);
    console.log("[TabGroupSync] Settings updated");
  }
});

// --- Tab Group Events ---

chrome.tabGroups.onCreated.addListener(async (group) => {
  if (fullSyncRunning) return;
  if (syncInProgress.has(group.id)) return;
  if (windowSyncInProgress.has(group.windowId)) return;

  const key = groupKey(group.title, group.color);
  registerGroup(group.id, group.windowId, key);

  if (!shouldSyncGroup(group.title, group.color)) return;
  await mirrorGroupToOtherWindows(group, key);
});

chrome.tabGroups.onUpdated.addListener((group) => {
  if (fullSyncRunning) return;
  if (syncInProgress.has(group.id)) return;

  if (updateTimers.has(group.id)) {
    clearTimeout(updateTimers.get(group.id));
  }
  updateTimers.set(
    group.id,
    setTimeout(() => {
      updateTimers.delete(group.id);
      handleGroupUpdated(group);
    }, DEBOUNCE_MS)
  );
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  if (fullSyncRunning) return;
  if (syncInProgress.has(group.id)) return;

  const key = findKeyForGroup(group.id);
  if (!key) return;

  const { title, color } = parseGroupKey(key);
  const siblings = getSiblingGroupIds(group.id, key);
  unregisterGroup(group.id);

  if (!shouldSyncGroup(title, color)) return;

  for (const siblingId of siblings) {
    try {
      await withSyncLock(siblingId, async () => {
        const tabs = await chrome.tabs.query({ groupId: siblingId });
        if (tabs.length > 0) {
          await chrome.tabs.remove(tabs.map((t) => t.id!));
        }
      });
    } catch (_) {}
    unregisterGroup(siblingId);
  }
});

// --- Window Events ---

chrome.windows.onRemoved.addListener((windowId) => {
  const toRemove: number[] = [];
  for (const [groupId, wId] of groupWindowMap) {
    if (wId === windowId) {
      toRemove.push(groupId);
    }
  }
  for (const groupId of toRemove) {
    unregisterGroup(groupId);
  }
});

interface GroupMirrorInfo {
  title: string | undefined;
  color: chrome.tabGroups.ColorEnum;
  collapsed: boolean;
  sourceGroupId: number;
}

chrome.windows.onCreated.addListener(async (window) => {
  if (fullSyncRunning) return;
  if (window.type !== "normal") return;

  await new Promise((r) => setTimeout(r, 500));

  const existingKeys = new Map<string, GroupMirrorInfo>();
  for (const [key, ids] of groupMap) {
    for (const id of ids) {
      try {
        const g = await chrome.tabGroups.get(id);
        existingKeys.set(key, {
          title: g.title,
          color: g.color,
          collapsed: g.collapsed,
          sourceGroupId: g.id,
        });
        break;
      } catch (_) {
        continue;
      }
    }
  }

  for (const [key, props] of existingKeys) {
    if (!shouldSyncGroup(props.title, props.color)) continue;

    const hasGroup = [...(groupMap.get(key) || [])].some(
      (gId) => groupWindowMap.get(gId) === window.id
    );
    if (hasGroup) continue;

    await createMirrorGroup(window.id!, props.title, props.color, props.collapsed, props.sourceGroupId);
  }
});

// --- Tab Events ---

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (fullSyncRunning) return;
  if (tabSyncInProgress.has(tabId)) return;

  if (changeInfo.groupId !== undefined) {
    if (changeInfo.groupId !== -1) {
      scheduleTabSync(changeInfo.groupId);
    } else {
      scheduleAllGroupSync();
    }
  }

  if (changeInfo.url && tab.groupId !== undefined && tab.groupId !== -1) {
    handleTabUrlChanged(tab);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (fullSyncRunning) return;
  if (tabSyncInProgress.has(tab.id!)) return;
  if (tab.groupId && tab.groupId !== -1) {
    scheduleTabSync(tab.groupId);
  }
});

chrome.tabs.onMoved.addListener(async (tabId) => {
  if (fullSyncRunning) return;
  if (tabSyncInProgress.has(tabId)) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId && tab.groupId !== -1) {
      scheduleTabSync(tab.groupId);
    }
  } catch (_) {}
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (fullSyncRunning) return;
  if (tabSyncInProgress.has(tabId)) return;
  if (removeInfo.isWindowClosing) return;
  scheduleAllGroupSync();
});

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "getSyncStatus") {
    sendResponse({ groups: getSyncStatus() });
    return;
  }
  if (message.type === "fullSync") {
    fullSync().then(sendResponse);
    return true;
  }
});

// --- Action Icon Click ---

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
