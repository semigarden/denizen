const ORIGINAL_HTML = "data-discord-translate-original-html";
const TRANSLATED = "data-discord-translate-translated";
const CACHED_TEXT = "data-discord-translate-cached-text";
const CACHED_SRC = "data-discord-translate-cached-src";

const messageViewState = new Map();

function collectMessageKeys(messageEl) {
  const keys = [];
  if (!messageEl) return keys;

  function add(key) {
    if (key && !keys.includes(key)) keys.push(key);
  }

  add(messageEl.id);
  add(messageEl.getAttribute?.("data-list-item-id") || "");

  const content =
    (messageEl.id && String(messageEl.id).startsWith("message-content-") && messageEl) ||
    messageEl.querySelector?.('[id^="message-content-"]');
  add(content?.id || "");

  for (const el of messageEl.querySelectorAll?.('[id^="message-content-"]') || []) {
    add(el.id);
  }

  return keys;
}

function messageKey(messageEl) {
  return collectMessageKeys(messageEl)[0] || "";
}

function getStateRecordByKey(key) {
  if (!key) return null;
  let record = messageViewState.get(key);
  if (!record) {
    record = { view: null, cache: new Map() };
    messageViewState.set(key, record);
  }
  return record;
}

function getStateRecord(messageEl) {
  return getStateRecordByKey(messageKey(messageEl));
}

function getStoredView(messageEl) {
  let translated = false;
  let original = false;
  for (const key of collectMessageKeys(messageEl)) {
    const view = messageViewState.get(key)?.view;
    if (view === "translated") translated = true;
    if (view === "original") original = true;
  }
  if (original) return "original";
  if (translated) return "translated";
  return null;
}

function getViewState(messageEl) {
  return getStoredView(messageEl) ?? (isTranslated(messageEl) ? "translated" : "original");
}

function setViewState(messageEl, state) {
  const keys = collectMessageKeys(messageEl);
  if (!keys.length) return;
  for (const key of keys) {
    getStateRecordByKey(key).view = state;
  }
}

function findMessageRoot(el) {
  if (!el?.closest) return null;
  return (
    el.closest('[id^="chat-messages-"]') ||
    el.closest('[data-list-item-id*="chat-messages"]') ||
    el.closest('[class*="messageListItem"]') ||
    el.closest('[role="listitem"]') ||
    null
  );
}

function shouldShowTranslation(messageEl) {
  return Boolean(messageEl) && getStoredView(messageEl) === "translated";
}

function isSameLanguageMessage(messageEl) {
  for (const key of collectMessageKeys(messageEl)) {
    if (messageViewState.get(key)?.sameLanguage) return true;
  }
  return false;
}

function markSameLanguage(messageEl) {
  for (const key of collectMessageKeys(messageEl)) {
    getStateRecordByKey(key).sameLanguage = true;
    getStateRecordByKey(key).translationReady = false;
  }
}

function isTranslationReady(messageEl) {
  for (const key of collectMessageKeys(messageEl)) {
    if (messageViewState.get(key)?.translationReady) return true;
  }
  return false;
}

function markTranslationReady(messageEl) {
  for (const key of collectMessageKeys(messageEl)) {
    const record = getStateRecordByKey(key);
    record.translationReady = true;
    record.sameLanguage = false;
  }
}

function messageHasCachedTranslation(messageEl) {
  for (const target of collectTranslateTargets(messageEl)) {
    const text = extractMessageText(target.el);
    if (!text) continue;
    if (getCachedTranslation(target.el, text) || getMemoryCachedTranslation(messageEl, text)) {
      return true;
    }
  }
  return false;
}

function rememberTranslation(messageEl, src, dst) {
  if (!src || !dst) return;
  for (const key of collectMessageKeys(messageEl)) {
    getStateRecordByKey(key).cache.set(src, dst);
  }
}

function getMemoryCachedTranslation(messageEl, srcText) {
  if (!srcText) return null;
  const trimmed = srcText.trim();
  for (const key of collectMessageKeys(messageEl)) {
    const record = messageViewState.get(key);
    if (!record?.cache?.size) continue;
    if (record.cache.has(srcText)) return record.cache.get(srcText);
    for (const [src, dst] of record.cache.entries()) {
      if (src.trim() === trimmed) return dst;
    }
    if (record.cache.size === 1) return record.cache.values().next().value;
  }
  return null;
}

