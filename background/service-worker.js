import { MSG } from "../shared/messages.js";
import {
  deeplBaseUrl,
  getSettings,
  normalizeLibreUrl,
  toLibreLang,
} from "../shared/settings.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const CACHE_STORAGE_KEY = "denizenTranslateCache";
const MIN_GAP_MS = 350;
const MAX_RETRIES = 4;

/** @type {Map<string, { text: string, detectedFrom: string, at: number }>} */
let cache = new Map();
let cacheLoaded = false;
let cacheSaveTimer = 0;

/** @type {Promise<void>} */
let queueTail = Promise.resolve();
let lastRequestAt = 0;
let cooldownUntil = 0;

function cacheKey(provider, text, from, to) {
  return `${provider}|${from}|${to}|${text}`;
}

async function ensureCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const stored = await browser.storage.local.get(CACHE_STORAGE_KEY);
    const entries = stored[CACHE_STORAGE_KEY];
    if (Array.isArray(entries)) {
      const now = Date.now();
      for (const row of entries) {
        if (!row?.key || !row?.text) continue;
        if (now - (row.at || 0) > CACHE_TTL_MS) continue;
        cache.set(row.key, {
          text: row.text,
          detectedFrom: row.detectedFrom || "unknown",
          at: row.at || now,
        });
      }
    }
  } catch {
    cache = new Map();
  }
}

function scheduleCacheSave() {
  if (cacheSaveTimer) return;
  cacheSaveTimer = setTimeout(async () => {
    cacheSaveTimer = 0;
    const now = Date.now();
    const rows = [];
    for (const [key, value] of cache.entries()) {
      if (now - value.at > CACHE_TTL_MS) {
        cache.delete(key);
        continue;
      }
      rows.push({
        key,
        text: value.text,
        detectedFrom: value.detectedFrom,
        at: value.at,
      });
    }
    rows.sort((a, b) => b.at - a.at);
    await browser.storage.local.set({
      [CACHE_STORAGE_KEY]: rows.slice(0, CACHE_MAX),
    });
  }, 500);
}

function pruneCache() {
  if (cache.size <= CACHE_MAX) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of entries.slice(0, cache.size - CACHE_MAX)) {
    cache.delete(key);
  }
}

function enqueue(task) {
  const run = queueTail.then(task, task);
  queueTail = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function waitForSlot() {
  const now = Date.now();
  const waitForCooldown = Math.max(0, cooldownUntil - now);
  const waitForGap = Math.max(0, MIN_GAP_MS - (now - lastRequestAt));
  const waitMs = Math.max(waitForCooldown, waitForGap);
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

function rememberResult(key, result) {
  cache.set(key, { ...result, at: Date.now() });
  pruneCache();
  scheduleCacheSave();
  return result;
}

/**
 * @param {{ text: string, from?: string, to: string }} params
 */
async function translateWithDeepL({ text, from, to }) {
  const settings = await getSettings();
  const apiKey = settings.apiKey?.trim();
  if (!apiKey) {
    throw new Error("DeepL API key missing. Open Denizen settings and paste your key.");
  }

  const key = cacheKey("deepl", text, from || "auto", to);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { text: hit.text, detectedFrom: hit.detectedFrom };
  }

  return enqueue(async () => {
    const again = cache.get(key);
    if (again && Date.now() - again.at < CACHE_TTL_MS) {
      return { text: again.text, detectedFrom: again.detectedFrom };
    }

    let attempt = 0;
    while (true) {
      attempt += 1;
      await waitForSlot();
      lastRequestAt = Date.now();

      const body = {
        text: [text],
        target_lang: to,
      };
      if (from && from !== "auto") {
        body.source_lang = from;
      }

      const res = await fetch(`${deeplBaseUrl(apiKey)}/v2/translate`, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(60_000, 2000 * 2 ** (attempt - 1));
        cooldownUntil = Date.now() + backoff;
        if (attempt >= MAX_RETRIES) {
          throw new Error(`DeepL rate limited (429). Retry in ~${Math.ceil(backoff / 1000)}s.`);
        }
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`DeepL ${res.status}: ${detail || res.statusText}`);
      }

      const data = await res.json();
      const translation = data?.translations?.[0];
      if (!translation?.text) {
        throw new Error("DeepL returned no translation");
      }

      return rememberResult(key, {
        text: translation.text,
        detectedFrom: translation.detected_source_language || from || "unknown",
      });
    }
  });
}

/**
 * @param {{ text: string, from?: string, to: string }} params
 */
async function translateWithLibreTranslate({ text, from, to }) {
  const settings = await getSettings();
  const base = normalizeLibreUrl(settings.libreUrl);
  if (!base) {
    throw new Error("LibreTranslate URL missing. Set it in Denizen settings.");
  }

  const source = toLibreLang(from || "auto");
  const target = toLibreLang(to);
  const key = cacheKey("libretranslate", text, source, target);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { text: hit.text, detectedFrom: hit.detectedFrom };
  }

  const body = {
    q: text,
    source,
    target,
    format: "text",
  };
  const libreKey = settings.libreApiKey?.trim();
  if (libreKey) body.api_key = libreKey;

  let res;
  try {
    res = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `LibreTranslate unreachable at ${base}. Is the container running with --network=host? (${err instanceof Error ? err.message : String(err)})`
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LibreTranslate ${res.status}: ${detail || res.statusText}`);
  }

  const data = await res.json();
  const translated = data?.translatedText;
  if (!translated) {
    throw new Error("LibreTranslate returned no translation");
  }

  const detected =
    data?.detectedLanguage?.language ||
    data?.detected_source_language ||
    (source !== "auto" ? source : "unknown");

  return rememberResult(key, {
    text: translated,
    detectedFrom: String(detected).toUpperCase(),
  });
}

/**
 * @param {{ text: string, from?: string, to: string }} params
 */
async function translateText(params) {
  await ensureCache();
  const settings = await getSettings();
  if (settings.provider === "libretranslate") {
    return translateWithLibreTranslate(params);
  }
  return translateWithDeepL(params);
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") return;

    if (message.type === MSG.PING) {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === MSG.GET_SETTINGS) {
      sendResponse({ ok: true, settings: await getSettings() });
      return;
    }

    if (message.type === MSG.TRANSLATE) {
      const { text, from, to, requestId } = message;
      if (!text || !to) {
        sendResponse({ ok: false, requestId, error: "text and to are required" });
        return;
      }
      try {
        const result = await translateText({ text, from, to });
        sendResponse({ ok: true, requestId, ...result });
      } catch (err) {
        sendResponse({
          ok: false,
          requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();

  return true;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.denizenSettings) return;
  browser.tabs.query({ url: ["*://discord.com/*", "*://ptb.discord.com/*", "*://canary.discord.com/*"] }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      browser.tabs.sendMessage(tab.id, {
        type: MSG.SETTINGS_UPDATED,
        settings: changes.denizenSettings.newValue,
      }).catch(() => {});
    }
  });
});

ensureCache();
