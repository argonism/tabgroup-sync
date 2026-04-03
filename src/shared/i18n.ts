// Shared i18n module - used by both background and options

import en from "../../_locales/en/messages.json";
import ja from "../../_locales/ja/messages.json";

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

type Messages = Record<string, MessageEntry>;

const MESSAGES: Record<string, Messages> = { en, ja };

export type Locale = "auto" | "en" | "ja";

export const AVAILABLE_LOCALES: { value: Locale; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

let currentLocale: Locale = "auto";

function resolveLocale(): string {
  if (currentLocale !== "auto") return currentLocale;
  // chrome.i18n.getUILanguage() returns e.g. "ja", "en-US"
  const uiLang = chrome.i18n.getUILanguage().split("-")[0];
  return uiLang in MESSAGES ? uiLang : "en";
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export async function loadLocale(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get("tabGroupSync");
    if (result.tabGroupSync?.lang) {
      currentLocale = result.tabGroupSync.lang as Locale;
    }
  } catch (_) {}
}

export async function saveLocale(locale: Locale): Promise<void> {
  setLocale(locale);
  try {
    const result = await chrome.storage.sync.get("tabGroupSync");
    const settings = result.tabGroupSync || {};
    settings.lang = locale;
    await chrome.storage.sync.set({ tabGroupSync: settings });
  } catch (_) {}
}

export function msg(key: string, ...substitutions: string[]): string {
  const lang = resolveLocale();
  const messages = MESSAGES[lang] || MESSAGES.en;
  const entry = messages[key] || MESSAGES.en[key];
  if (!entry) return key;

  let text = entry.message;

  // Replace named placeholders like $count$ with positional args
  if (entry.placeholders && substitutions.length > 0) {
    for (const [name, def] of Object.entries(entry.placeholders)) {
      // def.content is "$1", "$2", etc.
      const idx = parseInt(def.content.replace("$", "")) - 1;
      if (idx >= 0 && idx < substitutions.length) {
        text = text.replace(new RegExp(`\\$${name}\\$`, "gi"), substitutions[idx]);
      }
    }
  }

  return text;
}
