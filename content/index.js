(() => {
  if (window !== window.top) return;
  if (window.__discordTranslateBooted) return;
  window.__discordTranslateBooted = true;

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
        if (area !== "local" || !changes.discordTranslateSettings) return;
        settings = { ...settings, ...changes.discordTranslateSettings.newValue };
        resetIncomingTranslations();
        composer.onSettingsChanged();
      });
    } catch (err) {
      console.warn("[Discord Translate] boot failed:", err);
      settings = { enabled: false };
    }
  }

  boot();
})();
