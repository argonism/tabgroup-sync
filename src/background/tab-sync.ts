// Tab content sync (add/remove/reorder tabs in mirror groups)

import { groupMap, groupWindowMap, findKeyForGroup, parseGroupKey, getSiblingGroupIds } from "./state";
import { currentSettings, shouldSyncGroup } from "./settings";
import { tabSyncInProgress, tabSyncTimers } from "./locks";
import { TAB_SYNC_DEBOUNCE_MS } from "./constants";

export function scheduleTabSync(groupId: number): void {
  if (tabSyncTimers.has(groupId)) {
    clearTimeout(tabSyncTimers.get(groupId));
  }
  tabSyncTimers.set(
    groupId,
    setTimeout(() => {
      tabSyncTimers.delete(groupId);
      syncGroupTabs(groupId);
    }, TAB_SYNC_DEBOUNCE_MS)
  );
}

export function scheduleAllGroupSync(): void {
  const seen = new Set<string>();
  for (const [key, ids] of groupMap) {
    for (const gId of ids) {
      if (!seen.has(key)) {
        seen.add(key);
        scheduleTabSync(gId);
      }
      break;
    }
  }
}

async function syncGroupTabs(sourceGroupId: number): Promise<void> {
  const sp = currentSettings.syncProps;
  if (!sp.tabs && !sp.tabOrder) return;

  const key = findKeyForGroup(sourceGroupId);
  if (!key) return;

  const { title, color } = parseGroupKey(key);
  if (!shouldSyncGroup(title, color)) return;

  const siblings = getSiblingGroupIds(sourceGroupId, key);
  if (siblings.length === 0) return;

  let sourceTabs: chrome.tabs.Tab[];
  try {
    sourceTabs = await chrome.tabs.query({ groupId: sourceGroupId });
  } catch (_) {
    return;
  }
  const sourceUrls = sourceTabs.map((t) => t.url || t.pendingUrl || "chrome://newtab");

  for (const siblingId of siblings) {
    const siblingWindowId = groupWindowMap.get(siblingId);
    if (!siblingWindowId) continue;

    try {
      await syncTabsForMirror(siblingId, siblingWindowId, sourceUrls);
    } catch (e) {
      console.error("[TabGroupSync] Tab sync error for group", siblingId, e);
    }
  }
}

export async function syncTabsForMirror(mirrorGroupId: number, windowId: number, sourceUrls: string[]): Promise<void> {
  const sp = currentSettings.syncProps;

  if (sp.tabs) {
    const mirrorTabs = await chrome.tabs.query({ groupId: mirrorGroupId });

    const sourceCount = new Map<string, number>();
    for (const url of sourceUrls) {
      sourceCount.set(url, (sourceCount.get(url) || 0) + 1);
    }

    const tabsToRemove: number[] = [];
    const kept = new Map<string, number>();
    for (const tab of mirrorTabs) {
      const url = tab.url || tab.pendingUrl || "chrome://newtab";
      const needed = sourceCount.get(url) || 0;
      const alreadyKept = kept.get(url) || 0;
      if (alreadyKept < needed) {
        kept.set(url, alreadyKept + 1);
      } else {
        tabsToRemove.push(tab.id!);
      }
    }

    const urlsToAdd: string[] = [];
    const mirrorAvail = new Map(kept);
    for (const url of sourceUrls) {
      const avail = mirrorAvail.get(url) || 0;
      if (avail > 0) {
        mirrorAvail.set(url, avail - 1);
      } else {
        urlsToAdd.push(url);
      }
    }

    for (const url of urlsToAdd) {
      try {
        const newTab = await chrome.tabs.create({ windowId, url, active: false });
        tabSyncInProgress.add(newTab.id!);
        await chrome.tabs.group({ tabIds: [newTab.id!], groupId: mirrorGroupId });
        setTimeout(() => tabSyncInProgress.delete(newTab.id!), 1000);
      } catch (e) {
        console.error("[TabGroupSync] Failed to add tab:", url, e);
      }
    }

    for (const tabId of tabsToRemove) {
      try {
        tabSyncInProgress.add(tabId);
        await chrome.tabs.remove(tabId);
      } catch (_) {
      } finally {
        tabSyncInProgress.delete(tabId);
      }
    }
  }

  if (sp.tabOrder) {
    await reorderMirrorTabs(mirrorGroupId, sourceUrls);
  }
}

async function reorderMirrorTabs(mirrorGroupId: number, sourceUrls: string[]): Promise<void> {
  if (sourceUrls.length <= 1) return;

  let mirrorTabs: chrome.tabs.Tab[];
  try {
    mirrorTabs = await chrome.tabs.query({ groupId: mirrorGroupId });
  } catch (_) {
    return;
  }

  if (mirrorTabs.length <= 1) return;

  const available = [...mirrorTabs];
  const ordered: chrome.tabs.Tab[] = [];
  for (const url of sourceUrls) {
    const idx = available.findIndex(
      (t) => (t.url || t.pendingUrl || "chrome://newtab") === url
    );
    if (idx !== -1) {
      ordered.push(available[idx]);
      available.splice(idx, 1);
    }
  }
  ordered.push(...available);

  const currentIds = mirrorTabs.map((t) => t.id!);
  const desiredIds = ordered.map((t) => t.id!);
  if (currentIds.every((id, i) => id === desiredIds[i])) return;

  const groupStartIndex = Math.min(...mirrorTabs.map((t) => t.index!));

  for (let i = 0; i < desiredIds.length; i++) {
    try {
      tabSyncInProgress.add(desiredIds[i]);
      await chrome.tabs.move(desiredIds[i], { index: groupStartIndex + i });
      setTimeout(() => tabSyncInProgress.delete(desiredIds[i]), 1000);
    } catch (_) {
      tabSyncInProgress.delete(desiredIds[i]);
    }
  }
}
