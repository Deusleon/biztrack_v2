import en from "../lang/en.json";
import sw from "../lang/sw.json";

const translations = { en, sw };

export function t(key, langOrReplacements, maybeReplacements) {
  let lang = "en";
  let replacements = {};

  // Case 1: t("key", "sw", { name: "John" })
  if (typeof langOrReplacements === "string") {
    lang = langOrReplacements;
    replacements = maybeReplacements || {};
  }
  // Case 2: t("key", { name: "John" }) — lang auto-detect
  else if (typeof langOrReplacements === "object") {
    replacements = langOrReplacements;
    lang = detectLanguage(); // defined below
  }
  // Case 3: t("key") — no replacements
  else {
    lang = detectLanguage();
  }

  let text = translations[lang]?.[key] || key;

  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.replace(`{${placeholder}}`, value);
  }

  return text;
}

// Utility to detect language in priority order
function detectLanguage() {
  // 1. user.preferred_language from AuthContext (if available in globalThis)
  if (typeof window !== "undefined" && window.__auth_user?.preferred_language) {
    return window.__auth_user.preferred_language;
  }

  // 2. Local storage
  const localLang = localStorage.getItem("lang");
  if (localLang) return localLang;

  // 3. Header fallback (not accessible in frontend context, but placeholder)
  const headerLang = navigator.language?.split("-")[0];
  if (["en", "sw"].includes(headerLang)) return headerLang;

  // 4. Default fallback
  return "en";
}
