import { normalizeLibreUrl } from "./settings.js";

export const DISCORD_ORIGINS = [
  "https://discord.com/*",
  "https://ptb.discord.com/*",
  "https://canary.discord.com/*",
];

export const DEEPL_ORIGINS = [
  "https://api-free.deepl.com/*",
  "https://api.deepl.com/*",
];

/**
 * @param {string} url
 */
export function originPatternFromUrl(url) {
  const parsed = new URL(normalizeLibreUrl(url));
  return `${parsed.protocol}//${parsed.host}/*`;
}

/**
 * @param {import("./settings.js").DenizenSettings} settings
 */
export function requiredOrigins(settings) {
  const origins = [...DISCORD_ORIGINS];
  if (settings.provider === "libretranslate") {
    origins.push(originPatternFromUrl(settings.libreUrl));
  } else {
    origins.push(...DEEPL_ORIGINS);
  }
  return [...new Set(origins)];
}

/**
 * @param {string[]} origins
 */
export async function missingOrigins(origins) {
  const missing = [];
  for (const origin of origins) {
    const granted = await browser.permissions.contains({ origins: [origin] });
    if (!granted) missing.push(origin);
  }
  return missing;
}

/**
 * @param {import("./settings.js").DenizenSettings} settings
 */
export async function ensureDenizenPermissions(settings) {
  const origins = requiredOrigins(settings);
  const missing = await missingOrigins(origins);
  if (!missing.length) return true;
  return browser.permissions.request({ origins: missing });
}
