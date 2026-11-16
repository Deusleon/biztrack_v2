import { createContext, useContext, useState, useEffect } from "react";

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => {
    // The last language they chose on screen, then the language saved on their account.
    if (typeof window === "undefined") return "en";
    const chosen = localStorage.getItem("lang");
    if (chosen === "en" || chosen === "sw") return chosen;
    const preferred = window.__auth_user?.preferred_language;
    return preferred === "sw" || preferred === "en" ? preferred : "en";
  });

  const setLang = (next) => {
    const code = next === "sw" ? "sw" : "en";
    try { localStorage.setItem("lang", code); } catch { /* private mode */ }
    setLangState(code);
  };

  useEffect(() => {
    try { localStorage.setItem("lang", lang); } catch { /* private mode */ }
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
