function isDenizenUi(el) {
  return Boolean(
    el?.closest?.(
      ".denizen-translate-btn, .denizen-translate-wrap, .denizen-draft-translate-btn, .denizen-draft-translate-wrap, .denizen-tooltip"
    )
  );
}

function isComposerCandidate(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (isDenizenUi(el)) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT" && /^(text|search)$/i.test(el.type || "text")) return true;

  const ce = (el.getAttribute("contenteditable") || "").toLowerCase();
  if (ce === "true" || ce === "plaintext-only" || ce === "") {
    if (el.isContentEditable) return true;
  }
  if (el.getAttribute("data-slate-editor") === "true") return true;
  if (el.getAttribute("data-slate-node") === "value") return true;
  if (el.getAttribute("role") === "textbox") return true;
  return false;
}

function composerScore(el) {
  let score = 0;
  if (el.closest('[class*="channelTextArea"], [class*="slateContainer"], form')) score += 5;
  if (el.getAttribute("data-slate-editor") === "true") score += 4;
  if (el.getAttribute("data-slate-node") === "value") score += 3;
  if (/message/i.test(el.getAttribute("aria-label") || "")) score += 3;
  if (el.getAttribute("role") === "textbox") score += 2;
  if (el.isContentEditable) score += 1;
  if (el.tagName === "TEXTAREA") score += 1;
  return score;
}

function getComposer() {
  const active = document.activeElement;
  if (isComposerCandidate(active)) return active;
  if (active instanceof Element) {
    const wrap = active.closest(
      '[contenteditable], [data-slate-editor="true"], [data-slate-node="value"], [role="textbox"], textarea'
    );
    if (isComposerCandidate(wrap)) return wrap;
  }

  const selectors = [
    '[data-slate-editor="true"]',
    '[data-slate-node="value"]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[contenteditable]',
    '[role="textbox"]',
    "textarea",
    '[class*="slateTextArea"]',
    '[class*="channelTextArea"] [contenteditable]',
    '[class*="channelTextArea"] [role="textbox"]',
    "main [contenteditable]",
    "form [contenteditable]",
  ];

  const hits = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (!isComposerCandidate(el)) continue;
      hits.push(el);
    }
  }

  hits.sort((a, b) => composerScore(b) - composerScore(a));
  return hits[0] || null;
}

function getComposerRoot(composer) {
  if (!composer) return null;
  return (
    composer.closest('[class*="channelTextArea"]') ||
    composer.closest('[class*="scrollableContainer"]') ||
    composer.closest("form") ||
    composer.parentElement
  );
}

function getComposerText(composer) {
  if (!composer) return "";

  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    return (composer.value || "").trim();
  }

  const slateParts = [];
  for (const node of composer.querySelectorAll("[data-slate-string]")) {
    slateParts.push(node.textContent || "");
  }
  let raw = slateParts.join("");

  if (!raw.replace(/[\u200b\u200c\u200d\ufeff]/g, "").trim()) {
    raw = composer.innerText || composer.textContent || "";
  }

  return raw
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n+$/g, "")
    .trim();
}

function setComposerText(composer, text) {
  if (!composer) return;

  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    composer.value = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  composer.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection.removeAllRanges();
  selection.addRange(range);
  if (!document.execCommand("insertText", false, text)) {
    composer.textContent = text;
  }
  composer.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
  );
}

function getDraftTranslateWrap() {
  return document.querySelector(".denizen-draft-translate-wrap");
}

function getDraftTranslateButton() {
  return document.querySelector(".denizen-draft-translate-btn");
}

function findComposerButtonsContainer(root) {
  if (!root) return null;

  const containers = [
    ...root.querySelectorAll('[class*="buttons_"], [class*="buttons-"], [class*="buttonContainer"]'),
  ];
  for (const el of containers) {
    if (el.querySelector('[aria-label*="emoji" i], [aria-label*="Apps" i], [aria-label*="GIF" i]')) {
      return el;
    }
  }

  const emojiBtn = root.querySelector(
    '[aria-label*="emoji" i], [aria-label*="Emoji" i], [aria-label*="Select emoji" i]'
  );
  return emojiBtn?.parentElement || null;
}

