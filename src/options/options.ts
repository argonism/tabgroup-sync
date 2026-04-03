interface SyncProps {
  title: boolean;
  color: boolean;
  collapsed: boolean;
  tabs: boolean;
  tabOrder: boolean;
  [key: string]: boolean;
}

interface ListEntry {
  title?: string;
  color?: string;
}

interface Settings {
  enabled: boolean;
  mode: string;
  matchBy: string;
  list: ListEntry[];
  syncProps: SyncProps;
}

// --- i18n ---
import { msg, loadLocale, saveLocale, getLocale, AVAILABLE_LOCALES } from "../shared/i18n";
import type { Locale } from "../shared/i18n";

function localizeDOM(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n!;
    if (el.tagName === "TITLE") {
      document.title = msg(key);
    } else {
      el.textContent = msg(key);
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholder!;
    (el as HTMLInputElement).placeholder = msg(key);
  }
}

// --- Constants ---
const COLOR_MAP: Record<string, string> = {
  grey: "#5f6368",
  blue: "#4285f4",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#188038",
  pink: "#e91e63",
  purple: "#9334e6",
  cyan: "#00acc1",
  orange: "#fa903e",
};

const DEFAULT_SYNC_PROPS: SyncProps = {
  title: true,
  color: true,
  collapsed: true,
  tabs: true,
  tabOrder: true,
};

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "all",
  matchBy: "title",
  list: [],
  syncProps: { ...DEFAULT_SYNC_PROPS },
};

// --- Heading Icon Hover ---
const headingIcon = document.getElementById("headingIcon") as HTMLImageElement;
headingIcon.addEventListener("mouseenter", () => { headingIcon.src = "icons/icon_2.48.png"; });
headingIcon.addEventListener("mouseleave", () => { headingIcon.src = "icons/icon48.png"; });

// --- DOM ---
const modeRadios = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
const matchByRadios = document.querySelectorAll<HTMLInputElement>('input[name="matchBy"]');
const listSection = document.getElementById("listSection")!;
const listTitle = document.getElementById("listTitle")!;
const listItems = document.getElementById("listItems")!;
const inputTitle = document.getElementById("inputTitle") as HTMLInputElement;
const inputColor = document.getElementById("inputColor") as HTMLSelectElement;
const addBtn = document.getElementById("addBtn") as HTMLButtonElement;
const toast = document.getElementById("toast")!;
const syncPropCheckboxes = document.querySelectorAll<HTMLInputElement>('input[name="syncProp"]');
const enabledToggle = document.getElementById("enabledToggle") as HTMLInputElement;
const syncBtn = document.getElementById("syncBtn") as HTMLButtonElement;
const syncStatusBar = document.getElementById("syncStatusBar")!;

let settings: Settings = { ...DEFAULT_SETTINGS };

// --- Load / Save ---
async function loadSettings(): Promise<void> {
  const result = await chrome.storage.sync.get("tabGroupSync");
  if (result.tabGroupSync) {
    settings = { ...DEFAULT_SETTINGS, ...result.tabGroupSync };
    settings.syncProps = { ...DEFAULT_SYNC_PROPS, ...(result.tabGroupSync.syncProps || {}) };
  }
  applyToUI();
}

async function saveSettings(): Promise<void> {
  await chrome.storage.sync.set({ tabGroupSync: settings });
  showToast(msg("settingsSaved"));
}

// --- UI ---
function applyToUI(): void {
  enabledToggle.checked = settings.enabled !== false;
  for (const radio of modeRadios) {
    radio.checked = radio.value === settings.mode;
  }
  for (const radio of matchByRadios) {
    radio.checked = radio.value === settings.matchBy;
  }
  for (const cb of syncPropCheckboxes) {
    cb.checked = settings.syncProps[cb.value] !== false;
  }
  updateListVisibility();
  renderList();
}

function updateListVisibility(): void {
  const isList = settings.mode === "whitelist" || settings.mode === "blacklist";
  listSection.classList.toggle("visible", isList);
  if (settings.mode === "whitelist") {
    listTitle.textContent = msg("listTitleWhitelist");
  } else if (settings.mode === "blacklist") {
    listTitle.textContent = msg("listTitleBlacklist");
  }
  updateInputVisibility();
}

function updateInputVisibility(): void {
  const matchBy = settings.matchBy;
  inputTitle.style.display = matchBy === "color" ? "none" : "";
  inputColor.style.display = matchBy === "title" ? "none" : "";
  inputTitle.placeholder =
    matchBy === "both" ? msg("inputGroupNameShort") : msg("inputGroupName");
}

