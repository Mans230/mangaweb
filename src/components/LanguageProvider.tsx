import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Language = "ar" | "en";

interface LanguageContextValue {
  lang: Language;
  dir: "rtl" | "ltr";
  toggleLanguage: () => void;
  t: (ar: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "ar",
  dir: "rtl",
  toggleLanguage: () => {},
  t: (ar) => ar,
});

const STORAGE_KEY = "zeko-lang";

function getInitialLang(): Language {
  if (typeof window === "undefined") return "ar";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "en" ? "en" : "ar";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(getInitialLang);
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang, dir]);

  const toggleLanguage = () => setLang((p) => (p === "ar" ? "en" : "ar"));
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  return (
    <LanguageContext.Provider value={{ lang, dir, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
