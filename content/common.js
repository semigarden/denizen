const DENIZEN_MSG = {
  TRANSLATE: "denizen:translate",
  GET_SETTINGS: "denizen:getSettings",
  SETTINGS_UPDATED: "denizen:settingsUpdated",
};

const DENIZEN_ATTR = {
  PROCESSED: "data-denizen-processed",
  TRANSLATION: "data-denizen-translation",
};

const SELECTORS = {
  messageListItem: 'li[id^="chat-messages-"]',
  messageContent: '[id^="message-content-"]',
  repliedTextContent:
    '[class*="repliedTextContent"], [class*="repliedTextPreview"], [class*="messageContent_"][class*="replied"]',
  composer: 'div[role="textbox"][data-slate-editor="true"]',
  form: "form",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @returns {Promise<object>}
 */
async function getSettings() {
  const res = await browser.runtime.sendMessage({ type: DENIZEN_MSG.GET_SETTINGS });
  if (!res?.ok) throw new Error(res?.error || "Failed to load settings");
  return res.settings;
}

/**
 * @param {string} text
 * @param {string} to
 * @param {string} [from]
 */
async function translateText(text, to, from = "auto") {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await browser.runtime.sendMessage({
    type: DENIZEN_MSG.TRANSLATE,
    requestId,
    text,
    from,
    to,
  });
  if (!res?.ok) throw new Error(res?.error || "Translation failed");
  return res;
}

function normalizeLang(code) {
  return String(code || "").toUpperCase();
}

function sameLanguage(detected, myLanguage) {
  const a = normalizeLang(detected);
  const b = normalizeLang(myLanguage);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}
