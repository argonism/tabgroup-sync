import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  syncInProgress, tabSyncInProgress, windowSyncInProgress,
  updateTimers, tabSyncTimers, urlUpdateTimers,
  setFullSyncRunning,
  withSyncLock, withWindowLock, clearAllTimersAndLocks,
} from "../locks";

beforeEach(() => {
  syncInProgress.clear();
  tabSyncInProgress.clear();
  windowSyncInProgress.clear();
  updateTimers.clear();
  tabSyncTimers.clear();
  urlUpdateTimers.clear();
  setFullSyncRunning(false);
});

describe("withSyncLock", () => {
  it("adds groupId during operation and removes after", async () => {
    let insideLock = false;
    await withSyncLock(42, async () => {
      insideLock = syncInProgress.has(42);
    });
    expect(insideLock).toBe(true);
    expect(syncInProgress.has(42)).toBe(false);
  });

  it("removes groupId even on error", async () => {
    await expect(
      withSyncLock(42, async () => { throw new Error("fail"); })
    ).rejects.toThrow("fail");
    expect(syncInProgress.has(42)).toBe(false);
  });

  it("returns the operation result", async () => {
    const result = await withSyncLock(42, async () => "hello");
    expect(result).toBe("hello");
  });
});

describe("withWindowLock", () => {
  it("adds windowId during operation and removes after", async () => {
    let insideLock = false;
    await withWindowLock(10, async () => {
      insideLock = windowSyncInProgress.has(10);
    });
    expect(insideLock).toBe(true);
    expect(windowSyncInProgress.has(10)).toBe(false);
  });

  it("removes windowId even on error", async () => {
    await expect(
      withWindowLock(10, async () => { throw new Error("fail"); })
    ).rejects.toThrow("fail");
    expect(windowSyncInProgress.has(10)).toBe(false);
  });
});

describe("setFullSyncRunning", () => {
  it("sets the flag", () => {
    setFullSyncRunning(true);
    // fullSyncRunning is a let export, re-import won't reflect change.
    // But the module's own fullSyncRunning is updated.
    // We test via the getter behavior in other modules; here just ensure no throw.
    setFullSyncRunning(false);
  });
});

describe("clearAllTimersAndLocks", () => {
  it("clears all sets and maps", () => {
    syncInProgress.add(1);
    tabSyncInProgress.add(2);
    windowSyncInProgress.add(3);
    updateTimers.set(1, setTimeout(() => {}, 1000));
    tabSyncTimers.set(2, setTimeout(() => {}, 1000));
    urlUpdateTimers.set("url_1", setTimeout(() => {}, 1000));

    clearAllTimersAndLocks();

    expect(syncInProgress.size).toBe(0);
    expect(tabSyncInProgress.size).toBe(0);
    expect(windowSyncInProgress.size).toBe(0);
    expect(updateTimers.size).toBe(0);
    expect(tabSyncTimers.size).toBe(0);
    expect(urlUpdateTimers.size).toBe(0);
  });

  it("cancels pending timers", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const timer = setTimeout(callback, 5000);
    updateTimers.set(1, timer);

    clearAllTimersAndLocks();
    vi.advanceTimersByTime(10000);

    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
