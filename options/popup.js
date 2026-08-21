import { getSettings } from "../shared/settings.js";

const state = document.getElementById("state");
const summary = document.getElementById("summary");
const meta = document.getElementById("meta");
const statusDot = document.getElementById("status-dot");
const openOptions = document.getElementById("open-options");

openOptions.addEventListener("click", (event) => {
  event.preventDefault();
  browser.runtime.openOptionsPage();
});

function setState(state) {
  statusDot.dataset.state = state;
}

getSettings()
  .then((settings) => {
    const pair = `${settings.myLanguage} ↔ ${settings.targetLanguage}`;
    const provider =
      settings.provider === "libretranslate" ? "LibreTranslate" : "DeepL";

    if (settings.provider === "libretranslate" && !settings.libreUrl) {
      setState("warn");
      summary.textContent = "LibreTranslate URL missing";
      meta.textContent = "Open settings to finish setup";
      return;
    }

    if (settings.provider === "deepl" && !settings.apiKey) {
      setState("warn");
      summary.textContent = "DeepL key missing";
      meta.textContent = "Open settings to finish setup";
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
  })
  .catch(() => {
    setState("warn");
    summary.textContent = "Could not load settings";
    meta.textContent = "";
  });
