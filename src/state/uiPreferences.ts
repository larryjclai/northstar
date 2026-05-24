import { useEffect } from "react";
import { create } from "zustand";
import { setPrivacyMaskOn } from "../domain/currency";
import type { NameLocalePreference } from "../domain/assetName";

export type { NameLocalePreference };

export interface UiPreferences {
  privacyMode: boolean;
  nameLocale: NameLocalePreference;
  clockMode: ClockMode;
  setPrivacyMode: (value: boolean) => void;
  togglePrivacyMode: () => void;
  setNameLocale: (value: NameLocalePreference) => void;
  setClockMode: (value: ClockMode) => void;
}

const STORAGE_KEY = "northstar.uiPreferences.v1";

interface PersistedShape {
  privacyMode: boolean;
  nameLocale: NameLocalePreference;
  clockMode: ClockMode;
}

export type ClockMode = "24h" | "12h";

function loadPersisted(): PersistedShape {
  const fallback: PersistedShape = { privacyMode: false, nameLocale: "auto", clockMode: "24h" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      privacyMode: typeof parsed.privacyMode === "boolean" ? parsed.privacyMode : false,
      nameLocale:
        parsed.nameLocale === "zh-Hant" || parsed.nameLocale === "en"
          ? parsed.nameLocale
          : "auto",
      clockMode: parsed.clockMode === "12h" ? "12h" : "24h",
    };
  } catch {
    return fallback;
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

function snapshot(state: UiPreferences): PersistedShape {
  return { privacyMode: state.privacyMode, nameLocale: state.nameLocale, clockMode: state.clockMode };
}

export const useUiPreferences = create<UiPreferences>((set, get) => ({
  privacyMode: initial.privacyMode,
  nameLocale: initial.nameLocale,
  clockMode: initial.clockMode,
  setPrivacyMode(value) {
    set({ privacyMode: value });
    persist(snapshot(get()));
  },
  togglePrivacyMode() {
    set({ privacyMode: !get().privacyMode });
    persist(snapshot(get()));
  },
  setNameLocale(value) {
    set({ nameLocale: value });
    persist(snapshot(get()));
  },
  setClockMode(value) {
    set({ clockMode: value });
    persist(snapshot(get()));
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
