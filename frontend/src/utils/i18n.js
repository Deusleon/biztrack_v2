import en from "../lang/en.json";
import sw from "../lang/sw.json";
import backendEn from "../../../backend/src/locales/en.json";
import backendSw from "../../../backend/src/locales/sw.json";

const translations = { en, sw };
const serverTranslations = { en: backendEn, sw: backendSw };

// A toast often arrives as a finished sentence, or as a message key. Map every known
// sentence — including the wording the server uses — back to its key.
const sentenceToKey = new Map();
const templates = [];

function escapeReg(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTemplate(value) {
  if (!value.includes("{")) return null;
  const literal = value.replace(/\{\{\w+\}\}|\{\w+\}/g, "").trim();
  if (literal.length < 8) return null;
  const names = [];
  let pattern = "";
  const token = /\{\{(\w+)\}\}|\{(\w+)\}/g;
  let last = 0;
  let match;
  while ((match = token.exec(value))) {
    pattern += escapeReg(value.slice(last, match.index));
    names.push(match[1] || match[2]);
    pattern += "(.+?)";
    last = match.index + match[0].length;
  }
  if (!names.length) return null;
  pattern += escapeReg(value.slice(last));
  return { names, re: new RegExp(`^${pattern}$`) };
}

function addPhrases(dict) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== "string" || !value) continue;
    if (!sentenceToKey.has(value)) sentenceToKey.set(value, key);
    const compiled = compileTemplate(value);
    if (compiled) templates.push({ key, length: value.length, ...compiled });
  }
}

addPhrases(en);
addPhrases(sw);
addPhrases(backendEn);
addPhrases(backendSw);
templates.sort((a, b) => b.length - a.length);

function fill(template, vars) {
  let text = template;
  for (const [name, value] of Object.entries(vars)) {
    text = text.split(`{{${name}}}`).join(value == null ? "" : String(value));
    text = text.split(`{${name}}`).join(value == null ? "" : String(value));
  }
  return text;
}

function matchTemplate(message) {
  for (const template of templates) {
    const found = template.re.exec(message);
    if (!found) continue;
    const vars = {};
    template.names.forEach((name, index) => { vars[name] = found[index + 1]; });
    return { key: template.key, vars };
  }
  return null;
}

/** The language toasts and server replies use: the account's language, then the language on screen. */
export function toastLanguage(screenLang) {
  try {
    const preferred = window.__auth_user?.preferred_language;
    if (preferred === "en" || preferred === "sw") return preferred;
  } catch { /* not in a browser */ }
  if (screenLang === "en" || screenLang === "sw") return screenLang;
  return detectLanguage();
}

function textFor(key, lang, vars) {
  const raw = translations[lang]?.[key] || serverTranslations[lang]?.[key] || translations.en?.[key] || serverTranslations.en?.[key];
  return raw ? fill(raw, vars) : "";
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

  const raw = String(key || "").trim();
  const direct = textFor(raw, lang, replacements);
  if (direct && (translations[lang]?.[raw] || translations.en?.[raw] || serverTranslations[lang]?.[raw] || serverTranslations.en?.[raw])) {
    return direct;
  }

  const mapped = sentenceToKey.get(raw);
  if (mapped) {
    const phrase = textFor(mapped, lang, replacements);
    if (phrase) return phrase;
  }

  const templated = matchTemplate(raw);
  if (templated) {
    const phrase = textFor(templated.key, lang, { ...templated.vars, ...replacements });
    if (phrase) return phrase;
  }

  const readable = raw.includes(" ") ? raw : raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  let text = direct || readable;
  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.split(`{${placeholder}}`).join(value == null ? "" : String(value));
    text = text.split(`{{${placeholder}}}`).join(value == null ? "" : String(value));
  }
  return text;
}

// Utility to detect language in priority order
function detectLanguage() {
  // Toasts and helpers follow the language saved on the account, then the language on screen.
  if (typeof window !== "undefined") {
    const preferred = window.__auth_user?.preferred_language;
    if (preferred === "en" || preferred === "sw") return preferred;
    const chosen = localStorage.getItem("lang");
    if (chosen === "en" || chosen === "sw") return chosen;
  }
  const headerLang = typeof navigator !== "undefined" ? navigator.language?.split("-")[0] : "";
  if (headerLang === "en" || headerLang === "sw") return headerLang;
  return "en";
}
