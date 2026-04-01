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
  showToast("設定を保存しました");
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
    listTitle.textContent = "同期するグループ（ホワイトリスト）";
  } else if (settings.mode === "blacklist") {
    listTitle.textContent = "同期しないグループ（ブラックリスト）";
  }
  updateInputVisibility();
}

function updateInputVisibility(): void {
  const matchBy = settings.matchBy;
  inputTitle.style.display = matchBy === "color" ? "none" : "";
  inputColor.style.display = matchBy === "title" ? "none" : "";
  inputTitle.placeholder =
    matchBy === "both" ? "グループ名" : "グループ名（例: Work）";
}

function renderList(): void {
  if (settings.list.length === 0) {
    listItems.innerHTML =
      '<div class="empty-state">リストが空です。上のフォームからグループを追加してください。</div>';
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
        <button class="btn btn-danger" data-index="${i}">削除</button>
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

function showToast(msg: string): void {
  toast.textContent = msg;
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
    showToast("グループ名を入力してください");
    return;
  }
  if (matchBy === "color" && !color) {
    showToast("色を選択してください");
    return;
  }
  if (matchBy === "both" && !title && !color) {
    showToast("グループ名または色を入力してください");
    return;
  }

  const entry: ListEntry = {};
  if (matchBy !== "color") entry.title = title;
  if (matchBy !== "title") entry.color = color;

  const isDup = settings.list.some(
    (item) => item.title === entry.title && item.color === entry.color
  );
  if (isDup) {
    showToast("同じ項目が既に存在します");
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
  syncStatusBar.textContent = "同期中...";

  try {
    const result = await chrome.runtime.sendMessage({ type: "fullSync" });
    if (result && result.success) {
      syncStatusBar.textContent = `同期完了（${result.groupCount} グループ）`;
      showToast("同期が完了しました");
      refreshSyncStatus();
    } else if (result && result.error === "already running") {
      syncStatusBar.textContent = "同期は既に実行中です";
      showToast("同期は既に実行中です");
    } else {
      syncStatusBar.textContent = "同期エラー";
      showToast("同期に失敗しました");
    }
  } catch (_) {
    syncStatusBar.textContent = "同期エラー";
    showToast("同期に失敗しました");
  } finally {
    syncBtn.disabled = false;
    setTimeout(() => { syncStatusBar.textContent = ""; }, 5000);
  }
});

// --- Sync Status Display ---
const syncGroupList = document.getElementById("syncGroupList")!;

const STATUS_COLOR_MAP: Record<string, string> = {
  grey: "#5f6368", blue: "#4285f4", red: "#d93025", yellow: "#f9ab00",
  green: "#188038", pink: "#e91e63", purple: "#9334e6", cyan: "#00acc1", orange: "#fa903e",
};

async function refreshSyncStatus(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: "getSyncStatus" });
    if (!result || !result.groups) {
      syncGroupList.innerHTML = '<div class="empty-state">取得できませんでした</div>';
      return;
    }
    const groups = result.groups as { title: string; color: string; windowCount: number }[];
    if (groups.length === 0) {
      syncGroupList.innerHTML = '<div class="empty-state">同期中のグループはありません</div>';
      return;
    }
    syncGroupList.innerHTML = groups.map((g) => `
      <div class="sync-group-item">
        <span class="group-color" style="background:${STATUS_COLOR_MAP[g.color] || "#999"}"></span>
        <span class="group-name">${escapeHtml(g.title)}</span>
        <span class="group-windows">${g.windowCount} ウィンドウ</span>
      </div>
    `).join("");
  } catch (_) {
    syncGroupList.innerHTML = '<div class="empty-state">取得できませんでした</div>';
  }
}

// --- Init ---
loadSettings();
refreshSyncStatus();