function showCachedTranslation(messageEl) {
  if (!shouldShowTranslation(messageEl)) return false;
  const targets = collectTranslateTargets(messageEl);
  let applied = false;
  for (const target of targets) {
    if (!shouldShowTranslation(messageEl)) return applied;
    const text = extractMessageText(target.el);
    if (!text) continue;
    const cached =
      getCachedTranslation(target.el, text) || getMemoryCachedTranslation(messageEl, text);
    if (!cached) continue;
    setCachedTranslation(target.el, text, cached);
    applyInlineText(target.el, cached);
    rememberTranslation(messageEl, text, cached);
    applied = true;
  }
  return applied;
}

function resetMessageToOriginal(messageEl) {
  restoreMessage(messageEl);
  messageEl.querySelectorAll(".discord-translate-inline-error").forEach((el) => {
    el.classList.remove("discord-translate-inline-error");
  });
  setViewState(messageEl, "original");
}

function findLiveMessageEl(messageEl) {
  if (messageEl?.isConnected) return messageEl;
  const keys = collectMessageKeys(messageEl);
  for (const el of collectMessageElements()) {
    const elKeys = collectMessageKeys(el);
    if (elKeys.some((key) => keys.includes(key))) return el;
  }
  return messageEl;
}

function extractMessageText(contentEl) {
  if (!contentEl) return "";
  const clone = contentEl.cloneNode(true);
  clone.classList.remove("discord-translate-content-suppressed");
  clone
    .querySelectorAll(
      ".discord-translate-translate-btn, .discord-translate-translate-wrap, .discord-translate-inline-translation"
    )
    .forEach((n) => n.remove());
  return (clone.innerText || clone.textContent || "").trim();
}

function findReplyRoot(messageEl) {
  return (
    messageEl.querySelector('[class*="repliedMessage"]') ||
    messageEl.querySelector('[class*="replyBar"]') ||
    null
  );
}

function findMessageContent(messageEl) {
  const replyRoot = findReplyRoot(messageEl);
  const all = [...messageEl.querySelectorAll('[id^="message-content-"]')];

  for (const el of all) {
    if (replyRoot && replyRoot.contains(el)) continue;
    if (el.classList.contains("discord-translate-inline-translation")) continue;
    return el;
  }

  if (all.length) {
    const last = all.findLast?.((el) => !el.classList.contains("discord-translate-inline-translation"))
      ?? [...all].reverse().find((el) => !el.classList.contains("discord-translate-inline-translation"));
    if (last) return last;
  }

  const fallbacks = [
    ...messageEl.querySelectorAll('[class*="messageContent"]'),
    ...messageEl.querySelectorAll('[class*="markup_"], [class*="markup-"]'),
  ];
  for (const el of fallbacks) {
    if (el.classList.contains("discord-translate-inline-translation")) continue;
    if (replyRoot && replyRoot.contains(el)) continue;
    if (el.closest('[class*="repliedMessage"], [class*="replyBar"]')) continue;
    if (!extractMessageText(el)) continue;
    return el;
  }
  return null;
}

function findReplyContent(messageEl) {
  const replyRoot = findReplyRoot(messageEl);
  if (!replyRoot) return null;

  const nested =
    replyRoot.querySelector('[class*="repliedTextContent"]:not(.discord-translate-inline-translation)') ||
    replyRoot.querySelector('[class*="repliedTextPreview"]:not(.discord-translate-inline-translation)') ||
    replyRoot.querySelector('[class*="messageContent"]:not(.discord-translate-inline-translation)');

  if (nested && extractMessageText(nested)) return nested;
  if (extractMessageText(replyRoot)) return replyRoot;
  return null;
}

function collectTranslateTargets(messageEl) {
  const targets = [];
  const reply = findReplyContent(messageEl);
  const main = findMessageContent(messageEl);

  if (reply) {
    targets.push({ el: reply });
  }
  if (main && main !== reply && !(reply && reply.contains(main))) {
    targets.push({ el: main });
  }
  return targets;
}

function isTranslated(messageEl) {
  return Boolean(
    messageEl?.querySelector?.(`.discord-translate-inline-translation, [${TRANSLATED}="1"], [${ORIGINAL_HTML}], .discord-translate-content-suppressed`)
  );
}

