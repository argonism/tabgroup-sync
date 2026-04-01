import { describe, it, expect, beforeEach, vi } from "vitest";
import { groupMap, groupWindowMap, registerGroup } from "../state";
import { currentSettings } from "../settings";
import { syncInProgress, tabSyncInProgress, windowSyncInProgress } from "../locks";

// Capture the chrome mock BEFORE listeners.ts registers handlers
// (setup.ts has already assigned the initial chrome mock)
const initialChrome = (globalThis as any).chrome;

// Import listeners to register them (side effect - happens once)
import "../listeners";

// Extract registered listeners from the initial mock
function getListener(obj: { addListener: ReturnType<typeof vi.fn> }): (...args: any[]) => any {
  const calls = obj.addListener.mock.calls;
  if (!calls.length) throw new Error("No listener registered");
  return calls[0][0];
}

const handlers = {
  tabGroupCreated: getListener(initialChrome.tabGroups.onCreated),
  tabGroupRemoved: getListener(initialChrome.tabGroups.onRemoved),
  windowRemoved: getListener(initialChrome.windows.onRemoved),
  tabRemoved: getListener(initialChrome.tabs.onRemoved),
  onMessage: getListener(initialChrome.runtime.onMessage),
};

beforeEach(() => {
  groupMap.clear();
  groupWindowMap.clear();
  syncInProgress.clear();
  tabSyncInProgress.clear();
  windowSyncInProgress.clear();
  Object.assign(currentSettings, {
    enabled: true, mode: "all", matchBy: "title", list: [],
    syncProps: { title: true, color: true, collapsed: true, tabs: true, tabOrder: true },
  });
});

describe("tabGroups.onCreated listener", () => {
  it("registers the group in state", async () => {
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 1 }]);

    await handlers.tabGroupCreated({ id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false });

    expect(groupMap.get("Work|blue")?.has(100)).toBe(true);
    expect(groupWindowMap.get(100)).toBe(1);
  });

  it("skips when syncInProgress has the group", async () => {
    syncInProgress.add(100);

    await handlers.tabGroupCreated({ id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false });

    expect(groupMap.size).toBe(0);
  });

  it("skips when windowSyncInProgress has the window", async () => {
    windowSyncInProgress.add(1);

    await handlers.tabGroupCreated({ id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false });

    expect(groupMap.size).toBe(0);
  });
});

describe("tabGroups.onRemoved listener", () => {
  it("unregisters the group and removes siblings", async () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");

    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 50 }]);
    (chrome.tabs.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await handlers.tabGroupRemoved({ id: 100, windowId: 1, title: "Work", color: "blue", collapsed: false });

    expect(groupMap.has("Work|blue")).toBe(false);
    expect(chrome.tabs.remove).toHaveBeenCalledWith([50]);
  });

  it("skips when group is not tracked", async () => {
    await handlers.tabGroupRemoved({ id: 999, windowId: 1, title: "X", color: "red", collapsed: false });

    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });
});

describe("windows.onRemoved listener", () => {
  it("cleans up groups for closed window", () => {
    registerGroup(100, 5, "Work|blue");
    registerGroup(200, 5, "Dev|red");
    registerGroup(300, 6, "Other|green");

    handlers.windowRemoved(5);

    expect(groupWindowMap.has(100)).toBe(false);
    expect(groupWindowMap.has(200)).toBe(false);
    expect(groupWindowMap.has(300)).toBe(true);
  });
});

describe("tabs.onRemoved listener", () => {
  it("skips when window is closing", () => {
    handlers.tabRemoved(10, { isWindowClosing: true, windowId: 1 });
  });

  it("skips when tab is in tabSyncInProgress", () => {
    tabSyncInProgress.add(10);
    handlers.tabRemoved(10, { isWindowClosing: false, windowId: 1 });
  });
});

describe("runtime.onMessage listener", () => {
  it("handles getSyncStatus message", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");

    const sendResponse = vi.fn();
    handlers.onMessage({ type: "getSyncStatus" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      groups: [{ title: "Work", color: "blue", windowCount: 2 }],
    });
  });

  it("handles fullSync message", async () => {
    const sendResponse = vi.fn();

    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.tabGroups.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chrome.windows.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = handlers.onMessage({ type: "fullSync" }, {}, sendResponse);
    expect(result).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });
  });
});
