// utils/translate.js
import en from '../locales/en.json' with { type: 'json' };
import sw from '../locales/sw.json' with { type: 'json' };
const translations = { en, sw };

const t = (key, options = {}, lang = "en") => {
  if (typeof options === "string") {
    lang = options;
    options = {};
  }

  const normalizedLang = String(lang || "en")
    .trim()
    .toLowerCase()
    .split("-")[0];

  const dictionary = translations[normalizedLang] || translations.en;
  let text = dictionary[key] || translations.en[key] || key;

  Object.keys(options).forEach((k) => {
    const regex = new RegExp(`{{${k}}}`, "g");
    text = text.replace(regex, String(options[k]));
  });

  return text;
};

export { t };