function getCachedTranslation(contentEl, srcText) {
  if (!contentEl || !srcText) return null;
  if (contentEl.getAttribute(CACHED_SRC) !== srcText) return null;
  return contentEl.getAttribute(CACHED_TEXT);
}

function setCachedTranslation(contentEl, srcText, translatedText) {
  contentEl.setAttribute(CACHED_SRC, srcText);
  contentEl.setAttribute(CACHED_TEXT, translatedText);
}

function clearCachedTranslation(contentEl) {
  contentEl.removeAttribute(CACHED_SRC);
  contentEl.removeAttribute(CACHED_TEXT);
}

function ensureContentTargetId(contentEl) {
  if (contentEl.id && String(contentEl.id).startsWith("message-content-")) {
    contentEl.dataset.discordTranslateTargetId = contentEl.id;
    return contentEl.id;
  }
  if (!contentEl.dataset.discordTranslateTargetId) {
    contentEl.dataset.discordTranslateTargetId = `t-${Math.random().toString(36).slice(2, 9)}`;
  }
  return contentEl.dataset.discordTranslateTargetId;
}

function findTranslationOverlay(contentEl) {
  const tid = contentEl.dataset.discordTranslateTargetId;
  if (!tid) return null;
  const parent = contentEl.parentElement;
  if (!parent) return null;
  return parent.querySelector(`.discord-translate-inline-translation[data-discord-translate-for="${CSS.escape(tid)}"]`);
}

function applyInlineText(contentEl, text) {
  const messageEl = findMessageRoot(contentEl);
  if (messageEl && getStoredView(messageEl) === "original") return;

  const tid = ensureContentTargetId(contentEl);
  contentEl.setAttribute(TRANSLATED, "1");
  contentEl.setAttribute(ORIGINAL_HTML, "1");
  contentEl.classList.add("discord-translate-content-suppressed");

  let sibling = contentEl.nextElementSibling;
  while (sibling?.classList?.contains("discord-translate-inline-translation")) {
    const next = sibling.nextElementSibling;
    if (sibling.dataset.discordTranslateFor !== tid) sibling.remove();
    sibling = next;
  }

  let overlay = findTranslationOverlay(contentEl);
  if (!overlay) {
    overlay = document.createElement(contentEl.tagName || "div");
    overlay.className = `${contentEl.className} discord-translate-inline-translation`.replace(
      /\bdiscord-translate-content-suppressed\b/g,
      ""
    );
    overlay.dataset.discordTranslateFor = tid;
    overlay.removeAttribute("id");
    overlay.setAttribute(TRANSLATED, "1");
    contentEl.insertAdjacentElement("afterend", overlay);
  }
  if (messageEl && getStoredView(messageEl) === "original") {
    overlay.remove();
    contentEl.classList.remove("discord-translate-content-suppressed");
    contentEl.removeAttribute(ORIGINAL_HTML);
    contentEl.removeAttribute(TRANSLATED);
    return;
  }
  overlay.textContent = text;
}

function showLoadingInline(contentEl) {
  applyInlineText(contentEl, "…");
}

function restoreOriginal(contentEl) {
  findTranslationOverlay(contentEl)?.remove();
  let sibling = contentEl.nextElementSibling;
  while (sibling?.classList?.contains("discord-translate-inline-translation")) {
    const next = sibling.nextElementSibling;
    sibling.remove();
    sibling = next;
  }
  contentEl.classList.remove("discord-translate-content-suppressed");
  contentEl.removeAttribute(ORIGINAL_HTML);
  contentEl.removeAttribute(TRANSLATED);
}

function restoreMessage(messageEl) {
  messageEl.querySelectorAll(".discord-translate-inline-translation").forEach((n) => n.remove());
  messageEl.querySelectorAll(`[${TRANSLATED}], [${ORIGINAL_HTML}], .discord-translate-content-suppressed`).forEach((el) => {
    el.classList.remove("discord-translate-content-suppressed");
    el.removeAttribute(ORIGINAL_HTML);
    el.removeAttribute(TRANSLATED);
  });
}

function getTranslateWrap(messageEl) {
  return messageEl.querySelector(".discord-translate-translate-wrap");
}

function getTranslateButton(messageEl) {
  return messageEl.querySelector(".discord-translate-translate-btn");
}

