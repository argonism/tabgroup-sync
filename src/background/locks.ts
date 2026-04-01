// Sync lock state and lock operations (no constants, no side effects)

export const syncInProgress = new Set<number>();
export const tabSyncInProgress = new Set<number>();
export const windowSyncInProgress = new Set<number>();

export const updateTimers = new Map<number, ReturnType<typeof setTimeout>>();
export const tabSyncTimers = new Map<number, ReturnType<typeof setTimeout>>();
export const urlUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();

export let fullSyncRunning = false;

export function setFullSyncRunning(value: boolean): void {
  fullSyncRunning = value;
}

export async function withSyncLock<T>(groupId: number, operation: () => Promise<T>): Promise<T> {
  syncInProgress.add(groupId);
  try {
    return await operation();
  } finally {
    syncInProgress.delete(groupId);
  }
}

export async function withWindowLock<T>(windowId: number, operation: () => Promise<T>): Promise<T> {
  windowSyncInProgress.add(windowId);
  try {
    return await operation();
  } finally {
    windowSyncInProgress.delete(windowId);
  }
}

export function clearAllTimersAndLocks(): void {
  for (const timer of updateTimers.values()) clearTimeout(timer);
  updateTimers.clear();
  for (const timer of tabSyncTimers.values()) clearTimeout(timer);
  tabSyncTimers.clear();
  for (const timer of urlUpdateTimers.values()) clearTimeout(timer);
  urlUpdateTimers.clear();
  syncInProgress.clear();
  tabSyncInProgress.clear();
  windowSyncInProgress.clear();
}
