// Shared constants

import type { SyncProps } from "./settings";

export const DEBOUNCE_MS = 300;
export const TAB_SYNC_DEBOUNCE_MS = 500;
export const URL_UPDATE_DEBOUNCE_MS = 300;

export const DEFAULT_SYNC_PROPS: SyncProps = {
  title: true,
  color: true,
  collapsed: true,
  tabs: true,
  tabOrder: true,
};