function setTranslateButtonLabel(messageEl, mode, settings) {
  const btn = getTranslateButton(messageEl);
  if (!btn) return;

  const lang = languageLabel(settings?.incoming) || settings?.incoming || "";
  let label = "Translate";
  if (mode === "translated") label = "See original";
  else if (mode === "busy") label = "Translating…";
  else if (mode === "wait") label = "Wait…";
  else label = lang ? `Translate to ${lang}` : "Translate";

  btn.textContent = label;
  btn.setAttribute("aria-label", label);
  btn.removeAttribute("title");
  btn.classList.toggle("discord-translate-btn--active", mode === "translated");
  btn.classList.toggle("discord-translate-btn--busy", mode === "busy" || mode === "wait");
  btn.classList.remove("discord-translate-btn--same");
}

function ensureContentSuppressedForOverlays(messageEl) {
  for (const target of collectTranslateTargets(messageEl)) {
    const overlay =
      findTranslationOverlay(target.el) ||
      (target.el.nextElementSibling?.classList?.contains("discord-translate-inline-translation")
        ? target.el.nextElementSibling
        : null);
    if (!overlay) continue;
    if (overlay.dataset.discordTranslateFor && !target.el.dataset.discordTranslateTargetId) {
      target.el.dataset.discordTranslateTargetId = overlay.dataset.discordTranslateFor;
    }
    target.el.classList.add("discord-translate-content-suppressed");
    target.el.setAttribute(TRANSLATED, "1");
    target.el.setAttribute(ORIGINAL_HTML, "1");
  }
}

function syncTranslateButtonLabel(messageEl, settings) {
  if (shouldShowTranslation(messageEl)) {
    showCachedTranslation(messageEl);
    if (!shouldShowTranslation(messageEl)) {
      restoreMessage(messageEl);
      setTranslateButtonLabel(messageEl, "idle", settings);
      return;
    }
    ensureContentSuppressedForOverlays(messageEl);
    setTranslateButtonLabel(messageEl, "translated", settings);
    return;
  }

  if (isTranslated(messageEl)) {
    restoreMessage(messageEl);
  }
  setTranslateButtonLabel(messageEl, "idle", settings);
}

function removeTranslateButtons() {
  document.querySelectorAll(".discord-translate-translate-wrap").forEach((el) => el.remove());
}

function findReactionsContainer(messageEl) {
  const replyRoot = findReplyRoot(messageEl);
  for (const el of messageEl.querySelectorAll('[class*="reactions"]')) {
    if (replyRoot && replyRoot.contains(el)) continue;
    if (el.closest(".discord-translate-translate-wrap")) continue;
    if (!el.querySelector('[class*="reaction"], [class*="emoji"]')) continue;
    return el;
  }
  return null;
}

function placeTranslateButton(messageEl, wrap) {
  const reactions = findReactionsContainer(messageEl);
  if (reactions) {
    wrap.classList.add("discord-translate-translate-wrap--with-reactions");
    if (wrap.parentElement !== reactions || reactions.lastElementChild !== wrap) {
      reactions.appendChild(wrap);
    }
    return;
  }

  wrap.classList.remove("discord-translate-translate-wrap--with-reactions");
  const main = findMessageContent(messageEl);
  if (!main) return;
  const overlay =
    findTranslationOverlay(main) ||
    (main.nextElementSibling?.classList?.contains("discord-translate-inline-translation")
      ? main.nextElementSibling
      : null);
  const anchor = overlay || main;
  if (wrap.previousElementSibling !== anchor || !wrap.isConnected) {
    anchor.insertAdjacentElement("afterend", wrap);
  }
}

