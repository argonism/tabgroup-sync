// Group property sync and mirror creation

import { groupMap, groupWindowMap, groupKey, registerGroup, unregisterGroup, findKeyForGroup, getSiblingGroupIds } from "./state";
import { currentSettings, shouldSyncGroup, buildGroupUpdateProps } from "./settings";
import { syncInProgress, tabSyncInProgress, withSyncLock, withWindowLock } from "./locks";

export async function handleGroupUpdated(group: chrome.tabGroups.TabGroup): Promise<void> {
  const oldKey = findKeyForGroup(group.id);
  const newKey = groupKey(group.title, group.color);
  const nowSync = shouldSyncGroup(group.title, group.color);

  if (oldKey && oldKey !== newKey) {
    const siblings = getSiblingGroupIds(group.id, oldKey);
    unregisterGroup(group.id);
    registerGroup(group.id, group.windowId, newKey);

    if (!nowSync) {
      for (const siblingId of siblings) {
        try {
          await withSyncLock(siblingId, async () => {
            const tabs = await chrome.tabs.query({ groupId: siblingId });
            if (tabs.length > 0) await chrome.tabs.remove(tabs.map((t) => t.id!));
          });
        } catch (_) {}
        unregisterGroup(siblingId);
      }
      return;
    }

    const updateProps = buildGroupUpdateProps(group);
    for (const siblingId of siblings) {
      unregisterGroup(siblingId);
      try {
        await withSyncLock(siblingId, async () => {
          if (Object.keys(updateProps).length > 0) {
            await chrome.tabGroups.update(siblingId, updateProps);
          }
        });
        const wId = (await chrome.tabGroups.get(siblingId)).windowId;
        registerGroup(siblingId, wId, newKey);
      } catch (_) {}
    }
  } else if (oldKey) {
    if (!nowSync) return;
    const siblings = getSiblingGroupIds(group.id, oldKey);
    const updateProps = buildGroupUpdateProps(group);
    if (Object.keys(updateProps).length === 0) return;
    for (const siblingId of siblings) {
      try {
        await withSyncLock(siblingId, async () => {
          await chrome.tabGroups.update(siblingId, updateProps);
        });
      } catch (_) {}
    }
  } else {
    registerGroup(group.id, group.windowId, newKey);
    if (nowSync) {
      await mirrorGroupToOtherWindows(group, newKey);
    }
  }
}

export async function mirrorGroupToOtherWindows(group: chrome.tabGroups.TabGroup, key: string): Promise<void> {
  try {
    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });

    for (const win of windows) {
      if (win.id === group.windowId) continue;

      const hasGroup = [...(groupMap.get(key) || [])].some(
        (gId) => groupWindowMap.get(gId) === win.id
      );
      if (hasGroup) continue;

      await createMirrorGroup(win.id!, group.title, group.color, group.collapsed, group.id);
    }
  } catch (e) {
    console.error("[TabGroupSync] Mirror error:", e);
  }
}

export async function createMirrorGroup(
  windowId: number,
  title: string | undefined,
  color: chrome.tabGroups.ColorEnum,
  collapsed: boolean,
  sourceGroupId?: number,
): Promise<number | null> {
  try {
    return await withWindowLock(windowId, async () => {
      const sp = currentSettings.syncProps;

      let sourceUrls: string[] = [];
      if (sp.tabs && sourceGroupId) {
        try {
          const sourceTabs = await chrome.tabs.query({ groupId: sourceGroupId });
          sourceUrls = sourceTabs.map((t) => t.url || t.pendingUrl || "chrome://newtab");
        } catch (_) {}
      }

      const urlsToCreate = sourceUrls.length > 0 ? sourceUrls : ["chrome://newtab"];
      const createdTabIds: number[] = [];

      for (const url of urlsToCreate) {
        const tab = await chrome.tabs.create({ windowId, url, active: false });
        tabSyncInProgress.add(tab.id!);
        createdTabIds.push(tab.id!);
      }

      const newGroupId = await chrome.tabs.group({
        tabIds: createdTabIds,
        createProperties: { windowId },
      });

      const groupProps: chrome.tabGroups.UpdateProperties = { title: title || "", color };
      if (sp.collapsed) groupProps.collapsed = collapsed || false;

      syncInProgress.add(newGroupId);
      try {
        await chrome.tabGroups.update(newGroupId, groupProps);
      } finally {
        syncInProgress.delete(newGroupId);
      }

      setTimeout(() => {
        for (const id of createdTabIds) tabSyncInProgress.delete(id);
      }, 1000);

      const key = groupKey(title, color);
      registerGroup(newGroupId, windowId, key);

      console.log(`[TabGroupSync] Created mirror group "${title}" (${createdTabIds.length} tabs) in window ${windowId}`);
      return newGroupId;
    });
  } catch (e) {
    console.error("[TabGroupSync] Create mirror error:", e);
    return null;
  }
}
