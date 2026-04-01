import { describe, it, expect, beforeEach, vi } from "vitest";
import { groupMap, groupWindowMap, registerGroup } from "../state";
import { currentSettings } from "../settings";
import { tabSyncInProgress, urlUpdateTimers } from "../locks";
import { handleTabUrlChanged } from "../tab-url-sync";

beforeEach(() => {
  groupMap.clear();
  groupWindowMap.clear();
  tabSyncInProgress.clear();
  for (const timer of urlUpdateTimers.values()) clearTimeout(timer);
  urlUpdateTimers.clear();
  Object.assign(currentSettings, {
    enabled: true, mode: "all", matchBy: "title", list: [],
    syncProps: { title: true, color: true, collapsed: true, tabs: true, tabOrder: true },
  });
});

describe("handleTabUrlChanged", () => {
  it("updates mirror tab at same position via chrome.tabs.update", async () => {
    vi.useFakeTimers();

    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");

    const tab = { id: 10, groupId: 100, url: "https://new.com" } as chrome.tabs.Tab;

    // After debounce, syncTabUrl queries source tab and source group tabs
    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 10, url: "https://new.com", groupId: 100,
    });
    // Source group tabs: tab 10 is at index 0
    (chrome.tabs.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 10, url: "https://new.com" }]) // source group
      .mockResolvedValueOnce([{ id: 60, url: "https://old.com" }]); // mirror group
    (chrome.tabs.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    handleTabUrlChanged(tab);
    await vi.advanceTimersByTimeAsync(500);

    expect(chrome.tabs.update).toHaveBeenCalledWith(60, { url: "https://new.com" });

    vi.useRealTimers();
  });

  it("does nothing when tabs sync is disabled", async () => {
    vi.useFakeTimers();
    currentSettings.syncProps.tabs = false;

    const tab = { id: 10, groupId: 100, url: "https://new.com" } as chrome.tabs.Tab;
    handleTabUrlChanged(tab);
    await vi.advanceTimersByTimeAsync(500);

    expect(chrome.tabs.get).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("debounces rapid URL changes", () => {
    vi.useFakeTimers();
    registerGroup(100, 1, "Work|blue");

    const tab1 = { id: 10, groupId: 100, url: "https://a.com" } as chrome.tabs.Tab;
    const tab2 = { id: 10, groupId: 100, url: "https://b.com" } as chrome.tabs.Tab;

    handleTabUrlChanged(tab1);
    handleTabUrlChanged(tab2);

    // Only one timer should exist for this tab
    expect(urlUpdateTimers.size).toBe(1);
    vi.useRealTimers();
  });

  it("skips update when mirror already has same URL", async () => {
    vi.useFakeTimers();

    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");

    const tab = { id: 10, groupId: 100, url: "https://same.com" } as chrome.tabs.Tab;

    (chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 10, url: "https://same.com", groupId: 100,
    });
    (chrome.tabs.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ id: 10, url: "https://same.com" }])
      .mockResolvedValueOnce([{ id: 60, url: "https://same.com" }]);

    handleTabUrlChanged(tab);
    await vi.advanceTimersByTimeAsync(500);

    expect(chrome.tabs.update).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