function ensureTranslateButton(messageEl, getSettingsSnapshot) {
  const settings = getSettingsSnapshot();
  if (!settings?.enabled) {
    getTranslateWrap(messageEl)?.remove();
    return;
  }

  if (isSameLanguageMessage(messageEl)) {
    getTranslateWrap(messageEl)?.remove();
    return;
  }

  if (messageHasCachedTranslation(messageEl)) {
    markTranslationReady(messageEl);
  }

  const canShow =
    shouldShowTranslation(messageEl) ||
    isTranslationReady(messageEl) ||
    messageHasCachedTranslation(messageEl);

  if (!canShow) {
    getTranslateWrap(messageEl)?.remove();
    return;
  }

  const main = findMessageContent(messageEl);
  if (!main || !extractMessageText(main)) {
    getTranslateWrap(messageEl)?.remove();
    return;
  }

  let wrap = getTranslateWrap(messageEl);
  let btn = getTranslateButton(messageEl);

  if (!wrap || !btn) {
    wrap?.remove();
    wrap = document.createElement("span");
    wrap.className = "discord-translate-translate-wrap";

    btn = document.createElement("div");
    btn.className = "discord-translate-translate-btn";
    btn.setAttribute("role", "button");
    btn.tabIndex = 0;

    const onActivate = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const live = findLiveMessageEl(messageEl) || messageEl;
      handleTranslateClick(live, getSettingsSnapshot);
    };
    btn.addEventListener("click", onActivate);
    btn.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") onActivate(event);
    });

    wrap.appendChild(btn);
  }

  placeTranslateButton(messageEl, wrap);
  syncTranslateButtonLabel(messageEl, settings);
}

async function translateTarget(target, settings, messageEl, { apply = true } = {}) {
  if (apply && messageEl && getStoredView(messageEl) === "original") return "skip";

  const text = extractMessageText(target.el);
  if (!text) return "skip";

  const record = messageEl ? getStateRecord(messageEl) : null;
  const cached =
    getCachedTranslation(target.el, text) ||
    (record?.cache?.has(text) ? record.cache.get(text) : null) ||
    (messageEl ? getMemoryCachedTranslation(messageEl, text) : null);
  if (cached) {
    if (apply && messageEl && getStoredView(messageEl) === "original") return "skip";
    setCachedTranslation(target.el, text, cached);
    if (messageEl) rememberTranslation(messageEl, text, cached);
    if (apply) applyInlineText(target.el, cached);
    return "translated";
  }

  const result = await translateText(text, settings.incoming, "auto");
  if (apply && messageEl && getStoredView(messageEl) === "original") return "skip";
  if (translationUnchanged(result, text, settings.incoming)) {
    if (apply) restoreOriginal(target.el);
    clearCachedTranslation(target.el);
    return "same";
  }

  setCachedTranslation(target.el, text, result.text);
  if (messageEl) rememberTranslation(messageEl, text, result.text);
  if (apply) applyInlineText(target.el, result.text);
  return "translated";
}

async function processIncomingMessage(
  messageEl,
  settings,
  getSettingsSnapshot,
  { showLoading = false, prefetch = false } = {}
) {
  if (!settings.enabled) return;

  const key = messageKey(messageEl);
  if (!key) return;
  if (isRateLimitedFor(messageEl, key)) return;

  const targets = collectTranslateTargets(messageEl);
  if (!targets.length) return;

  const hasText = targets.some((t) => extractMessageText(t.el));
  if (!hasText) return;

  messageEl.setAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED, `pending:${key}`);

  if (showLoading && !prefetch) {
    for (const target of targets) {
      const text = extractMessageText(target.el);
      if (!getCachedTranslation(target.el, text) && !getMemoryCachedTranslation(messageEl, text)) {
        showLoadingInline(target.el);
      }
    }
  }

  let rateLimited = false;
  let lastError = "";
  let translated = false;
  let sameLanguage = false;

  for (const target of targets) {
    try {
      const result = await translateTarget(target, settings, messageEl, { apply: !prefetch });
      if (result === "translated") translated = true;
      if (result === "same") sameLanguage = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      if (msg.includes("429") || msg.includes("rate limited")) {
        rateLimited = true;
      }
      console.warn("[Discord Translate] translate target failed:", err);
    }
  }

  if (!prefetch && getStoredView(messageEl) === "original") {
    restoreMessage(messageEl);
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  if (messageKey(messageEl) !== key) return;

  if (rateLimited) {
    if (!prefetch) restoreMessage(messageEl);
    setViewState(messageEl, "original");
    const until = Date.now() + 30_000;
    messageEl.setAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED, `limited:${key}:${until}`);
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  if (lastError && !translated) {
    if (!prefetch) {
      restoreMessage(messageEl);
      setViewState(messageEl, "original");
      if (showLoading) {
        const main = findMessageContent(messageEl) || targets[0]?.el;
        if (main) {
          applyInlineText(main, `Translation error: ${lastError}`);
          main.classList.add("discord-translate-inline-error");
        }
      }
    }
    messageEl.removeAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED);
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  if (!translated && sameLanguage) {
    if (!prefetch) restoreMessage(messageEl);
    markSameLanguage(messageEl);
    setViewState(messageEl, "original");
    messageEl.setAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED, key);
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  if (prefetch) {
    if (translated) {
      markTranslationReady(messageEl);
      messageEl.setAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED, key);
    } else {
      messageEl.removeAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED);
    }
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  setViewState(messageEl, translated ? "translated" : "original");
  if (translated) markTranslationReady(messageEl);
  messageEl.setAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED, key);
  ensureTranslateButton(messageEl, getSettingsSnapshot);
}

