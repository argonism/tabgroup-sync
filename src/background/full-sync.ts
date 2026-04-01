// Full sync: reset state and mirror all groups across windows

import { groupMap, groupWindowMap, groupKey, parseGroupKey, registerGroup, getSiblingGroupIds } from "./state";
import { loadSettings, shouldSyncGroup } from "./settings";
import { clearAllTimersAndLocks, setFullSyncRunning, fullSyncRunning } from "./locks";
import { createMirrorGroup } from "./group-sync";
import { syncTabsForMirror } from "./tab-sync";

interface FullSyncResult {
  success: boolean;
  groupCount?: number;
  error?: string;
}

export async function fullSync(): Promise<FullSyncResult> {
  if (fullSyncRunning) return { success: false, error: "already running" };

  setFullSyncRunning(true);
  try {
    clearAllTimersAndLocks();

    groupMap.clear();
    groupWindowMap.clear();

    await loadSettings();

    const allGroups = await chrome.tabGroups.query({});
    const allWindows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const windowIds = allWindows.map((w) => w.id!);

    for (const group of allGroups) {
      const key = groupKey(group.title, group.color);
      registerGroup(group.id, group.windowId, key);
    }

    const processedKeys = new Set<string>();
    for (const group of allGroups) {
      const key = groupKey(group.title, group.color);
      if (processedKeys.has(key)) continue;
      processedKeys.add(key);

      const { title, color } = parseGroupKey(key);
      if (!shouldSyncGroup(title, color)) continue;

      const ids = groupMap.get(key);
      const windowsWithGroup = new Set<number>();
      if (ids) {
        for (const gId of ids) {
          const wId = groupWindowMap.get(gId);
          if (wId) windowsWithGroup.add(wId);
        }
      }

      const sourceGroupId = group.id;

      for (const wId of windowIds) {
        if (windowsWithGroup.has(wId)) continue;
        await createMirrorGroup(wId, group.title, group.color, group.collapsed, sourceGroupId);
      }

      const siblings = getSiblingGroupIds(sourceGroupId, key);
      if (siblings.length > 0) {
        let sourceTabs: chrome.tabs.Tab[];
        try {
          sourceTabs = await chrome.tabs.query({ groupId: sourceGroupId });
        } catch (_) {
          continue;
        }
        const sourceUrls = sourceTabs.map((t) => t.url || t.pendingUrl || "chrome://newtab");

        for (const siblingId of siblings) {
          const sibWinId = groupWindowMap.get(siblingId);
          if (!sibWinId) continue;
          try {
            await syncTabsForMirror(siblingId, sibWinId, sourceUrls);
          } catch (e) {
            console.error("[TabGroupSync] fullSync tab sync error:", e);
          }
        }
      }
    }

    console.log("[TabGroupSync] Full sync complete.", processedKeys.size, "logical groups processed");
    return { success: true, groupCount: processedKeys.size };
  } catch (e) {
    console.error("[TabGroupSync] Full sync error:", e);
    return { success: false, error: (e as Error).message };
  } finally {
    setFullSyncRunning(false);
  }
}
