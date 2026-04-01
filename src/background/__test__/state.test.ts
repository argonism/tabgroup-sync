import { describe, it, expect, beforeEach } from "vitest";
import {
  groupMap, groupWindowMap,
  groupKey, parseGroupKey,
  registerGroup, unregisterGroup, getSyncStatus,
  findKeyForGroup, getSiblingGroupIds,
} from "../state";

beforeEach(() => {
  groupMap.clear();
  groupWindowMap.clear();
});

describe("groupKey", () => {
  it("combines title and color", () => {
    expect(groupKey("Work", "blue")).toBe("Work|blue");
  });

  it("handles undefined title", () => {
    expect(groupKey(undefined, "red")).toBe("|red");
  });

  it("handles empty title", () => {
    expect(groupKey("", "green")).toBe("|green");
  });

  it("handles title containing pipe", () => {
    expect(groupKey("A|B", "blue")).toBe("A|B|blue");
  });
});

describe("parseGroupKey", () => {
  it("splits key into title and color", () => {
    expect(parseGroupKey("Work|blue")).toEqual({ title: "Work", color: "blue" });
  });

  it("handles empty title", () => {
    expect(parseGroupKey("|red")).toEqual({ title: "", color: "red" });
  });

  it("handles title containing pipe", () => {
    expect(parseGroupKey("A|B|blue")).toEqual({ title: "A|B", color: "blue" });
  });
});

describe("groupKey / parseGroupKey roundtrip", () => {
  it("roundtrips normal values", () => {
    const key = groupKey("Dev", "purple");
    const parsed = parseGroupKey(key);
    expect(parsed).toEqual({ title: "Dev", color: "purple" });
  });

  it("roundtrips empty title", () => {
    const key = groupKey("", "cyan");
    const parsed = parseGroupKey(key);
    expect(parsed).toEqual({ title: "", color: "cyan" });
  });
});

describe("registerGroup", () => {
  it("adds group to maps", () => {
    registerGroup(100, 1, "Work|blue");
    expect(groupMap.get("Work|blue")?.has(100)).toBe(true);
    expect(groupWindowMap.get(100)).toBe(1);
  });

  it("adds multiple groups to same key", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    const ids = groupMap.get("Work|blue")!;
    expect(ids.size).toBe(2);
    expect(ids.has(100)).toBe(true);
    expect(ids.has(200)).toBe(true);
  });

  it("handles different keys", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Dev|red");
    expect(groupMap.size).toBe(2);
  });
});

describe("unregisterGroup", () => {
  it("removes group and returns windowId", () => {
    registerGroup(100, 1, "Work|blue");
    const windowId = unregisterGroup(100);
    expect(windowId).toBe(1);
    expect(groupWindowMap.has(100)).toBe(false);
    expect(groupMap.has("Work|blue")).toBe(false);
  });

  it("keeps key if other groups remain", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    unregisterGroup(100);
    expect(groupMap.get("Work|blue")?.has(200)).toBe(true);
    expect(groupMap.get("Work|blue")?.size).toBe(1);
  });

  it("returns undefined for unknown group", () => {
    const windowId = unregisterGroup(999);
    expect(windowId).toBeUndefined();
  });
});

describe("findKeyForGroup", () => {
  it("returns the key for a registered group", () => {
    registerGroup(100, 1, "Work|blue");
    expect(findKeyForGroup(100)).toBe("Work|blue");
  });

  it("returns null for unknown group", () => {
    expect(findKeyForGroup(999)).toBeNull();
  });
});

describe("getSiblingGroupIds", () => {
  it("returns other group IDs with same key", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    registerGroup(300, 3, "Work|blue");
    const siblings = getSiblingGroupIds(100, "Work|blue");
    expect(siblings).toEqual(expect.arrayContaining([200, 300]));
    expect(siblings).not.toContain(100);
  });

  it("returns empty for solo group", () => {
    registerGroup(100, 1, "Work|blue");
    expect(getSiblingGroupIds(100, "Work|blue")).toEqual([]);
  });

  it("returns empty for unknown key", () => {
    expect(getSiblingGroupIds(100, "Unknown|key")).toEqual([]);
  });
});

describe("getSyncStatus", () => {
  it("returns empty array when no groups", () => {
    expect(getSyncStatus()).toEqual([]);
  });

  it("returns group info with window count", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 2, "Work|blue");
    const status = getSyncStatus();
    expect(status).toEqual([{ title: "Work", color: "blue", windowCount: 2 }]);
  });

  it("returns multiple groups", () => {
    registerGroup(100, 1, "Work|blue");
    registerGroup(200, 1, "Dev|red");
    const status = getSyncStatus();
    expect(status).toHaveLength(2);
    expect(status).toEqual(expect.arrayContaining([
      { title: "Work", color: "blue", windowCount: 1 },
      { title: "Dev", color: "red", windowCount: 1 },
    ]));
  });

  it("uses i18n untitled message for untitled groups", () => {
    registerGroup(100, 1, "|green");
    const status = getSyncStatus();
    // i18n mock returns the key itself
    expect(status[0].title).toBe("untitled");
  });
});
