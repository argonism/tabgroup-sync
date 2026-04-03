// Snapshot: save and restore tab group state

export interface GroupSnapshot {
  title: string;
  color: string;
  collapsed: boolean;
  tabs: string[];
}

export interface SavedState {
  timestamp: number;
  groups: GroupSnapshot[];
}

const STORAGE_KEY = "tabGroupSnapshots";
const MAX_SNAPSHOTS = 10;
const SAVE_DEBOUNCE_MS = 3000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSaveSnapshot(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSnapshot();
  }, SAVE_DEBOUNCE_MS);
}

export async function saveSnapshot(): Promise<void> {
  try {
    const allGroups = await chrome.tabGroups.query({});
    const groups: GroupSnapshot[] = [];

    for (const group of allGroups) {
      const tabs = await chrome.tabs.query({ groupId: group.id });
      const urls = tabs.map((t) => t.url || t.pendingUrl || "chrome://newtab");
      groups.push({
        title: group.title || "",
        color: group.color,
        collapsed: group.collapsed,
        tabs: urls,
      });
    }

    // Deduplicate: same title+color groups across windows -> keep one with most tabs
    const deduped = new Map<string, GroupSnapshot>();
    for (const g of groups) {
      const key = `${g.title}|${g.color}`;
      const existing = deduped.get(key);
      if (!existing || g.tabs.length > existing.tabs.length) {
        deduped.set(key, g);
      }
    }

    const snapshot: SavedState = {
      timestamp: Date.now(),
      groups: [...deduped.values()],
    };

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const snapshots: SavedState[] = result[STORAGE_KEY] || [];

    snapshots.unshift(snapshot);
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.length = MAX_SNAPSHOTS;
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: snapshots });
    console.log("[TabGroupSync] Snapshot saved:", snapshot.groups.length, "groups");
  } catch (e) {
    console.error("[TabGroupSync] Snapshot save error:", e);
  }
}

export async function getSnapshots(): Promise<SavedState[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch (_) {
    return [];
  }
}

export async function deleteSnapshot(timestamp: number): Promise<void> {
  const snapshots = await getSnapshots();
  const filtered = snapshots.filter((s) => s.timestamp !== timestamp);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function restoreSnapshot(timestamp: number): Promise<{ success: boolean; groupCount: number }> {
  const snapshots = await getSnapshots();
  const snapshot = snapshots.find((s) => s.timestamp === timestamp);
  if (!snapshot) return { success: false, groupCount: 0 };

  try {
    // Get current window to restore into
    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    if (windows.length === 0) return { success: false, groupCount: 0 };
    const windowId = windows[0].id!;

    let restored = 0;
    for (const group of snapshot.groups) {
      const urls = group.tabs.length > 0 ? group.tabs : ["chrome://newtab"];
      const tabIds: number[] = [];

      for (const url of urls) {
        const tab = await chrome.tabs.create({ windowId, url, active: false });
        tabIds.push(tab.id!);
      }

      const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, {
        title: group.title,
        color: group.color as chrome.tabGroups.ColorEnum,
        collapsed: group.collapsed,
      });
      restored++;
    }

    return { success: true, groupCount: restored };
  } catch (e) {
    console.error("[TabGroupSync] Snapshot restore error:", e);
    return { success: false, groupCount: 0 };
  }
}
