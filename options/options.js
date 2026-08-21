import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../shared/settings.js";

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

const form = document.getElementById("settings-form");
const status = document.getElementById("status");
document.getElementById("provider").addEventListener("change", syncProviderFields);

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
  // document.getElementById("libreApiKey").value = settings.libreApiKey || "";
  syncProviderFields();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const translateOutgoing = document.getElementById("translateOutgoing").checked;
  await saveSettings({
    enabled: document.getElementById("enabled").checked,
    translateIncoming: document.getElementById("translateIncoming").checked,
    translateOutgoing,
    showOutgoingPreview: translateOutgoing,
    myLanguage: document.getElementById("myLanguage").value,
    targetLanguage: document.getElementById("targetLanguage").value,
    provider: document.getElementById("provider").value,
    apiKey: document.getElementById("apiKey").value.trim(),
    libreUrl: document.getElementById("libreUrl").value.trim() || DEFAULT_SETTINGS.libreUrl,
    // libreApiKey: document.getElementById("libreApiKey").value.trim(),
    sourceLanguage: DEFAULT_SETTINGS.sourceLanguage,
  });
  status.textContent = "Saved";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1500);
});

load().catch((err) => {
  status.textContent = err instanceof Error ? err.message : String(err);
});
