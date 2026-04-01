import { describe, it, expect, beforeEach, vi } from "vitest";
import { groupMap, groupWindowMap, registerGroup } from "../state";
import { currentSettings } from "../settings";
import { syncInProgress, tabSyncInProgress, setFullSyncRunning } from "../locks";
import { fullSync } from "../full-sync";

beforeEach(() => {
  groupMap.clear();
  groupWindowMap.clear();
  syncInProgress.clear();
  tabSyncInProgress.clear();
  setFullSyncRunning(false);
  Object.assign(currentSettings, {
    enabled: true, mode: "all", matchBy: "title", list: [],
    syncProps: { title: true, color: true, collapsed: true, tabs: true, tabOrder: true },
  });
});

describe("fullSync", () => {
  it("returns error when already running", async () => {
    setFullSyncRunning(true);
    const result = await fullSync();
    expect(result).toEqual({ success: false, error: "already running" });
    setFullSyncRunning(false);
  });

  it("creates mirrors in windows missing groups", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false },
    ]);
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1 }, { id: 2 },
    ]);
    // createMirrorGroup calls
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    // syncTabsForMirror - source tabs
    (chrome.tabs.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 10, url: "https://a.com" }]) // createMirrorGroup source tabs
      .mockResolvedValueOnce([{ id: 10, url: "https://a.com" }]) // syncGroupTabs source
      .mockResolvedValueOnce([{ id: 50, url: "https://a.com", index: 0 }]); // mirror tabs

    const result = await fullSync();

    expect(result.success).toBe(true);
    expect(result.groupCount).toBe(1);
    expect(chrome.tabs.create).toHaveBeenCalled();
  });

  it("skips non-sync groups in whitelist mode", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSync: { mode: "whitelist", matchBy: "title", list: [{ title: "Work" }] },
    });
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Personal", color: "red", collapsed: false },
    ]);
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1 }, { id: 2 },
    ]);

    const result = await fullSync();

    expect(result.success).toBe(true);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("does nothing when no groups exist", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);

    const result = await fullSync();

    expect(result.success).toBe(true);
    expect(result.groupCount).toBe(0);
  });

  it("clears internal state before rebuilding", async () => {
    registerGroup(999, 5, "Old|grey");
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await fullSync();

    expect(groupMap.size).toBe(0);
    expect(groupWindowMap.size).toBe(0);
  });

  it("syncs tab content for existing siblings", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false },
      { id: 200, windowId: 2, title: "Work", color: "blue", collapsed: false },
    ]);
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    // syncTabsForMirror: source tabs then mirror tabs
    (chrome.tabs.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 10, url: "https://a.com" }])
      .mockResolvedValueOnce([{ id: 60, url: "https://a.com", index: 0 }]);

    const result = await fullSync();

    expect(result.success).toBe(true);
    expect(result.groupCount).toBe(1);
    // No new tabs created because both windows already have the group
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
