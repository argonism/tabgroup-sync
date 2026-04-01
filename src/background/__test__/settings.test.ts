import { describe, it, expect, beforeEach, vi } from "vitest";
import { currentSettings, shouldSyncGroup, buildGroupUpdateProps, loadSettings } from "../settings";
import type { Settings } from "../settings";

function resetSettings(overrides: Partial<Settings> = {}): void {
  Object.assign(currentSettings, {
    enabled: true,
    mode: "all",
    matchBy: "title",
    list: [],
    syncProps: { title: true, color: true, collapsed: true, tabs: true, tabOrder: true },
    ...overrides,
  });
}

beforeEach(() => {
  resetSettings();
});

describe("shouldSyncGroup", () => {
  describe("enabled flag", () => {
    it("returns false when disabled", () => {
      resetSettings({ enabled: false });
      expect(shouldSyncGroup("Work", "blue")).toBe(false);
    });

    it("returns true when enabled in all mode", () => {
      expect(shouldSyncGroup("Work", "blue")).toBe(true);
    });
  });

  describe("all mode", () => {
    it("returns true for any group", () => {
      expect(shouldSyncGroup("Work", "blue")).toBe(true);
      expect(shouldSyncGroup("", "red")).toBe(true);
      expect(shouldSyncGroup(undefined, "green")).toBe(true);
    });
  });

  describe("whitelist mode", () => {
    describe("matchBy title", () => {
      beforeEach(() => {
        resetSettings({
          mode: "whitelist",
          matchBy: "title",
          list: [{ title: "Work" }, { title: "Dev" }],
        });
      });

      it("returns true for listed title", () => {
        expect(shouldSyncGroup("Work", "blue")).toBe(true);
        expect(shouldSyncGroup("Dev", "red")).toBe(true);
      });

      it("returns false for unlisted title", () => {
        expect(shouldSyncGroup("Personal", "blue")).toBe(false);
      });

      it("handles untitled groups", () => {
        resetSettings({ mode: "whitelist", matchBy: "title", list: [{ title: "" }] });
        expect(shouldSyncGroup("", "blue")).toBe(true);
        expect(shouldSyncGroup(undefined, "blue")).toBe(true);
        expect(shouldSyncGroup("Work", "blue")).toBe(false);
      });
    });

    describe("matchBy color", () => {
      beforeEach(() => {
        resetSettings({
          mode: "whitelist",
          matchBy: "color",
          list: [{ color: "blue" }],
        });
      });

      it("returns true for listed color", () => {
        expect(shouldSyncGroup("Anything", "blue")).toBe(true);
      });

      it("returns false for unlisted color", () => {
        expect(shouldSyncGroup("Anything", "red")).toBe(false);
      });
    });

    describe("matchBy both", () => {
      beforeEach(() => {
        resetSettings({
          mode: "whitelist",
          matchBy: "both",
          list: [{ title: "Work", color: "blue" }],
        });
      });

      it("returns true only when both match", () => {
        expect(shouldSyncGroup("Work", "blue")).toBe(true);
        expect(shouldSyncGroup("Work", "red")).toBe(false);
        expect(shouldSyncGroup("Dev", "blue")).toBe(false);
      });
    });
  });

  describe("blacklist mode", () => {
    beforeEach(() => {
      resetSettings({
        mode: "blacklist",
        matchBy: "title",
        list: [{ title: "Personal" }],
      });
    });

    it("returns false for listed title", () => {
      expect(shouldSyncGroup("Personal", "blue")).toBe(false);
    });

    it("returns true for unlisted title", () => {
      expect(shouldSyncGroup("Work", "blue")).toBe(true);
    });
  });
});

describe("buildGroupUpdateProps", () => {
  const fakeGroup = {
    id: 1, windowId: 1, collapsed: true,
    title: "Work", color: "blue" as chrome.tabGroups.ColorEnum,
  } as chrome.tabGroups.TabGroup;

  it("includes all props when all enabled", () => {
    const props = buildGroupUpdateProps(fakeGroup);
    expect(props).toEqual({ title: "Work", color: "blue", collapsed: true });
  });

  it("excludes title when disabled", () => {
    resetSettings({ syncProps: { ...currentSettings.syncProps, title: false } });
    const props = buildGroupUpdateProps(fakeGroup);
    expect(props.title).toBeUndefined();
    expect(props.color).toBe("blue");
  });

  it("excludes color when disabled", () => {
    resetSettings({ syncProps: { ...currentSettings.syncProps, color: false } });
    const props = buildGroupUpdateProps(fakeGroup);
    expect(props.color).toBeUndefined();
  });

  it("excludes collapsed when disabled", () => {
    resetSettings({ syncProps: { ...currentSettings.syncProps, collapsed: false } });
    const props = buildGroupUpdateProps(fakeGroup);
    expect(props.collapsed).toBeUndefined();
  });

  it("returns empty object when all disabled", () => {
    resetSettings({ syncProps: { title: false, color: false, collapsed: false, tabs: true, tabOrder: true } });
    const props = buildGroupUpdateProps(fakeGroup);
    expect(Object.keys(props)).toHaveLength(0);
  });
});

describe("loadSettings", () => {
  it("loads settings from chrome.storage.sync", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSync: { mode: "whitelist", matchBy: "color", list: [{ color: "red" }] },
    });
    await loadSettings();
    expect(currentSettings.mode).toBe("whitelist");
    expect(currentSettings.matchBy).toBe("color");
    expect(currentSettings.list).toEqual([{ color: "red" }]);
  });

  it("keeps defaults when storage is empty", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await loadSettings();
    expect(currentSettings.mode).toBe("all");
    expect(currentSettings.enabled).toBe(true);
  });

  it("merges syncProps with defaults", async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      tabGroupSync: { syncProps: { collapsed: false } },
    });
    await loadSettings();
    expect(currentSettings.syncProps.collapsed).toBe(false);
    expect(currentSettings.syncProps.title).toBe(true);
    expect(currentSettings.syncProps.tabs).toBe(true);
  });
});