function renderList(): void {
  if (settings.list.length === 0) {
    listItems.innerHTML = `<div class="empty-state">${escapeHtml(msg("listEmpty"))}</div>`;
    return;
  }

  listItems.innerHTML = settings.list
    .map((item, i) => {
      const colorDot = item.color
        ? `<span class="color-dot" style="background:${COLOR_MAP[item.color] || "#999"}"></span>`
        : "";
      const label = [item.title, item.color].filter(Boolean).join(" / ");
      return `
      <div class="list-item">
        <div class="item-info">
          ${colorDot}
          <span>${escapeHtml(label)}</span>
        </div>
        <button class="btn btn-danger" data-index="${i}">${escapeHtml(msg("delete"))}</button>
      </div>`;
    })
    .join("");

  for (const btn of listItems.querySelectorAll<HTMLButtonElement>(".btn-danger")) {
    btn.addEventListener("click", (e) => {
      const idx = parseInt((e.currentTarget as HTMLButtonElement).dataset.index!);
      settings.list.splice(idx, 1);
      saveSettings();
      renderList();
    });
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// --- Events ---
for (const radio of modeRadios) {
  radio.addEventListener("change", () => {
    settings.mode = radio.value;
    updateListVisibility();
    saveSettings();
  });
}

for (const radio of matchByRadios) {
  radio.addEventListener("change", () => {
    settings.matchBy = radio.value;
    updateInputVisibility();
    saveSettings();
  });
}

for (const cb of syncPropCheckboxes) {
  cb.addEventListener("change", () => {
    settings.syncProps[cb.value] = cb.checked;
    saveSettings();
  });
}

addBtn.addEventListener("click", () => {
  const title = inputTitle.value.trim();
  const color = inputColor.value;
  const matchBy = settings.matchBy;

  if (matchBy === "title" && !title) {
    showToast(msg("enterGroupName"));
    return;
  }
  if (matchBy === "color" && !color) {
    showToast(msg("selectColor"));
    return;
  }
  if (matchBy === "both" && !title && !color) {
    showToast(msg("enterGroupNameOrColor"));
    return;
  }

  const entry: ListEntry = {};
  if (matchBy !== "color") entry.title = title;
  if (matchBy !== "title") entry.color = color;

  const isDup = settings.list.some(
    (item) => item.title === entry.title && item.color === entry.color
  );
  if (isDup) {
    showToast(msg("duplicateEntry"));
    return;
  }

  settings.list.push(entry);
  saveSettings();
  renderList();
  inputTitle.value = "";
  inputColor.value = "";
});

inputTitle.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

// --- Enable Toggle ---
enabledToggle.addEventListener("change", () => {
  settings.enabled = enabledToggle.checked;
  saveSettings();
});

// --- Full Sync Button ---
syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncStatusBar.textContent = msg("syncing");

  try {
    const result = await chrome.runtime.sendMessage({ type: "fullSync" });
    if (result && result.success) {
      syncStatusBar.textContent = msg("syncComplete", String(result.groupCount));
      showToast(msg("syncCompleteToast"));
      refreshSyncStatus();
    } else if (result && result.error === "already running") {
      syncStatusBar.textContent = msg("syncAlreadyRunning");
      showToast(msg("syncAlreadyRunning"));
    } else {
      syncStatusBar.textContent = msg("syncError");
      showToast(msg("syncFailed"));
    }
  } catch (_) {
    syncStatusBar.textContent = msg("syncError");
    showToast(msg("syncFailed"));
  } finally {
    syncBtn.disabled = false;
    setTimeout(() => { syncStatusBar.textContent = ""; }, 5000);
  }
});

// --- Sync Status Display ---
const syncGroupList = document.getElementById("syncGroupList")!;

async function refreshSyncStatus(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: "getSyncStatus" });
    if (!result || !result.groups) {
      syncGroupList.innerHTML = `<div class="empty-state">${escapeHtml(msg("fetchError"))}</div>`;
      return;
    }
    const groups = result.groups as { title: string; color: string; windowCount: number }[];
    if (groups.length === 0) {
      syncGroupList.innerHTML = `<div class="empty-state">${escapeHtml(msg("noSyncingGroups"))}</div>`;
      return;
    }
    syncGroupList.innerHTML = groups.map((g) => `
      <div class="sync-group-item">
        <span class="group-color" style="background:${COLOR_MAP[g.color] || "#999"}"></span>
        <span class="group-name">${escapeHtml(g.title || msg("untitled"))}</span>
        <span class="group-windows">${escapeHtml(msg("windowCount", String(g.windowCount)))}</span>
      </div>
    `).join("");
  } catch (_) {
    syncGroupList.innerHTML = `<div class="empty-state">${escapeHtml(msg("fetchError"))}</div>`;
  }
}

