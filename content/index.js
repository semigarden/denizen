(() => {
  if (window.__denizenBooted) return;
  window.__denizenBooted = true;

  /** @type {object | null} */
  let settings = null;

  function getSettingsSnapshot() {
    return settings;
  }

  async function boot() {
    try {
      settings = await getSettings();
    } catch (err) {
      console.warn("[Denizen] settings load failed:", err);
      settings = { enabled: false };
    }

    startMessageObserver(getSettingsSnapshot);
    startComposerController(getSettingsSnapshot);

    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === DENIZEN_MSG.SETTINGS_UPDATED) {
        settings = { ...settings, ...message.settings };
      }
    });

    console.info("[Denizen] content script ready");
  }

  boot();
})();
