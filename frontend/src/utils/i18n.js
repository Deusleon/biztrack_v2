import en from "../lang/en.json";
import sw from "../lang/sw.json";

const translations = { en, sw };

// A toast often arrives as a finished English sentence from the server. Map that sentence
// back to its key so it can be shown in the language the person is actually using.
const sentenceToKey = new Map();
for (const dict of [en, sw]) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value === "string" && value && !sentenceToKey.has(value)) sentenceToKey.set(value, key);
  }
}

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

  const raw = String(key || "");
  const readable = raw.includes(" ") ? raw : raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const mapped = sentenceToKey.get(String(key || ""));
  let text = translations[lang]?.[key] || translations.en?.[key] || (mapped ? translations[lang]?.[mapped] || translations.en?.[mapped] : "") || readable;

  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.split(`{${placeholder}}`).join(value == null ? "" : String(value));
  }

  return text;
}

// Utility to detect language in priority order
function detectLanguage() {
  // The language on screen (the SW / EN switch, saved as soon as it changes) comes first.
  // The account's preferred language is the fallback when the screen has not chosen one yet.
  if (typeof window !== "undefined") {
    const chosen = localStorage.getItem("lang");
    if (chosen === "en" || chosen === "sw") return chosen;
    const preferred = window.__auth_user?.preferred_language;
    if (preferred === "en" || preferred === "sw") return preferred;
  }
  const headerLang = typeof navigator !== "undefined" ? navigator.language?.split("-")[0] : "";
  if (headerLang === "en" || headerLang === "sw") return headerLang;
  return "en";
}
