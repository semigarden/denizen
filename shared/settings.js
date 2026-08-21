/** @typedef {"auto"|"EN"|"ES"|"FR"|"DE"|"IT"|"PT"|"PT-BR"|"JA"|"ZH"|"RU"|"KO"|"NL"|"PL"|"TR"|"SV"|"DA"|"FI"|"EL"|"CS"|"RO"|"UK"|"ID"|"AR"} LangCode */

/**
 * @typedef {object} DenizenSettings
 * @property {boolean} enabled
 * @property {LangCode} myLanguage
 * @property {LangCode} targetLanguage
 * @property {"auto"} sourceLanguage
 * @property {"deepl"|"libretranslate"} provider
 * @property {string} apiKey
 * @property {string} libreUrl
 * @property {string} libreApiKey
 * @property {boolean} showOutgoingPreview
 * @property {boolean} translateIncoming
 * @property {boolean} translateOutgoing
 */

/** @type {DenizenSettings} */
export const DEFAULT_SETTINGS = {
  enabled: true,
  myLanguage: "EN",
  targetLanguage: "RU",
  sourceLanguage: "auto",
  provider: "deepl",
  apiKey: "",
  libreUrl: "http://127.0.0.1:5000",
  libreApiKey: "",
  showOutgoingPreview: true,
  translateIncoming: true,
  translateOutgoing: true,
};

const STORAGE_KEY = "denizenSettings";

/**
 * @returns {Promise<DenizenSettings>}
 */
export async function getSettings() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] || {}) };
}

/**
 * @param {Partial<DenizenSettings>} patch
 * @returns {Promise<DenizenSettings>}
 */
export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/**
 * @param {string} apiKey
 */
export function deeplBaseUrl(apiKey) {
  return apiKey.trim().endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

/**
 * @param {string} code
 */
export function toLibreLang(code) {
  const raw = String(code || "").trim();
  if (!raw || raw.toLowerCase() === "auto") return "auto";
  const upper = raw.toUpperCase();
  if (upper === "PT-BR" || upper === "PT_BR") return "pt";
  if (upper === "ZH" || upper.startsWith("ZH-")) return "zh";
  return upper.split("-")[0].toLowerCase();
}

/**
 * @param {string} url
 */
export function normalizeLibreUrl(url) {
  return String(url || DEFAULT_SETTINGS.libreUrl).trim().replace(/\/+$/, "");
}
