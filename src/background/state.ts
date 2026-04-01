// Group state management

// groupKey -> Set<groupId>
export const groupMap = new Map<string, Set<number>>();
// groupId -> windowId
export const groupWindowMap = new Map<number, number>();

export function groupKey(title: string | undefined, color: string): string {
  return `${title || ""}|${color}`;
}

export function parseGroupKey(key: string): { title: string; color: string } {
  const idx = key.lastIndexOf("|");
  return { title: key.slice(0, idx), color: key.slice(idx + 1) };
}

export function registerGroup(groupId: number, windowId: number, key: string): void {
  if (!groupMap.has(key)) {
    groupMap.set(key, new Set());
  }
  groupMap.get(key)!.add(groupId);
  groupWindowMap.set(groupId, windowId);
}

export function unregisterGroup(groupId: number): number | undefined {
  const windowId = groupWindowMap.get(groupId);
  groupWindowMap.delete(groupId);
  for (const [key, ids] of groupMap) {
    if (ids.has(groupId)) {
      ids.delete(groupId);
      if (ids.size === 0) {
        groupMap.delete(key);
      }
      break;
    }
  }
  return windowId;
}

export function findKeyForGroup(groupId: number): string | null {
  for (const [key, ids] of groupMap) {
    if (ids.has(groupId)) return key;
  }
  return null;
}

export function getSiblingGroupIds(groupId: number, key: string): number[] {
  const ids = groupMap.get(key);
  if (!ids) return [];
  return [...ids].filter((id) => id !== groupId);
}

export interface SyncStatusEntry {
  title: string;
  color: string;
  windowCount: number;
}

export function getSyncStatus(): SyncStatusEntry[] {
  const groups: SyncStatusEntry[] = [];
  for (const [key, ids] of groupMap) {
    const { title, color } = parseGroupKey(key);
    const windows = new Set<number>();
    for (const gId of ids) {
      const wId = groupWindowMap.get(gId);
      if (wId) windows.add(wId);
    }
    groups.push({ title: title || "(無題)", color, windowCount: windows.size });
  }
  return groups;
}
