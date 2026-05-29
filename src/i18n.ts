import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en/translation.json";
import zhTranslations from "./locales/zh-TW/translation.json";
import { useUiPreferences } from "./state/uiPreferences";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      "zh-TW": {
        translation: zhTranslations,
      },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already safe from XSS
    },
  });

// Subscribe to Zustand store to sync i18n language with user preference
useUiPreferences.subscribe((state, prevState) => {
  if (state.nameLocale !== prevState.nameLocale) {
    if (state.nameLocale === "auto") {
      // Use browser detector by reloading or changing to detected
      // But since we can't easily re-detect without reloading, we can just grab navigator.language
      const browserLang = navigator.language.startsWith("zh") ? "zh-TW" : "en";
      i18n.changeLanguage(browserLang);
    } else {
      const langMap: Record<string, string> = {
        "zh-Hant": "zh-TW",
        "en": "en",
      };
      i18n.changeLanguage(langMap[state.nameLocale] || "en");
    }
  }
});

// Initial sync
const initialLocale = useUiPreferences.getState().nameLocale;
if (initialLocale === "auto") {
  const browserLang = navigator.language.startsWith("zh") ? "zh-TW" : "en";
  i18n.changeLanguage(browserLang);
} else {
  const langMap: Record<string, string> = {
    "zh-Hant": "zh-TW",
    "en": "en",
  };
  i18n.changeLanguage(langMap[initialLocale] || "en");
}

export default i18n;