// --- Language Selector ---
const langSelect = document.getElementById("langSelect") as HTMLSelectElement;

function initLangSelector(): void {
  langSelect.innerHTML = "";
  for (const loc of AVAILABLE_LOCALES) {
    const opt = document.createElement("option");
    opt.value = loc.value;
    opt.textContent = loc.label;
    langSelect.appendChild(opt);
  }
  langSelect.value = getLocale();
}

langSelect.addEventListener("change", async () => {
  await saveLocale(langSelect.value as Locale);
  localizeDOM();
  // Re-apply dynamic text that localizeDOM doesn't cover
  updateListVisibility();
  updateInputVisibility();
  renderList();
  refreshSyncStatus();
});

// --- Snapshot Display ---
const snapshotList = document.getElementById("snapshotList")!;

const SNAPSHOT_COLOR_MAP: Record<string, string> = {
  grey: "#5f6368", blue: "#4285f4", red: "#d93025", yellow: "#f9ab00",
  green: "#188038", pink: "#e91e63", purple: "#9334e6", cyan: "#00acc1", orange: "#fa903e",
};

async function refreshSnapshots(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: "getSnapshots" });
    if (!result || !Array.isArray(result) || result.length === 0) {
      snapshotList.innerHTML = `<div class="empty-state">${escapeHtml(msg("noSavedStates"))}</div>`;
      return;
    }

    snapshotList.innerHTML = result.map((s: { timestamp: number; groups: { title: string; color: string; tabs: string[] }[] }) => {
      const date = new Date(s.timestamp);
      const timeStr = date.toLocaleString();
      const groupCount = s.groups.length;
      const chips = s.groups.map((g) => {
        const dotColor = SNAPSHOT_COLOR_MAP[g.color] || "#999";
        const name = escapeHtml(g.title || msg("untitled"));
        const tabCount = g.tabs.length;
        return `<span class="snapshot-group-chip"><span class="chip-dot" style="background:${dotColor}"></span>${name} (${tabCount})</span>`;
      }).join("");

      return `
        <div class="snapshot-item">
          <div class="snapshot-info">
            <span class="snapshot-time">${escapeHtml(timeStr)}</span>
            <span class="snapshot-detail">${escapeHtml(msg("snapshotGroups", String(groupCount)))}</span>
            <div class="snapshot-groups-preview">${chips}</div>
          </div>
          <div class="snapshot-actions">
            <button class="btn btn-restore" data-ts="${s.timestamp}">${escapeHtml(msg("restore"))}</button>
            <button class="btn btn-delete-snapshot" data-ts="${s.timestamp}">&times;</button>
          </div>
        </div>`;
    }).join("");

    for (const btn of snapshotList.querySelectorAll<HTMLButtonElement>(".btn-restore")) {
      btn.addEventListener("click", async (e) => {
        const ts = parseInt((e.currentTarget as HTMLButtonElement).dataset.ts!);
        btn.disabled = true;
        const result = await chrome.runtime.sendMessage({ type: "restoreSnapshot", timestamp: ts });
        if (result && result.success) {
          showToast(msg("restoreComplete", String(result.groupCount)));
        } else {
          showToast(msg("restoreFailed"));
        }
        btn.disabled = false;
      });
    }

    for (const btn of snapshotList.querySelectorAll<HTMLButtonElement>(".btn-delete-snapshot")) {
      btn.addEventListener("click", async (e) => {
        const ts = parseInt((e.currentTarget as HTMLButtonElement).dataset.ts!);
        await chrome.runtime.sendMessage({ type: "deleteSnapshot", timestamp: ts });
        refreshSnapshots();
      });
    }
  } catch (_) {
    snapshotList.innerHTML = `<div class="empty-state">${escapeHtml(msg("fetchError"))}</div>`;
  }
}

// --- Init ---
async function init(): Promise<void> {
  await loadLocale();
  initLangSelector();
  localizeDOM();
  loadSettings();
  refreshSyncStatus();
  refreshSnapshots();
}

init();