function findAppsButton(container) {
  if (!container) return null;
  for (const el of container.querySelectorAll('[role="button"], button, div[aria-label]')) {
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    if (!label) continue;
    if (label === "apps" || label.startsWith("apps ") || label.includes(" app launcher")) {
      return el.closest('[class*="button"], [role="button"], button') || el;
    }
  }
  return null;
}

function placeDraftTranslateButton(wrap) {
  const composer = getComposer();
  const root = getComposerRoot(composer);
  if (!root) {
    (document.body || document.documentElement).appendChild(wrap);
    return;
  }

  const buttons = findComposerButtonsContainer(root);
  if (!buttons) {
    const form = composer.closest("form") || root;
    form.appendChild(wrap);
    return;
  }

  const apps = findAppsButton(buttons);
  if (apps) {
    const host = apps.parentElement === buttons ? apps : apps.parentElement || apps;
    if (wrap.previousElementSibling !== host || wrap.parentElement !== buttons) {
      host.insertAdjacentElement("afterend", wrap);
    }
    return;
  }

  if (wrap.parentElement !== buttons || buttons.lastElementChild !== wrap) {
    buttons.appendChild(wrap);
  }
}

function ensureDraftTranslateButton(onClick) {
  let wrap = getDraftTranslateWrap();
  let btn = getDraftTranslateButton();

  if (!wrap || !btn) {
    wrap?.remove();
    wrap = document.createElement("span");
    wrap.className = "denizen-draft-translate-wrap";

    btn = document.createElement("div");
    btn.className = "denizen-draft-translate-btn denizen-translate-btn";
    btn.setAttribute("role", "button");
    btn.tabIndex = 0;
    setDenizenIconButton(btn, "Translate");

    const onActivate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    };
    btn.addEventListener("click", onActivate);
    btn.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") onActivate(event);
    });

    wrap.appendChild(btn);
  }

  placeDraftTranslateButton(wrap);
  return btn;
}

function syncDraftButtonLabel(showingTranslated) {
  const btn = getDraftTranslateButton();
  if (!btn) return;
  setDenizenIconButton(btn, showingTranslated ? "Original" : "Translate", {
    active: showingTranslated,
    busy: false,
  });
}

function clearDraftTranslationState(composer) {
  if (!composer) return;
  delete composer.dataset.denizenOriginalDraft;
  delete composer.dataset.denizenTranslatedDraft;
  delete composer.dataset.denizenDraftTranslated;
  composer.classList.remove("denizen-inline-error");
}

