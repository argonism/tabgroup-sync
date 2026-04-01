import { describe, it, expect, beforeEach, vi } from "vitest";
import { groupMap, groupWindowMap, registerGroup } from "../state";
import { currentSettings } from "../settings";
import { syncInProgress, tabSyncInProgress } from "../locks";
import { handleGroupUpdated, mirrorGroupToOtherWindows, createMirrorGroup } from "../group-sync";

beforeEach(() => {
  groupMap.clear();
  groupWindowMap.clear();
  syncInProgress.clear();
  tabSyncInProgress.clear();
  Object.assign(currentSettings, {
    enabled: true, mode: "all", matchBy: "title", list: [],
    syncProps: { title: true, color: true, collapsed: true, tabs: true, tabOrder: true },
  });
});

function fakeGroup(overrides: Partial<chrome.tabGroups.TabGroup> = {}): chrome.tabGroups.TabGroup {
  return {
    id: 100, windowId: 1, collapsed: false,
    title: "Work", color: "blue" as chrome.tabGroups.ColorEnum,
    ...overrides,
  } as chrome.tabGroups.TabGroup;
}

describe("createMirrorGroup", () => {
  it("creates a tab, groups it, and styles the group", async () => {
    const mockTab = { id: 50 };
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockTab);
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const newGroupId = await createMirrorGroup(2, "Work", "blue" as chrome.tabGroups.ColorEnum, false);

    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 2, url: "chrome://newtab", active: false });
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [50], createProperties: { windowId: 2 } });
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(500, expect.objectContaining({ title: "Work", color: "blue" }));
    expect(newGroupId).toBe(500);
  });

  it("copies source group tabs when tabs sync is on", async () => {
    const sourceTabs = [
      { id: 10, url: "https://a.com", pendingUrl: undefined },
      { id: 11, url: "https://b.com", pendingUrl: undefined },
    ];
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue(sourceTabs);
    (chrome.tabs.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: 50 })
      .mockResolvedValueOnce({ id: 51 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await createMirrorGroup(2, "Work", "blue" as chrome.tabGroups.ColorEnum, false, 100);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 2, url: "https://a.com", active: false });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ windowId: 2, url: "https://b.com", active: false });
    expect(chrome.tabs.group).toHaveBeenCalledWith({ tabIds: [50, 51], createProperties: { windowId: 2 } });
  });

  it("skips source tabs when tabs sync is off", async () => {
    currentSettings.syncProps.tabs = false;
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await createMirrorGroup(2, "Work", "blue" as chrome.tabGroups.ColorEnum, false, 100);

    // Should not query source tabs
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    // Should create single placeholder
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });

  it("registers the new group in state", async () => {
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await createMirrorGroup(2, "Work", "blue" as chrome.tabGroups.ColorEnum, false);

    expect(groupMap.get("Work|blue")?.has(500)).toBe(true);
    expect(groupWindowMap.get(500)).toBe(2);
  });
});

describe("mirrorGroupToOtherWindows", () => {
  it("creates mirrors in windows that don't have the group", async () => {
    registerGroup(100, 1, "Work|blue");
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1 }, { id: 2 }, { id: 3 },
    ]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const group = fakeGroup({ id: 100, windowId: 1 });
    await mirrorGroupToOtherWindows(group, "Work|blue");

    // Should create in window 2 and 3, not window 1
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    const createCalls = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.map((c: any) => c[0].windowId)).toEqual(expect.arrayContaining([2, 3]));
  });

  it("skips windows that already have the group", async () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1 }, { id: 2 }, { id: 3 },
    ]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const group = fakeGroup({ id: 100, windowId: 1 });
    await mirrorGroupToOtherWindows(group, "Work|blue");

    // Only window 3 needs a mirror
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect((chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0][0].windowId).toBe(3);
  });
});

describe("handleGroupUpdated", () => {
  it("updates siblings when key stays the same (collapsed change)", async () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const group = fakeGroup({ id: 100, windowId: 1, collapsed: true });
    await handleGroupUpdated(group);

    expect(chrome.tabGroups.update).toHaveBeenCalledWith(200, expect.objectContaining({ collapsed: true }));
  });

  it("updates siblings and re-registers when key changes", async () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.tabGroups.get as ReturnType<typeof vi.fn>).mockResolvedValue({ windowId: 2 });

    const group = fakeGroup({ id: 100, windowId: 1, title: "Dev", color: "red" as chrome.tabGroups.ColorEnum });
    await handleGroupUpdated(group);

    expect(chrome.tabGroups.update).toHaveBeenCalledWith(200, expect.objectContaining({ title: "Dev", color: "red" }));
    // Old key should be gone, new key should exist
    expect(groupMap.has("Work|blue")).toBe(false);
    expect(groupMap.get("Dev|red")?.has(100)).toBe(true);
    expect(groupMap.get("Dev|red")?.has(200)).toBe(true);
  });

  it("registers and mirrors a new group not yet tracked", async () => {
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 50 });
    (chrome.tabs.group as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const group = fakeGroup({ id: 100, windowId: 1 });
    await handleGroupUpdated(group);

    expect(groupMap.get("Work|blue")?.has(100)).toBe(true);
    // Should have mirrored to window 2
    expect(chrome.tabs.create).toHaveBeenCalled();
  });

  it("removes mirrors when group changes to non-sync", async () => {
    currentSettings.mode = "whitelist";
    currentSettings.matchBy = "title";
    currentSettings.list = [{ title: "Work" }];

    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 50 }]);
    (chrome.tabs.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // Rename from "Work" (in whitelist) to "Personal" (not in whitelist)
    const group = fakeGroup({ id: 100, windowId: 1, title: "Personal" });
    await handleGroupUpdated(group);

    expect(chrome.tabs.remove).toHaveBeenCalledWith([50]);
  });
});
