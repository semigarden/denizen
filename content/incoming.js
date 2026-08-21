function extractMessageText(contentEl) {
  if (!contentEl) return "";
  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll(".denizen-translation, [data-denizen-translation]").forEach((n) => n.remove());
  return (clone.innerText || "").trim();
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
    return el;
  }

  if (all.length) return all[all.length - 1];

  const fallbacks = [...messageEl.querySelectorAll('[class*="messageContent"]')];
  for (const el of fallbacks) {
    if (replyRoot && replyRoot.contains(el)) continue;
    if (el.closest('[class*="repliedMessage"], [class*="replyBar"]')) continue;
    return el;
  }
  return null;
}

function findReplyContent(messageEl) {
  const replyRoot = findReplyRoot(messageEl);
  if (!replyRoot) return null;

  const nested =
    replyRoot.querySelector('[class*="repliedTextContent"]') ||
    replyRoot.querySelector('[class*="repliedTextPreview"]') ||
    replyRoot.querySelector('[class*="messageContent"]');

  if (nested && extractMessageText(nested)) return nested;
  if (extractMessageText(replyRoot)) return replyRoot;
  return null;
}

function translationAnchor(contentEl, messageEl) {
  const replyRoot = findReplyRoot(messageEl);
  if (replyRoot && (contentEl === replyRoot || replyRoot.contains(contentEl))) {
    return replyRoot;
  }
  return contentEl;
}

function collectTranslateTargets(messageEl) {
  /** @type {{ el: Element, anchor: Element }[]} */
  const targets = [];
  const reply = findReplyContent(messageEl);
  const main = findMessageContent(messageEl);

  if (reply) {
    targets.push({ el: reply, anchor: translationAnchor(reply, messageEl) });
  }
  if (main && main !== reply && !(reply && reply.contains(main))) {
    targets.push({ el: main, anchor: main });
  }
  return targets;
}

function messageKey(messageEl) {
  return messageEl.id || "";
}

function clearTranslationNodes(messageEl) {
  messageEl.querySelectorAll(".denizen-translation").forEach((n) => n.remove());
}

function ensureTranslationNode(anchorEl) {
  if (!anchorEl.dataset.denizenTargetId) {
    anchorEl.dataset.denizenTargetId = `t-${Math.random().toString(36).slice(2, 9)}`;
  }
  const tid = anchorEl.dataset.denizenTargetId;

  let node = anchorEl.nextElementSibling;
  if (!(node?.classList?.contains("denizen-translation") && node.dataset.denizenFor === tid)) {
    node = null;
  }
  if (node) return node;

  node = document.createElement("div");
  node.className = "denizen-translation";
  node.setAttribute(DENIZEN_ATTR.TRANSLATION, "1");
  node.dataset.denizenFor = tid;
  node.setAttribute("aria-label", "Translation");
  anchorEl.insertAdjacentElement("afterend", node);
  return node;
}

function isProcessedFor(messageEl, key) {
  return messageEl.getAttribute(DENIZEN_ATTR.PROCESSED) === key;
}

function isPendingFor(messageEl, key) {
  return messageEl.getAttribute(DENIZEN_ATTR.PROCESSED) === `pending:${key}`;
}

function isRateLimitedFor(messageEl, key) {
  const value = messageEl.getAttribute(DENIZEN_ATTR.PROCESSED) || "";
  if (!value.startsWith(`limited:${key}:`)) return false;
  const until = Number(value.slice(`limited:${key}:`.length));
  return Number.isFinite(until) && Date.now() < until;
}

/** @type {Set<string>} */
const queuedKeys = new Set();
/** @type {string[]} */
const queue = [];
let draining = false;

async function translateTarget(target, settings) {
  const text = extractMessageText(target.el);
  if (!text) return false;

  const result = await translateText(text, settings.myLanguage, settings.sourceLanguage || "auto");
  if (sameLanguage(result.detectedFrom, settings.myLanguage) || result.text.trim() === text.trim()) {
    return false;
  }

  const node = ensureTranslationNode(target.anchor);
  node.textContent = result.text;
  return true;
}

