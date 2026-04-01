// In-place tab URL update sync

import { findKeyForGroup, parseGroupKey, getSiblingGroupIds } from "./state";
import { currentSettings, shouldSyncGroup } from "./settings";
import { tabSyncInProgress, urlUpdateTimers } from "./locks";
import { URL_UPDATE_DEBOUNCE_MS } from "./constants";

export function handleTabUrlChanged(tab: chrome.tabs.Tab): void {
  const sp = currentSettings.syncProps;
  if (!sp.tabs) return;

  const groupId = tab.groupId!;
  const timerKey = `url_${tab.id}`;
  if (urlUpdateTimers.has(timerKey)) {
    clearTimeout(urlUpdateTimers.get(timerKey));
  }
  urlUpdateTimers.set(
    timerKey,
    setTimeout(() => {
      urlUpdateTimers.delete(timerKey);
      syncTabUrl(tab.id!, groupId);
    }, URL_UPDATE_DEBOUNCE_MS)
  );
}

async function syncTabUrl(sourceTabId: number, sourceGroupId: number): Promise<void> {
  const key = findKeyForGroup(sourceGroupId);
  if (!key) return;

  const { title, color } = parseGroupKey(key);
  if (!shouldSyncGroup(title, color)) return;

  const siblings = getSiblingGroupIds(sourceGroupId, key);
  if (siblings.length === 0) return;

  let sourceTab: chrome.tabs.Tab;
  try {
    sourceTab = await chrome.tabs.get(sourceTabId);
  } catch (_) {
    return;
  }
  const newUrl = sourceTab.url || sourceTab.pendingUrl || "chrome://newtab";

  let sourceTabs: chrome.tabs.Tab[];
  try {
    sourceTabs = await chrome.tabs.query({ groupId: sourceGroupId });
  } catch (_) {
    return;
  }
  const posInGroup = sourceTabs.findIndex((t) => t.id === sourceTabId);
  if (posInGroup === -1) return;

  for (const siblingId of siblings) {
    try {
      const mirrorTabs = await chrome.tabs.query({ groupId: siblingId });
      if (posInGroup >= mirrorTabs.length) continue;

      const mirrorTab = mirrorTabs[posInGroup];
      const mirrorUrl = mirrorTab.url || mirrorTab.pendingUrl || "chrome://newtab";
      if (mirrorUrl === newUrl) continue;

      tabSyncInProgress.add(mirrorTab.id!);
      await chrome.tabs.update(mirrorTab.id!, { url: newUrl });
      setTimeout(() => tabSyncInProgress.delete(mirrorTab.id!), 1000);
    } catch (_) {}
  }
}
