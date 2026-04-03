import { describe, it, expect, beforeEach, vi } from "vitest";
import { saveSnapshot, getSnapshots, restoreSnapshot, deleteSnapshot, scheduleSaveSnapshot } from "../snapshot";

beforeEach(() => {
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("saveSnapshot", () => {
  it("saves current tab groups to storage.local", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false },
    ]);
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 10, url: "https://a.com" },
      { id: 11, url: "https://b.com" },
    ]);

    await saveSnapshot();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        tabGroupSnapshots: expect.arrayContaining([
          expect.objectContaining({
            groups: [{ title: "Work", color: "blue", collapsed: false, tabs: ["https://a.com", "https://b.com"] }],
          }),
        ]),
      })
    );
  });

  it("deduplicates groups with same title+color across windows", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false },
      { id: 200, windowId: 2, title: "Work", color: "blue", collapsed: false },
    ]);
    (chrome.tabs.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 10, url: "https://a.com" }, { id: 11, url: "https://b.com" }])
      .mockResolvedValueOnce([{ id: 20, url: "https://a.com" }]);

    await saveSnapshot();

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const snapshot = call.tabGroupSnapshots[0];
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0].tabs).toHaveLength(2);
  });

  it("limits to 10 snapshots", async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      timestamp: i,
      groups: [],
    }));
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: existing,
    });
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await saveSnapshot();

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots).toHaveLength(10);
    expect(call.tabGroupSnapshots[0].timestamp).toBeGreaterThan(9);
  });

  it("saves empty groups array when no tab groups exist", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await saveSnapshot();

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots[0].groups).toEqual([]);
  });

  it("handles API error gracefully", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("API error"));

    await saveSnapshot();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("uses pendingUrl when url is missing", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false },
    ]);
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 10, pendingUrl: "https://loading.com" },
    ]);

    await saveSnapshot();

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots[0].groups[0].tabs).toEqual(["https://loading.com"]);
  });

  it("falls back to chrome://newtab when both url and pendingUrl are missing", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false },
    ]);
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 10 },
    ]);

    await saveSnapshot();

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots[0].groups[0].tabs).toEqual(["chrome://newtab"]);
  });

  it("uses empty string for untitled groups", async () => {
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 100, windowId: 1, title: undefined, color: "grey", collapsed: false },
    ]);
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await saveSnapshot();

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots[0].groups[0].title).toBe("");
  });
});

describe("getSnapshots", () => {
  it("returns empty array when no snapshots", async () => {
    const result = await getSnapshots();
    expect(result).toEqual([]);
  });

  it("returns stored snapshots", async () => {
    const stored = [{ timestamp: 123, groups: [] }];
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: stored,
    });
    const result = await getSnapshots();
    expect(result).toEqual(stored);
  });

  it("returns empty array on storage error", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fail"));
    const result = await getSnapshots();
    expect(result).toEqual([]);
  });
});

describe("deleteSnapshot", () => {
  it("removes snapshot by timestamp", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [
        { timestamp: 100, groups: [] },
        { timestamp: 200, groups: [] },
      ],
    });

    await deleteSnapshot(100);

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots).toHaveLength(1);
    expect(call.tabGroupSnapshots[0].timestamp).toBe(200);
  });

  it("does nothing for non-existent timestamp", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [{ timestamp: 100, groups: [] }],
    });

    await deleteSnapshot(999);

    const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tabGroupSnapshots).toHaveLength(1);
  });
});

describe("restoreSnapshot", () => {
  it("creates tab groups from snapshot in first window", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [{
        timestamp: 123,
        groups: [
          { title: "Work", color: "blue", collapsed: false, tabs: ["https://a.com", "https://b.com"] },
        ],
      }],
    });
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 50 })
      .mockResolvedValueOnce({ id: 51 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await restoreSnapshot(123);

    expect(result).toEqual({ success: true, groupCount: 1 });
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [50, 51], createProperties: { windowId: 1 } });
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(500, {
      title: "Work", color: "blue", collapsed: false,
    });
  });

  it("returns failure for unknown timestamp", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [],
    });

    const result = await restoreSnapshot(999);
    expect(result).toEqual({ success: false, groupCount: 0 });
  });

  it("restores multiple groups", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [{
        timestamp: 123,
        groups: [
          { title: "Work", color: "blue", collapsed: false, tabs: ["https://a.com"] },
          { title: "Dev", color: "red", collapsed: true, tabs: ["https://b.com"] },
        ],
      }],
    });
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await restoreSnapshot(123);

    expect(result).toEqual({ success: true, groupCount: 2 });
    expect(chrome.tabs.group).toHaveBeenCalledTimes(2);
    expect(chrome.tabGroups.update).toHaveBeenCalledTimes(2);
  });

  it("returns failure when no windows are open", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [{
        timestamp: 123,
        groups: [{ title: "Work", color: "blue", collapsed: false, tabs: ["https://a.com"] }],
      }],
    });
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await restoreSnapshot(123);

    expect(result).toEqual({ success: false, groupCount: 0 });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("creates placeholder tab for groups with empty tabs", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [{
        timestamp: 123,
        groups: [{ title: "Empty", color: "grey", collapsed: false, tabs: [] }],
      }],
    });
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await restoreSnapshot(123);

    expect(result).toEqual({ success: true, groupCount: 1 });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      windowId: 1, url: "chrome://newtab", active: false,
    });
  });

  it("returns failure on API error", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSnapshots: [{
        timestamp: 123,
        groups: [{ title: "Work", color: "blue", collapsed: false, tabs: ["https://a.com"] }],
      }],
    });
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fail"));

    const result = await restoreSnapshot(123);

    expect(result).toEqual({ success: false, groupCount: 0 });
  });
});

describe("scheduleSaveSnapshot", () => {
  it("debounces multiple calls", async () => {
    vi.useFakeTimers();

    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    scheduleSaveSnapshot();
    scheduleSaveSnapshot();
    scheduleSaveSnapshot();

    // Nothing saved yet
    expect(chrome.tabGroups.query).not.toHaveBeenCalled();

    // Advance past debounce (3000ms)
    await vi.advanceTimersByTimeAsync(3000);

    // Only one save
    expect(chrome.tabGroups.query).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("resets timer on subsequent calls", async () => {
    vi.useFakeTimers();

    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    scheduleSaveSnapshot();
    await vi.advanceTimersByTimeAsync(2000);

    // Call again before 3s - should reset timer
    scheduleSaveSnapshot();
    await vi.advanceTimersByTimeAsync(2000);

    // Only 4s total, but timer was reset at 2s, so 2s after reset = not yet
    expect(chrome.tabGroups.query).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    // 3s after the reset - now it fires
    expect(chrome.tabGroups.query).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