async function processIncomingMessage(messageEl, settings) {
  if (!settings.enabled || !settings.translateIncoming) return;

  const key = messageKey(messageEl);
  if (!key) return;
  if (isProcessedFor(messageEl, key) || isPendingFor(messageEl, key)) return;
  if (isRateLimitedFor(messageEl, key)) return;

  const targets = collectTranslateTargets(messageEl);
  if (!targets.length) {
    messageEl.setAttribute(DENIZEN_ATTR.PROCESSED, key);
    return;
  }

  const hasText = targets.some((t) => extractMessageText(t.el));
  if (!hasText) {
    clearTranslationNodes(messageEl);
    messageEl.setAttribute(DENIZEN_ATTR.PROCESSED, key);
    return;
  }

  clearTranslationNodes(messageEl);
  messageEl.setAttribute(DENIZEN_ATTR.PROCESSED, `pending:${key}`);

  let rateLimited = false;
  let hardError = false;

  for (const target of targets) {
    try {
      await translateTarget(target, settings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("rate limited")) {
        rateLimited = true;
      } else {
        hardError = true;
      }
      console.warn("[Denizen] translate target failed:", err);
    }
  }

  if (messageKey(messageEl) !== key) return;

  if (rateLimited) {
    const until = Date.now() + 30_000;
    messageEl.setAttribute(DENIZEN_ATTR.PROCESSED, `limited:${key}:${until}`);
    return;
  }

  if (hardError && !messageEl.querySelector(".denizen-translation")) {
    messageEl.removeAttribute(DENIZEN_ATTR.PROCESSED);
    return;
  }

  messageEl.setAttribute(DENIZEN_ATTR.PROCESSED, key);
}

function enqueueMessage(messageEl, getSettingsSnapshot) {
  const key = messageKey(messageEl);
  if (!key || queuedKeys.has(key)) return;
  queuedKeys.add(key);
  queue.push(key);

  if (!draining) {
    draining = true;
    drainQueue(getSettingsSnapshot);
  }
}

async function drainQueue(getSettingsSnapshot) {
  while (queue.length) {
    const key = queue.shift();
    queuedKeys.delete(key);
    const settings = getSettingsSnapshot();
    if (!settings?.enabled || !settings.translateIncoming) continue;

    const messageEl = document.getElementById(key);
    if (!messageEl) continue;

    await processIncomingMessage(messageEl, settings);
  }
  draining = false;
}

function collectMessageElements() {
  const byId = document.querySelectorAll(SELECTORS.messageListItem);
  if (byId.length) return byId;
  return document.querySelectorAll('[id^="chat-messages-"]');
}

function scanVisibleMessages(getSettingsSnapshot) {
  const settings = getSettingsSnapshot();
  if (!settings?.enabled || !settings.translateIncoming) return;
  for (const el of collectMessageElements()) {
    enqueueMessage(el, getSettingsSnapshot);
  }
}

function startMessageObserver(getSettingsSnapshot) {
  let scanTimer = 0;

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanVisibleMessages(getSettingsSnapshot);
    }, 250);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length) {
        scheduleScan();
        return;
      }
      if (mutation.type === "attributes" && mutation.attributeName === "id") {
        const t = mutation.target;
        if (t instanceof Element && t.id && t.id.startsWith("chat-messages-")) {
          t.removeAttribute(DENIZEN_ATTR.PROCESSED);
          scheduleScan();
          return;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["id"],
  });

  const intervalId = window.setInterval(() => {
    scanVisibleMessages(getSettingsSnapshot);
  }, 4000);

  scanVisibleMessages(getSettingsSnapshot);

  return () => {
    observer.disconnect();
    window.clearInterval(intervalId);
    if (scanTimer) window.clearTimeout(scanTimer);
  };
}
