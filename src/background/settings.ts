// Settings data and pure filter/build functions (no side effects)

import { DEFAULT_SYNC_PROPS } from "./constants";

export interface SyncProps {
  title: boolean;
  color: boolean;
  collapsed: boolean;
  tabs: boolean;
  tabOrder: boolean;
}

export interface ListEntry {
  title?: string;
  color?: string;
}

export interface Settings {
  enabled: boolean;
  mode: "all" | "whitelist" | "blacklist";
  matchBy: "title" | "color" | "both";
  list: ListEntry[];
  syncProps: SyncProps;
}

export const currentSettings: Settings = {
  enabled: true,
  mode: "all",
  matchBy: "title",
  list: [],
  syncProps: { ...DEFAULT_SYNC_PROPS },
};

function mergeSyncProps(saved?: Partial<SyncProps>): SyncProps {
  return { ...DEFAULT_SYNC_PROPS, ...(saved || {}) };
}

export function applySettings(source: Partial<Settings>): void {
  Object.assign(currentSettings, {
    enabled: true,
    mode: "all",
    matchBy: "title",
    list: [],
    syncProps: { ...DEFAULT_SYNC_PROPS },
    ...source,
  });
  currentSettings.syncProps = mergeSyncProps(source.syncProps);
}

export async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get("tabGroupSync");
    if (result.tabGroupSync) {
      applySettings(result.tabGroupSync as Partial<Settings>);
    }
  } catch (e) {
    console.error("[TabGroupSync] Failed to load settings:", e);
  }
}

export function shouldSyncGroup(title: string | undefined, color: string): boolean {
  if (currentSettings.enabled === false) return false;

  const { mode, matchBy, list } = currentSettings;

  if (mode === "all") return true;

  const matches = list.some((item) => {
    if (matchBy === "title") return item.title === (title || "");
    if (matchBy === "color") return item.color === color;
    return item.title === (title || "") && item.color === color;
  });

  return mode === "whitelist" ? matches : !matches;
}

export function buildGroupUpdateProps(group: chrome.tabGroups.TabGroup): chrome.tabGroups.UpdateProperties {
  const props: chrome.tabGroups.UpdateProperties = {};
  const sp = currentSettings.syncProps;
  if (sp.title) props.title = group.title;
  if (sp.color) props.color = group.color;
  if (sp.collapsed) props.collapsed = group.collapsed;
  return props;
}
