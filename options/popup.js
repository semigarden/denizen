import { getSettings } from "../shared/settings.js";
import { ensureDenizenPermissions, missingOrigins, requiredOrigins } from "../shared/permissions.js";

const state = document.getElementById("state");
const summary = document.getElementById("summary");
const meta = document.getElementById("meta");
const statusDot = document.getElementById("status-dot");
const openOptions = document.getElementById("open-options");

openOptions.addEventListener("click", (event) => {
  event.preventDefault();
  browser.runtime.openOptionsPage();
});

function setState(value) {
  if (statusDot) statusDot.dataset.state = value;
}

getSettings()
  .then(async (settings) => {
    const pair = `${settings.myLanguage} ↔ ${settings.targetLanguage}`;
    const provider =
      settings.provider === "libretranslate" ? "LibreTranslate" : "DeepL";

    if (settings.provider === "libretranslate" && !settings.libreUrl) {
      setState("warn");
      state.textContent = "Setup";
      summary.textContent = "LibreTranslate URL missing";
      meta.textContent = "Open settings to finish setup";
      return;
    }

    if (settings.provider === "deepl" && !settings.apiKey) {
      setState("warn");
      state.textContent = "Setup";
      summary.textContent = "DeepL key missing";
      meta.textContent = "Open settings to finish setup";
      return;
    }

    const missing = await missingOrigins(requiredOrigins(settings));
    if (missing.length) {
      setState("warn");
      state.textContent = "Permission";
      summary.textContent = "Site access required";
      meta.textContent = "Open settings → Grant site access";
      openOptions.textContent = "Grant in Settings";
      return;
    }

    if (!settings.enabled) {
      setState("off");
      state.textContent = "Paused";
      summary.textContent = "";
      meta.textContent = `${provider} · ${pair}`;
      return;
    }

    setState("on");
    state.textContent = "Active";
    summary.textContent = "";
    meta.textContent = `${provider} · ${pair}`;

    await ensureDenizenPermissions(settings).catch(() => {});
  })
  .catch(() => {
    setState("warn");
    state.textContent = "Error";
    summary.textContent = "Could not load settings";
    meta.textContent = "";
  });