async function handleTranslateClick(messageEl, getSettingsSnapshot) {
  const settings = getSettingsSnapshot();
  if (!settings?.enabled) return;

  messageEl = findLiveMessageEl(messageEl) || messageEl;

  const key = messageKey(messageEl);
  if (!key) return;

  if (isRateLimitedFor(messageEl, key)) {
    setTranslateButtonLabel(messageEl, "wait", settings);
    return;
  }

  if (isSameLanguageMessage(messageEl)) return;

  if (getViewState(messageEl) === "translated") {
    resetMessageToOriginal(messageEl);
    messageEl.removeAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED);
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  if (isPendingFor(messageEl, key)) return;

  setViewState(messageEl, "translated");

  if (showCachedTranslation(messageEl)) {
    messageEl.setAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED, key);
    ensureTranslateButton(messageEl, getSettingsSnapshot);
    return;
  }

  setTranslateButtonLabel(messageEl, "busy", settings);
  await processIncomingMessage(messageEl, settings, getSettingsSnapshot, { showLoading: true });
}

function isPendingFor(messageEl, key) {
  return messageEl.getAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED) === `pending:${key}`;
}

function isRateLimitedFor(messageEl, key) {
  const value = messageEl.getAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED) || "";
  if (!value.startsWith(`limited:${key}:`)) return false;
  const until = Number(value.slice(`limited:${key}:`.length));
  return Number.isFinite(until) && Date.now() < until;
}

function collectMessageElements() {
  const map = new Map();

  function add(el, key) {
    if (!el || !key || map.has(key)) return;
    map.set(key, el);
  }

  for (const el of document.querySelectorAll('[id^="chat-messages-"]')) {
    add(el, el.id);
  }
  for (const el of document.querySelectorAll('[data-list-item-id*="chat-messages"]')) {
    add(el, el.getAttribute("data-list-item-id") || "");
  }
  for (const el of document.querySelectorAll('[class*="messageListItem"]')) {
    add(el, messageKey(el) || el.id || `mli-${map.size}`);
  }

  for (const content of document.querySelectorAll('[id^="message-content-"]')) {
    const wrap =
      content.closest('[id^="chat-messages-"]') ||
      content.closest('[data-list-item-id*="chat-messages"]') ||
      content.closest('[class*="messageListItem"]') ||
      content.closest('[role="listitem"]') ||
      content.closest("li") ||
      content;
    add(wrap, messageKey(wrap) || content.id);
  }

  if (map.size) return [...map.values()];

  const scroller = document.querySelector(
    '[data-list-id="chat-messages"], [class*="scrollerInner"][role="log"], [aria-label*="Messages in" i]'
  );
  if (!scroller) return [];

  for (const el of scroller.querySelectorAll('[role="listitem"], li, [class*="message_"]')) {
    const hasText =
      el.querySelector('[id^="message-content-"], [class*="markup_"], [class*="markup-"], [class*="messageContent"]');
    if (!hasText) continue;
    const key = messageKey(el) || el.id || `scroller-${map.size}-${(el.textContent || "").slice(0, 24)}`;
    add(el, key);
  }

  return [...map.values()];
}

