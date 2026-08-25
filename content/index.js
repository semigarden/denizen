(() => {
  if (window !== window.top) return;
  if (window.__denizenBooted) return;
  window.__denizenBooted = true;

  let settings = null;

  function getSettingsSnapshot() {
    return settings;
  }

  async function boot() {
    try {
      settings = await getSettings();

      startMessageObserver(getSettingsSnapshot);
      const composer = startComposerController(getSettingsSnapshot);

      browser.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.denizenSettings) return;
        settings = { ...settings, ...changes.denizenSettings.newValue };
        resetIncomingTranslations();
        composer.onSettingsChanged();
      });
    } catch (err) {
      console.warn("[Denizen] boot failed:", err);
      settings = { enabled: false };
    }
  }

  boot();
})();
