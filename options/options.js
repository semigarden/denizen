import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../shared/settings.js";
import { ensureDenizenPermissions, missingOrigins, requiredOrigins } from "../shared/permissions.js";

const LANGS = [
  ["EN", "English"],
  ["ES", "Spanish"],
  ["FR", "French"],
  ["DE", "German"],
  ["IT", "Italian"],
  ["PT-BR", "Portuguese (Brazil)"],
  ["PT", "Portuguese"],
  ["JA", "Japanese"],
  ["ZH", "Chinese"],
  ["RU", "Russian"],
  ["KO", "Korean"],
  ["NL", "Dutch"],
  ["PL", "Polish"],
  ["TR", "Turkish"],
  ["SV", "Swedish"],
  ["DA", "Danish"],
  ["FI", "Finnish"],
  ["EL", "Greek"],
  ["CS", "Czech"],
  ["RO", "Romanian"],
  ["UK", "Ukrainian"],
  ["ID", "Indonesian"],
  ["AR", "Arabic"],
];

function fillSelect(select, selected) {
  select.innerHTML = "";
  for (const [code, label] of LANGS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${label}`;
    if (code === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

function syncProviderFields() {
  const provider = document.getElementById("provider").value;
  const isLibre = provider === "libretranslate";
  document.getElementById("deepl-fields").hidden = isLibre;
  document.getElementById("libre-fields").hidden = !isLibre;
}

function currentFormSettings() {
  const translateOutgoing = document.getElementById("translateOutgoing").checked;
  return {
    enabled: document.getElementById("enabled").checked,
    translateIncoming: document.getElementById("translateIncoming").checked,
    translateOutgoing,
    showOutgoingPreview: translateOutgoing,
    myLanguage: document.getElementById("myLanguage").value,
    targetLanguage: document.getElementById("targetLanguage").value,
    provider: document.getElementById("provider").value,
    apiKey: document.getElementById("apiKey").value.trim(),
    libreUrl: document.getElementById("libreUrl").value.trim() || DEFAULT_SETTINGS.libreUrl,
    sourceLanguage: DEFAULT_SETTINGS.sourceLanguage,
  };
}

async function refreshPermHint() {
  const hint = document.getElementById("perm-hint");
  const missing = await missingOrigins(requiredOrigins(currentFormSettings()));
  if (!missing.length) {
    hint.textContent = "Site access granted.";
    return;
  }
  hint.textContent =
    "Missing site access. On Android tap “Grant site access”, then reload Discord.";
}

const form = document.getElementById("settings-form");
const saveBtn = document.getElementById("save-btn");
const grantBtn = document.getElementById("grant-btn");
document.getElementById("provider").addEventListener("change", () => {
  syncProviderFields();
  refreshPermHint();
});
document.getElementById("libreUrl").addEventListener("change", refreshPermHint);

async function load() {
  const settings = await getSettings();
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("translateIncoming").checked = settings.translateIncoming;
  document.getElementById("translateOutgoing").checked = settings.translateOutgoing;
  fillSelect(document.getElementById("myLanguage"), settings.myLanguage);
  fillSelect(document.getElementById("targetLanguage"), settings.targetLanguage);
  document.getElementById("provider").value = settings.provider || "deepl";
  document.getElementById("apiKey").value = settings.apiKey || "";
  document.getElementById("libreUrl").value = settings.libreUrl || DEFAULT_SETTINGS.libreUrl;
  syncProviderFields();
  await refreshPermHint();
}

let savedTimer = 0;

grantBtn.addEventListener("click", async () => {
  const ok = await ensureDenizenPermissions(currentFormSettings());
  grantBtn.textContent = ok ? "Granted" : "Denied";
  window.setTimeout(() => {
    grantBtn.textContent = "Grant site access";
  }, 1500);
  await refreshPermHint();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const patch = currentFormSettings();
  await saveSettings(patch);
  const ok = await ensureDenizenPermissions(patch);
  saveBtn.textContent = ok ? "Saved" : "Saved (grant access)";
  window.clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => {
    saveBtn.textContent = "Save";
  }, 1500);
  await refreshPermHint();
});

load().catch((err) => {
  saveBtn.textContent = err instanceof Error ? err.message : String(err);
});
