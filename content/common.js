const DENIZEN_ATTR = {
  PROCESSED: "data-denizen-processed",
};

const DEFAULT_SETTINGS = {
  enabled: true,
  incoming: "en",
  outgoing: "ru",
};

const SETTINGS_STORAGE_KEY = "denizenSettings";

async function getSettings() {
  const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  const raw = stored[SETTINGS_STORAGE_KEY] || {};
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  merged.incoming =
    String(raw.incoming ?? raw.language ?? DEFAULT_SETTINGS.incoming).trim() ||
    DEFAULT_SETTINGS.incoming;
  merged.outgoing =
    String(raw.outgoing ?? DEFAULT_SETTINGS.outgoing).trim() || DEFAULT_SETTINGS.outgoing;
  return merged;
}

async function translateText(text, to, from = "auto") {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await browser.runtime.sendMessage({
    type: "denizen:translate",
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

function sameLanguage(detected, language) {
  const a = normalizeLang(detected);
  const b = normalizeLang(language);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function translationUnchanged(result, text, language) {
  return sameLanguage(result.detectedFrom, language) || result.text.trim() === text.trim();
}

function languageLabel(code) {
  const raw = String(code || "").trim();
  if (!raw || raw.toLowerCase() === "auto") return "";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(raw);
    if (name) return name;
  } catch {}
  try {
    const base = raw.split("-")[0];
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(base);
    if (name) return name;
  } catch {}
  return raw;
}

function denizenIconSvg() {
  return (
    '<svg class="denizen-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m5 8 6 6"/>' +
    '<path d="m4 14 6-6 2-3"/>' +
    '<path d="M2 5h12"/>' +
    '<path d="M7 2h1"/>' +
    '<path d="m22 22-5-10-5 10"/>' +
    '<path d="M14 18h6"/>' +
    "</svg>"
  );
}

function ensureDenizenTooltip() {
  let tip = document.querySelector(".denizen-tooltip");
  if (tip) return tip;

  tip = document.createElement("div");
  tip.className = "denizen-tooltip denizen-tooltip--top";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  tip.innerHTML =
    '<div class="denizen-tooltip-pointer"></div>' +
    '<div class="denizen-tooltip-content"></div>';
  (document.body || document.documentElement).appendChild(tip);
  return tip;
}

function hideDenizenTooltip() {
  const tip = document.querySelector(".denizen-tooltip");
  if (!tip) return;
  tip.hidden = true;
  tip.classList.remove("denizen-tooltip--visible");
}

function showDenizenTooltip(anchor, label) {
  if (!anchor || !label) return;
  const tip = ensureDenizenTooltip();
  const content = tip.querySelector(".denizen-tooltip-content");
  if (content) content.textContent = label;

  tip.hidden = false;
  tip.style.left = "0px";
  tip.style.top = "0px";
  tip.classList.add("denizen-tooltip--visible");

  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const left = rect.left + rect.width / 2;
  const top = rect.top - tipRect.height - 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}

function bindDenizenTooltip(btn) {
  if (!btn || btn.dataset.denizenTooltipBound) return;
  btn.dataset.denizenTooltipBound = "1";

  let showTimer = 0;

  const scheduleShow = () => {
    if (showTimer) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      showTimer = 0;
      showDenizenTooltip(btn, btn.getAttribute("aria-label") || "");
    }, 300);
  };

  const hide = () => {
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = 0;
    }
    hideDenizenTooltip();
  };

  btn.addEventListener("mouseenter", scheduleShow);
  btn.addEventListener("mouseleave", hide);
  btn.addEventListener("focus", scheduleShow);
  btn.addEventListener("blur", hide);
  btn.addEventListener("click", hide);
}

function setDenizenIconButton(btn, label, { active = false, busy = false } = {}) {
  if (!btn) return;
  if (!btn.querySelector(".denizen-icon")) {
    btn.innerHTML = denizenIconSvg();
  }
  btn.setAttribute("aria-label", label);
  btn.removeAttribute("title");
  btn.classList.toggle("denizen-btn--active", active);
  btn.classList.toggle("denizen-btn--busy", busy);
  bindDenizenTooltip(btn);
}
