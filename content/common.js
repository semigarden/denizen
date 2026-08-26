const DISCORD_TRANSLATE_ATTR = {
  PROCESSED: "data-discord-translate-processed",
};

const DEFAULT_SETTINGS = {
  enabled: true,
  incoming: "en",
  outgoing: "ja",
};

const SETTINGS_STORAGE_KEY = "discordTranslateSettings";

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
    type: "discord-translate:translate",
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

function createDiscordTranslateIcon() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "discord-translate-icon");
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const d of [
    "m5 8 6 6",
    "m4 14 6-6 2-3",
    "M2 5h12",
    "M7 2h1",
    "m22 22-5-10-5 10",
    "M14 18h6",
  ]) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function ensureDiscordTranslateTooltip() {
  let tip = document.querySelector(".discord-translate-tooltip");
  if (tip) return tip;

  tip = document.createElement("div");
  tip.className = "discord-translate-tooltip discord-translate-tooltip--top";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  tip.innerHTML =
    '<div class="discord-translate-tooltip-pointer"></div>' +
    '<div class="discord-translate-tooltip-content"></div>';
  (document.body || document.documentElement).appendChild(tip);
  return tip;
}

function hideDiscordTranslateTooltip() {
  const tip = document.querySelector(".discord-translate-tooltip");
  if (!tip) return;
  tip.hidden = true;
  tip.classList.remove("discord-translate-tooltip--visible");
}

function showDiscordTranslateTooltip(anchor, label) {
  if (!anchor || !label) return;
  const tip = ensureDiscordTranslateTooltip();
  const content = tip.querySelector(".discord-translate-tooltip-content");
  if (content) content.textContent = label;

  tip.hidden = false;
  tip.style.left = "0px";
  tip.style.top = "0px";
  tip.classList.add("discord-translate-tooltip--visible");

  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const left = rect.left + rect.width / 2;
  const top = rect.top - tipRect.height - 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}

function bindDiscordTranslateTooltip(btn) {
  if (!btn || btn.dataset.discordTranslateTooltipBound) return;
  btn.dataset.discordTranslateTooltipBound = "1";

  let showTimer = 0;

  const scheduleShow = () => {
    if (showTimer) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      showTimer = 0;
      showDiscordTranslateTooltip(btn, btn.getAttribute("aria-label") || "");
    }, 300);
  };

  const hide = () => {
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = 0;
    }
    hideDiscordTranslateTooltip();
  };

  btn.addEventListener("mouseenter", scheduleShow);
  btn.addEventListener("mouseleave", hide);
  btn.addEventListener("focus", scheduleShow);
  btn.addEventListener("blur", hide);
  btn.addEventListener("click", hide);
}

function setDiscordTranslateIconButton(btn, label, { active = false, busy = false } = {}) {
  if (!btn) return;
  if (!btn.querySelector(".discord-translate-icon")) {
    btn.replaceChildren(createDiscordTranslateIcon());
  }
  btn.setAttribute("aria-label", label);
  btn.removeAttribute("title");
  btn.classList.toggle("discord-translate-btn--active", active);
  btn.classList.toggle("discord-translate-btn--busy", busy);
  bindDiscordTranslateTooltip(btn);
}
