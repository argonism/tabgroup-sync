// Entry point for the background service worker

import { groupMap, groupKey, registerGroup } from "./state";
import { loadSettings, currentSettings } from "./settings";
import { loadLocale } from "../shared/i18n";
import "./listeners";

async function initialize() {
  groupMap.clear();

  await loadLocale();
  await loadSettings();

  try {
    const allGroups = await chrome.tabGroups.query({});
    for (const group of allGroups) {
      const key = groupKey(group.title, group.color);
      registerGroup(group.id, group.windowId, key);
    }
    console.log(
      "[TabGroupSync] Initialized with",
      allGroups.length,
      "groups, mode:",
      currentSettings.mode
    );
  } catch (e) {
    console.error("[TabGroupSync] Init error:", e);
  }
}

initialize();