function startMessageObserver(getSettingsSnapshot) {
  let scanTimer = 0;
  const queuedKeys = new Set();
  const inFlightKeys = new Set();
  const prefetchWaiters = [];
  let prefetchRunning = 0;
  const PREFETCH_PARALLEL = 1;

  async function prefetchMessage(messageEl) {
    const settings = getSettingsSnapshot();
    if (!settings?.enabled) return;

    const live = findLiveMessageEl(messageEl) || messageEl;
    const key = messageKey(live);
    if (!key) return;

    if (isSameLanguageMessage(live)) {
      ensureTranslateButton(live, getSettingsSnapshot);
      return;
    }

    if (isTranslationReady(live) || messageHasCachedTranslation(live)) {
      markTranslationReady(live);
      ensureTranslateButton(live, getSettingsSnapshot);
      return;
    }

    if (isRateLimitedFor(live, key) || isPendingFor(live, key)) return;

    inFlightKeys.add(key);
    try {
      await processIncomingMessage(live, settings, getSettingsSnapshot, {
        showLoading: false,
        prefetch: true,
      });
    } catch (err) {
      console.warn("[Discord Translate] prefetch failed:", err);
    } finally {
      inFlightKeys.delete(key);
      queuedKeys.delete(key);
    }
  }

  function pumpPrefetch() {
    while (prefetchRunning < PREFETCH_PARALLEL && prefetchWaiters.length) {
      const el = prefetchWaiters.shift();
      const key = messageKey(el);
      if (!key || inFlightKeys.has(key)) {
        queuedKeys.delete(key);
        continue;
      }
      prefetchRunning += 1;
      prefetchMessage(el).finally(() => {
        prefetchRunning -= 1;
        pumpPrefetch();
      });
    }
  }

  function enqueuePrefetch(messageEl) {
    const settings = getSettingsSnapshot();
    if (!settings?.enabled) return;

    const live = findLiveMessageEl(messageEl) || messageEl;
    const key = messageKey(live);
    if (!key) return;

    if (isSameLanguageMessage(live)) {
      ensureTranslateButton(live, getSettingsSnapshot);
      return;
    }

    if (isTranslationReady(live) || messageHasCachedTranslation(live)) {
      markTranslationReady(live);
      ensureTranslateButton(live, getSettingsSnapshot);
      return;
    }

    if (queuedKeys.has(key) || inFlightKeys.has(key)) return;
    if (isRateLimitedFor(live, key)) return;

    queuedKeys.add(key);
    prefetchWaiters.push(live);
    pumpPrefetch();
  }

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) enqueuePrefetch(entry.target);
      }
    },
    { root: null, rootMargin: "240px 0px", threshold: 0 }
  );

  function syncMessages() {
    const settings = getSettingsSnapshot();
    if (!settings?.enabled) {
      removeTranslateButtons();
      return;
    }

    for (const el of collectMessageElements()) {
      visibilityObserver.observe(el);

      if (isSameLanguageMessage(el)) {
        getTranslateWrap(el)?.remove();
        continue;
      }

      if (isTranslationReady(el) || messageHasCachedTranslation(el)) {
        markTranslationReady(el);
        ensureTranslateButton(el, getSettingsSnapshot);
        continue;
      }

      getTranslateWrap(el)?.remove();

      const rect = el.getBoundingClientRect();
      const inView =
        rect.bottom > -240 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight) + 240;
      if (inView) enqueuePrefetch(el);
    }
  }

  function scheduleSync() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      syncMessages();
    }, 200);
  }

  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length) {
        scheduleSync();
        return;
      }
    }
  });

  const root = document.body || document.documentElement;
  mutationObserver.observe(root, {
    childList: true,
    subtree: true,
  });

  window.setInterval(syncMessages, 3000);
  syncMessages();
}

function resetIncomingTranslations() {
  document.querySelectorAll(`[${DISCORD_TRANSLATE_ATTR.PROCESSED}]`).forEach((el) => {
    el.removeAttribute(DISCORD_TRANSLATE_ATTR.PROCESSED);
  });
  document.querySelectorAll(".discord-translate-inline-translation").forEach((el) => el.remove());
  document.querySelectorAll(`[${ORIGINAL_HTML}], .discord-translate-content-suppressed`).forEach((el) => {
    el.classList.remove("discord-translate-content-suppressed", "discord-translate-inline-error");
    el.removeAttribute(ORIGINAL_HTML);
    el.removeAttribute(TRANSLATED);
  });
  document.querySelectorAll(`[${CACHED_TEXT}], [${CACHED_SRC}]`).forEach((el) => {
    clearCachedTranslation(el);
  });
  messageViewState.clear();
  removeTranslateButtons();
  hideDiscordTranslateTooltip();
}