function startComposerController(getSettingsSnapshot) {
  let requestSerial = 0;
  let lastComposerText = "";
  let draftState = {
    original: "",
    translated: "",
    showingTranslated: false,
  };

  function removeDraftButton() {
    getDraftTranslateWrap()?.remove();
    document.querySelectorAll(".denizen-draft-translate-btn").forEach((el) => el.remove());
  }

  function resetDraftState() {
    draftState = { original: "", translated: "", showingTranslated: false };
  }

  function resetDraftUi(composer) {
    clearDraftTranslationState(composer);
    resetDraftState();
    lastComposerText = getComposerText(composer);
    syncDraftUi();
  }

  function maybeResetWhenEmpty(composer) {
    if (!draftState.showingTranslated && !draftState.original) return;
    if (getComposerText(composer)) return;
    if (getDraftTranslateButton()?.classList.contains("denizen-btn--busy")) return;
    resetDraftUi(composer);
  }

  function scheduleResetAfterSend() {
    if (!draftState.showingTranslated) return;
    window.setTimeout(() => {
      const live = getComposer();
      if (!getComposerText(live)) resetDraftUi(live);
    }, 100);
  }

  function isSendButton(el) {
    const label = (el.getAttribute?.("aria-label") || "").toLowerCase();
    return label.includes("send message") || label === "send";
  }

  async function translateDraft() {
    const settings = getSettingsSnapshot();
    const composer = getComposer();

    if (!settings?.enabled || !composer) return;

    if (draftState.showingTranslated) {
      const original = draftState.original;
      setComposerText(composer, original);
      clearDraftTranslationState(composer);
      resetDraftState();
      lastComposerText = original;
      syncDraftUi();
      return;
    }

    const draft = getComposerText(composer);
    if (!draft || draft.startsWith("/")) return;

    draftState.original = draft;
    draftState.translated = "";
    draftState.showingTranslated = false;
    composer.dataset.denizenOriginalDraft = draft;
    setComposerText(composer, "…");
    setDenizenIconButton(getDraftTranslateButton(), "Translating…", { busy: true });

    const serial = ++requestSerial;

    try {
      const result = await translateText(draft, settings.outgoing, "auto");
      if (serial !== requestSerial) return;

      if (translationUnchanged(result, draft, settings.outgoing)) {
        setComposerText(composer, draft);
        clearDraftTranslationState(composer);
        resetDraftState();
        syncDraftUi();
        return;
      }

      const current = getComposerText(composer);
      if (!current || current.startsWith("/")) {
        setComposerText(composer, draft);
        clearDraftTranslationState(composer);
        resetDraftState();
        syncDraftUi();
        return;
      }

      if (!result.text) {
        setComposerText(composer, draft);
        clearDraftTranslationState(composer);
        resetDraftState();
        composer.classList.add("denizen-inline-error");
        syncDraftUi();
        return;
      }

      draftState.original = draft;
      draftState.translated = result.text;
      draftState.showingTranslated = true;
      composer.dataset.denizenOriginalDraft = draft;
      composer.dataset.denizenTranslatedDraft = result.text;
      composer.dataset.denizenDraftTranslated = "1";
      setComposerText(composer, result.text);
      lastComposerText = result.text;
      syncDraftUi();
    } catch (err) {
      if (serial !== requestSerial) return;
      setComposerText(composer, draft);
      clearDraftTranslationState(composer);
      resetDraftState();
      composer.classList.add("denizen-inline-error");
      syncDraftUi();
      console.warn("[Denizen] draft translate failed:", err);
    }
  }

  function syncDraftUi() {
    const settings = getSettingsSnapshot();
    const composer = getComposer();

    if (!settings?.enabled) {
      removeDraftButton();
      clearDraftTranslationState(composer);
      resetDraftState();
      return;
    }

    if (!composer) {
      removeDraftButton();
      return;
    }

    ensureDraftTranslateButton(translateDraft);
    syncDraftButtonLabel(draftState.showingTranslated);
  }

  syncDraftUi();

  const inputObserver = new MutationObserver(() => {
    maybeResetWhenEmpty(getComposer());
    syncDraftUi();
  });
  inputObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  function onComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.isComposing) return;
    const composer = getComposer();
    if (!composer || !draftState.showingTranslated) return;
    if (!composer.contains(event.target) && event.target !== composer) return;
    scheduleResetAfterSend();
  }
  document.addEventListener("keydown", onComposerKeyDown, true);

  function onComposerClick(event) {
    if (!draftState.showingTranslated) return;
    const target = event.target instanceof Element ? event.target : null;
    const btn = target?.closest('[role="button"], button');
    if (!btn || !isSendButton(btn)) return;
    const composer = getComposer();
    if (!composer || !getComposerRoot(composer)?.contains(btn)) return;
    scheduleResetAfterSend();
  }
  document.addEventListener("click", onComposerClick, true);

  function onSettingsChanged() {
    requestSerial += 1;
    const composer = getComposer();
    if (draftState.showingTranslated && draftState.original) {
      setComposerText(composer, draftState.original);
    }
    clearDraftTranslationState(composer);
    resetDraftState();
    removeDraftButton();
    syncDraftUi();
  }

  return { onSettingsChanged };
}
