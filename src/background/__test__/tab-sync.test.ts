import { describe, it, expect, beforeEach, vi } from "vitest";
import { groupMap, groupWindowMap, registerGroup } from "../state";
import { currentSettings } from "../settings";
import { tabSyncInProgress, tabSyncTimers } from "../locks";
import { syncTabsForMirror, scheduleTabSync } from "../tab-sync";

beforeEach(() => {
  groupMap.clear();
  groupWindowMap.clear();
  tabSyncInProgress.clear();
  tabSyncTimers.clear();
  Object.assign(currentSettings, {
    enabled: true, mode: "all", matchBy: "title", list: [],
    syncProps: { title: true, color: true, collapsed: true, tabs: true, tabOrder: true },
  });
});

describe("syncTabsForMirror", () => {
  it("adds missing tabs to mirror", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await syncTabsForMirror(200, 2, ["https://a.com", "https://b.com"]);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 2, url: "https://a.com", active: false });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 2, url: "https://b.com", active: false });
  });

  it("removes excess tabs from mirror", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 50, url: "https://a.com" },
      { id: 51, url: "https://b.com" },
      { id: 52, url: "https://c.com" },
    ]);
    (chrome.tabs.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await syncTabsForMirror(200, 2, ["https://a.com"]);

    expect(chrome.tabs.remove).toHaveBeenCalledTimes(2);
    const removedIds = (chrome.tabs.remove as ReturnType<typeof vi.fn>).mock.calls.map((c: any) => c[0]);
    expect(removedIds).toEqual(expect.arrayContaining([51, 52]));
  });

  it("does nothing when urls match exactly", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 50, url: "https://a.com", index: 0 },
      { id: 51, url: "https://b.com", index: 1 },
    ]);

    await syncTabsForMirror(200, 2, ["https://a.com", "https://b.com"]);

    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("handles duplicate URLs correctly", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 50, url: "https://a.com" },
    ]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 60 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Source has two of the same URL
    await syncTabsForMirror(200, 2, ["https://a.com", "https://a.com"]);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("skips tab add/remove when tabs sync is off", async () => {
    currentSettings.syncProps.tabs = false;
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 50, url: "https://old.com", index: 0 },
    ]);

    await syncTabsForMirror(200, 2, ["https://new.com"]);

    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
  });

  it("reorders tabs when tabOrder is on", async () => {
    // Mirror has B, A but source wants A, B
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 50, url: "https://b.com", index: 0 },
      { id: 51, url: "https://a.com", index: 1 },
    ]);
    (chrome.tabs.move as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await syncTabsForMirror(200, 2, ["https://a.com", "https://b.com"]);

    expect(chrome.tabs.move).toHaveBeenCalled();
  });

  it("skips reorder when tabOrder is off", async () => {
    currentSettings.syncProps.tabOrder = false;
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 50, url: "https://b.com", index: 0 },
      { id: 51, url: "https://a.com", index: 1 },
    ]);

    await syncTabsForMirror(200, 2, ["https://a.com", "https://b.com"]);

    expect(chrome.tabs.move).not.toHaveBeenCalled();
  });
});

describe("scheduleTabSync", () => {
  it("debounces calls for the same groupId", () => {
    vi.useFakeTimers();
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");

    scheduleTabSync(100);
    scheduleTabSync(100);
    scheduleTabSync(100);

    expect(tabSyncTimers.has(100)).toBe(true);
    vi.useRealTimers();
  });
});
