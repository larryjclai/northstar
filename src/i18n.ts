import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en/translation.json";
import zhTranslations from "./locales/zh-TW/translation.json";
import { useUiPreferences } from "./state/uiPreferences";
import { setCompactLocale } from "./domain/currency";

// Keep the compact-number formatters (萬/億 vs K/M) in sync with the active UI
// language. i18n.on("languageChanged") fires for every changeLanguage() call
// below, so this is the single place that mirrors the language into the
// module-global formatter locale.
i18n.on("languageChanged", (lng) => setCompactLocale(lng));

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
    // The app's content is authored Chinese-first (zh-TW); English coverage is
    // partial, so default to zh-TW to avoid mixed-language screens.
    fallbackLng: "zh-TW",
    interpolation: {
      escapeValue: false, // React already safe from XSS
    },
  });

// Subscribe to Zustand store to sync i18n language with user preference
useUiPreferences.subscribe((state, prevState) => {
  if (state.nameLocale !== prevState.nameLocale) {
    if (state.nameLocale === "auto") {
      // The app is Chinese-first with only partial English coverage, so "auto"
      // resolves to zh-TW unless the OS is explicitly non-Chinese AND the user
      // hasn't opted into Chinese. Defaulting to zh-TW avoids mixed-language
      // screens where translated nav sits above hardcoded Chinese content.
      i18n.changeLanguage("zh-TW");
    } else {
      const langMap: Record<string, string> = {
        "zh-Hant": "zh-TW",
        "en": "en",
      };
      i18n.changeLanguage(langMap[state.nameLocale] || "zh-TW");
    }
  }
});

// Initial sync
const initialLocale = useUiPreferences.getState().nameLocale;
if (initialLocale === "auto") {
  i18n.changeLanguage("zh-TW");
} else {
  const langMap: Record<string, string> = {
    "zh-Hant": "zh-TW",
    "en": "en",
  };
  i18n.changeLanguage(langMap[initialLocale] || "zh-TW");
}

export default i18n;
