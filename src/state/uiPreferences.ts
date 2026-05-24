import { useEffect } from "react";
import { create } from "zustand";
import { setPrivacyMaskOn } from "../domain/currency";
import type { NameLocalePreference } from "../domain/assetName";

export type { NameLocalePreference };

export interface UiPreferences {
  privacyMode: boolean;
  nameLocale: NameLocalePreference;
  setPrivacyMode: (value: boolean) => void;
  togglePrivacyMode: () => void;
  setNameLocale: (value: NameLocalePreference) => void;
}

const STORAGE_KEY = "northstar.uiPreferences.v1";

interface PersistedShape {
  privacyMode: boolean;
  nameLocale: NameLocalePreference;
}

function loadPersisted(): PersistedShape {
  if (typeof window === "undefined") return { privacyMode: false, nameLocale: "auto" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { privacyMode: false, nameLocale: "auto" };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      privacyMode: typeof parsed.privacyMode === "boolean" ? parsed.privacyMode : false,
      nameLocale:
        parsed.nameLocale === "zh-Hant" || parsed.nameLocale === "en"
          ? parsed.nameLocale
          : "auto",
    };
  } catch {
    return { privacyMode: false, nameLocale: "auto" };
  }
}

function persist(state: PersistedShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore — quota or private mode
  }
}

const initial = loadPersisted();

export const useUiPreferences = create<UiPreferences>((set, get) => ({
  privacyMode: initial.privacyMode,
  nameLocale: initial.nameLocale,
  setPrivacyMode(value) {
    set({ privacyMode: value });
    persist({ privacyMode: value, nameLocale: get().nameLocale });
  },
  togglePrivacyMode() {
    const next = !get().privacyMode;
    set({ privacyMode: next });
    persist({ privacyMode: next, nameLocale: get().nameLocale });
  },
  setNameLocale(value) {
    set({ nameLocale: value });
    persist({ privacyMode: get().privacyMode, nameLocale: value });
  },
}));

// Apply initial state immediately so formatters honor it before React mounts.
setPrivacyMaskOn(initial.privacyMode);

/**
 * Mount in the app shell. Keeps the module-level privacy flag inside
 * `domain/currency` synchronized with the zustand store, so formatters
 * react when privacy is toggled.
 */
export function usePrivacySync() {
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  useEffect(() => {
    setPrivacyMaskOn(privacyMode);
  }, [privacyMode]);
}

/**
 * Convenience selector hook returning the user-resolved name locale.
 * "auto" maps to the browser's language code (zh-* or en-* or fallback).
 */
export function useResolvedNameLocale(): "zh-Hant" | "en" | "auto" {
  return useUiPreferences((state) => state.nameLocale);
}
