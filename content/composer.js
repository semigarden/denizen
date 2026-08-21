function getComposer() {
  const candidates = [
    ...document.querySelectorAll('div[role="textbox"][data-slate-editor="true"]'),
    ...document.querySelectorAll('div[role="textbox"][contenteditable="true"]'),
  ];

  for (const el of candidates) {
    if (el.closest('[class*="channelTextArea"]')) return el;
  }
  for (const el of candidates) {
    if (el.closest("form")) return el;
  }
  return candidates[0] || null;
}

function getComposerText(composer) {
  return (composer?.innerText || "")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n+$/g, "")
    .trim();
}

function findPreviewAnchor(composer) {
  return (
    composer.closest('[class*="channelTextArea"]') ||
    composer.closest("form") ||
    composer.parentElement
  );
}

function getOutgoingPreviewEl() {
  return document.querySelector(".denizen-outgoing-preview");
}

function clearOutgoingPreview() {
  const preview = getOutgoingPreviewEl();
  if (!preview) return;
  preview.classList.remove("denizen-outgoing-preview--error");
  preview.textContent = "";
}

function ensureOutgoingPreview() {
  const composer = getComposer();
  if (!composer) return null;

  const anchor = findPreviewAnchor(composer);
  if (!anchor) return null;

  let preview = anchor.querySelector(":scope > .denizen-outgoing-preview");
  if (preview && preview.isConnected) return preview;

  preview = getOutgoingPreviewEl();
  if (preview && preview.isConnected && anchor.contains(preview)) return preview;
  if (preview?.isConnected) preview.remove();

  preview = document.createElement("div");
  preview.className = "denizen-outgoing-preview";
  preview.setAttribute("aria-live", "polite");
  anchor.appendChild(preview);
  return preview;
}

function updateOutgoingPreview(text, error) {
  if (!text && !error) {
    clearOutgoingPreview();
    return;
  }

  const preview = ensureOutgoingPreview();
  if (!preview) return;
  if (error) {
    preview.textContent = `Translation error: ${error}`;
    preview.classList.add("denizen-outgoing-preview--error");
    return;
  }
  preview.classList.remove("denizen-outgoing-preview--error");
  preview.textContent = text;
}

function startComposerController(getSettingsSnapshot) {
  let debounceTimer = 0;
  let lastPreviewDraft = "";
  let requestSerial = 0;
  let lastComposer = null;
  /** @type {MutationObserver | null} */
  let composerObserver = null;

  function resetPreview() {
    lastPreviewDraft = "";
    requestSerial += 1;
    clearOutgoingPreview();
  }

  async function refreshPreview() {
    const settings = getSettingsSnapshot();
    const composer = getComposer();
    if (!settings?.enabled || !settings.translateOutgoing || !composer) {
      resetPreview();
      return;
    }

    const draft = getComposerText(composer);

    if (!draft || draft.startsWith("/")) {
      resetPreview();
      return;
    }

    if (draft === lastPreviewDraft) {
      ensureOutgoingPreview();
      return;
    }

    lastPreviewDraft = draft;
    const serial = ++requestSerial;

    try {
      const towardTarget = await translateText(draft, settings.targetLanguage, "auto");
      if (serial !== requestSerial) return;

      let result = towardTarget;
      const looksLikeTarget =
        sameLanguage(towardTarget.detectedFrom, settings.targetLanguage) ||
        towardTarget.text.trim() === draft.trim();

      if (looksLikeTarget) {
        result = await translateText(draft, settings.myLanguage, "auto");
        if (serial !== requestSerial) return;
      }

      const current = getComposerText(composer);
      if (!current || current.startsWith("/")) {
        resetPreview();
        return;
      }
      if (current !== draft) return;

      updateOutgoingPreview(result.text);
    } catch (err) {
      if (serial !== requestSerial) return;
      const current = getComposerText(composer);
      if (!current) {
        resetPreview();
        return;
      }
      lastPreviewDraft = "";
      updateOutgoingPreview("", err instanceof Error ? err.message : String(err));
    }
  }

  function schedulePreview() {
    const composer = getComposer();
    if (!composer || !getComposerText(composer)) {
      window.clearTimeout(debounceTimer);
      resetPreview();
      return;
    }

    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(refreshPreview, 350);
  }

  function unbindComposer(composer) {
    if (!composer) return;
    delete composer.dataset.denizenBound;
  }

  function bindComposer(composer) {
    if (!composer) return;

    if (lastComposer && lastComposer !== composer) {
      unbindComposer(lastComposer);
      if (composerObserver) {
        composerObserver.disconnect();
        composerObserver = null;
      }
    }

    lastComposer = composer;
    if (composer.dataset.denizenBound === "1") return;
    composer.dataset.denizenBound = "1";

    composer.addEventListener("input", schedulePreview);
    composer.addEventListener("keyup", schedulePreview);
    composer.addEventListener("paste", schedulePreview);
    composer.addEventListener("compositionend", schedulePreview);

    composerObserver = new MutationObserver(schedulePreview);
    composerObserver.observe(composer, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    schedulePreview();
  }

  const inputObserver = new MutationObserver(() => {
    bindComposer(getComposer());
  });
  inputObserver.observe(document.body, { childList: true, subtree: true });

  bindComposer(getComposer());

  const pollId = window.setInterval(() => {
    const composer = getComposer();
    bindComposer(composer);
    if (!composer) {
      resetPreview();
      return;
    }
    const draft = getComposerText(composer);
    if (!draft) {
      if (lastPreviewDraft || getOutgoingPreviewEl()?.textContent) resetPreview();
      return;
    }
    if (draft !== lastPreviewDraft) schedulePreview();
  }, 500);

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === DENIZEN_MSG.SETTINGS_UPDATED) {
      lastPreviewDraft = "";
      schedulePreview();
    }
  });

  return () => {
    inputObserver.disconnect();
    if (composerObserver) composerObserver.disconnect();
    window.clearTimeout(debounceTimer);
    window.clearInterval(pollId);
  };
}
