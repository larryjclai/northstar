import { useEffect } from "react";
import { create } from "zustand";
import { setPrivacyMaskOn } from "../domain/currency";
import type { NameLocalePreference } from "../domain/assetName";
import { isValidTimezone, resolveSystemTimezone } from "../domain/datetime";

export type { NameLocalePreference };
export type ThemeMode = "system" | "dark" | "light";
/** Gain/loss colour semantics: US green-up (default), TW red-up, neutral teal/amber. */
export type GainLossPalette = "us" | "tw" | "neutral";
/** Row-height / card-padding density. "default" maps to no data-density attribute. */
export type DensityMode = "loose" | "default" | "medium" | "tight";
/** Corner-radius scale. "default" maps to no data-radius attribute. */
export type RadiusMode = "sharp" | "default" | "round";

/** Default investment benchmark when the user hasn't picked one. */
export const DEFAULT_BENCHMARK_TICKER = "0050.TW";

export interface UiPreferences {
  privacyMode: boolean;
  nameLocale: NameLocalePreference;
  clockMode: ClockMode;
  timezone: string;
  theme: ThemeMode;
  /** Opt-in: fetch brand logos for tickers from a third-party CDN. Off by default. */
  assetLogosEnabled: boolean;
  /** Which optional columns the holdings table shows (B21). */
  holdingsColumns: HoldingsColumnKey[];
  /** Dashboard card keys the user has hidden via 編輯版面. */
  dashboardHiddenCards: string[];
  /** Ticker used as the benchmark in investment analytics (e.g. 0050.TW). */
  benchmarkTicker: string;
  gainLossPalette: GainLossPalette;
  density: DensityMode;
  radius: RadiusMode;
  /** Show buy/sell markers on the holding price chart. On by default. */
  showTradeMarkers: boolean;
  /** True once the user has dismissed or completed onboarding; hides the sidebar link. */
  onboardingDismissed: boolean;
  /** Desktop sidebar collapsed to icon-only mode. */
  sidebarCollapsed: boolean;
  /** Key of the metric to feature as the Dashboard hero. Default "netWorth". */
  northstarMetric: string;
  setPrivacyMode: (value: boolean) => void;
  togglePrivacyMode: () => void;
  setNameLocale: (value: NameLocalePreference) => void;
  setClockMode: (value: ClockMode) => void;
  setTimezone: (value: string) => void;
  setTheme: (value: ThemeMode) => void;
  setAssetLogosEnabled: (value: boolean) => void;
  setHoldingsColumns: (value: HoldingsColumnKey[]) => void;
  setBenchmarkTicker: (value: string) => void;
  setGainLossPalette: (value: GainLossPalette) => void;
  setDensity: (value: DensityMode) => void;
  setRadius: (value: RadiusMode) => void;
  setShowTradeMarkers: (value: boolean) => void;
  setDashboardHiddenCards: (value: string[]) => void;
  setOnboardingDismissed: (value: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setNorthstarMetric: (value: string) => void;
}

/** Toggleable holdings-table columns (the rest are always shown). */
export type HoldingsColumnKey =
  | "account"
  | "averageCost"
  | "marketPrice"
  | "assetType"
  | "costBasis";

export const HOLDINGS_COLUMN_DEFAULTS: HoldingsColumnKey[] = ["account", "averageCost", "marketPrice"];
const HOLDINGS_COLUMN_ALL: HoldingsColumnKey[] = ["account", "averageCost", "marketPrice", "assetType", "costBasis"];

const STORAGE_KEY = "northstar.uiPreferences.v1";

interface PersistedShape {
  privacyMode: boolean;
  nameLocale: NameLocalePreference;
  clockMode: ClockMode;
  timezone: string;
  theme: ThemeMode;
  assetLogosEnabled: boolean;
  holdingsColumns: HoldingsColumnKey[];
  benchmarkTicker: string;
  gainLossPalette: GainLossPalette;
  density: DensityMode;
  radius: RadiusMode;
  showTradeMarkers: boolean;
  dashboardHiddenCards: string[];
  onboardingDismissed: boolean;
  sidebarCollapsed: boolean;
  northstarMetric: string;
}

export type ClockMode = "24h" | "12h";

const ONBOARDING_LEGACY_KEY = "northstar.onboarding.dismissed.v1";

function loadPersisted(): PersistedShape {
  const fallback: PersistedShape = {
    privacyMode: false,
    nameLocale: "auto",
    clockMode: "24h",
    timezone: resolveSystemTimezone(),
    theme: "system",
    assetLogosEnabled: false,
    holdingsColumns: HOLDINGS_COLUMN_DEFAULTS,
    benchmarkTicker: DEFAULT_BENCHMARK_TICKER,
    gainLossPalette: "us",
    density: "default",
    radius: "default",
    showTradeMarkers: true,
    dashboardHiddenCards: [],
    onboardingDismissed: false,
    sidebarCollapsed: false,
    northstarMetric: "netWorth",
  };
  if (typeof window === "undefined") return fallback;
  // Back-compat: honour the legacy onboarding dismiss key for existing installs.
  const legacyDismissed = window.localStorage.getItem(ONBOARDING_LEGACY_KEY) === "1";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...fallback, onboardingDismissed: legacyDismissed };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    const tz = typeof parsed.timezone === "string" && isValidTimezone(parsed.timezone)
      ? parsed.timezone
      : fallback.timezone;
    const theme: ThemeMode =
      parsed.theme === "dark" || parsed.theme === "light" ? parsed.theme : "system";
    return {
      privacyMode: typeof parsed.privacyMode === "boolean" ? parsed.privacyMode : false,
      nameLocale:
        parsed.nameLocale === "zh-Hant" || parsed.nameLocale === "en"
          ? parsed.nameLocale
          : "auto",
      clockMode: parsed.clockMode === "12h" ? "12h" : "24h",
      timezone: tz,
      theme,
      assetLogosEnabled: typeof parsed.assetLogosEnabled === "boolean" ? parsed.assetLogosEnabled : false,
      holdingsColumns: Array.isArray(parsed.holdingsColumns)
        ? parsed.holdingsColumns.filter((k): k is HoldingsColumnKey => HOLDINGS_COLUMN_ALL.includes(k as HoldingsColumnKey))
        : HOLDINGS_COLUMN_DEFAULTS,
      benchmarkTicker:
        typeof parsed.benchmarkTicker === "string" && parsed.benchmarkTicker.trim()
          ? parsed.benchmarkTicker.trim()
          : fallback.benchmarkTicker,
      gainLossPalette:
        parsed.gainLossPalette === "tw" || parsed.gainLossPalette === "neutral"
          ? parsed.gainLossPalette
          : "us",
      density:
        parsed.density === "loose" || parsed.density === "medium" || parsed.density === "tight"
          ? parsed.density
          : "default",
      radius: parsed.radius === "sharp" || parsed.radius === "round" ? parsed.radius : "default",
      showTradeMarkers: typeof parsed.showTradeMarkers === "boolean" ? parsed.showTradeMarkers : true,
      dashboardHiddenCards: Array.isArray(parsed.dashboardHiddenCards)
        ? parsed.dashboardHiddenCards.filter((k): k is string => typeof k === "string")
        : [],
      onboardingDismissed:
        typeof parsed.onboardingDismissed === "boolean" ? parsed.onboardingDismissed : legacyDismissed,
      sidebarCollapsed: typeof parsed.sidebarCollapsed === "boolean" ? parsed.sidebarCollapsed : false,
      northstarMetric:
        typeof parsed.northstarMetric === "string" && parsed.northstarMetric.trim()
          ? parsed.northstarMetric.trim()
          : "netWorth",
    };
  } catch {
    return { ...fallback, onboardingDismissed: legacyDismissed };
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

// Apply initial appearance attributes immediately before React mounts to
// avoid a flash of the default theme/palette/density.
applyThemeAttribute(initial.theme);
applyRootAttribute("data-gainloss", initial.gainLossPalette, "us");
applyRootAttribute("data-density", initial.density, "default");
applyRootAttribute("data-radius", initial.radius, "default");

function applyThemeAttribute(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme === "system") {
    el.removeAttribute("data-theme");
  } else {
    el.setAttribute("data-theme", theme);
  }
}

/** Set a root data attribute, removing it entirely when at the default value. */
function applyRootAttribute(name: string, value: string, defaultValue: string) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (value === defaultValue) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value);
  }
}

function snapshot(state: UiPreferences): PersistedShape {
  return {
    privacyMode: state.privacyMode,
    nameLocale: state.nameLocale,
    clockMode: state.clockMode,
    timezone: state.timezone,
    theme: state.theme,
    assetLogosEnabled: state.assetLogosEnabled,
    holdingsColumns: state.holdingsColumns,
    benchmarkTicker: state.benchmarkTicker,
    gainLossPalette: state.gainLossPalette,
    density: state.density,
    radius: state.radius,
    showTradeMarkers: state.showTradeMarkers,
    dashboardHiddenCards: state.dashboardHiddenCards,
    onboardingDismissed: state.onboardingDismissed,
    sidebarCollapsed: state.sidebarCollapsed,
    northstarMetric: state.northstarMetric,
  };
}

export const useUiPreferences = create<UiPreferences>((set, get) => ({
  privacyMode: initial.privacyMode,
  nameLocale: initial.nameLocale,
  clockMode: initial.clockMode,
  timezone: initial.timezone,
  theme: initial.theme,
  assetLogosEnabled: initial.assetLogosEnabled,
  holdingsColumns: initial.holdingsColumns,
  benchmarkTicker: initial.benchmarkTicker,
  gainLossPalette: initial.gainLossPalette,
  density: initial.density,
  radius: initial.radius,
  showTradeMarkers: initial.showTradeMarkers,
  dashboardHiddenCards: initial.dashboardHiddenCards,
  onboardingDismissed: initial.onboardingDismissed,
  sidebarCollapsed: initial.sidebarCollapsed,
  northstarMetric: initial.northstarMetric,
  setPrivacyMode(value) {
    setPrivacyMaskOn(value);
    set({ privacyMode: value });
    persist(snapshot(get()));
  },
  togglePrivacyMode() {
    const next = !get().privacyMode;
    setPrivacyMaskOn(next);
    set({ privacyMode: next });
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
  setTimezone(value) {
    // Defensive: if a free-text entry isn't a real IANA zone, keep the
    // current pref instead of writing garbage.
    if (!isValidTimezone(value)) return;
    set({ timezone: value });
    persist(snapshot(get()));
  },
  setTheme(value) {
    applyThemeAttribute(value);
    set({ theme: value });
    persist(snapshot(get()));
  },
  setAssetLogosEnabled(value) {
    set({ assetLogosEnabled: value });
    persist(snapshot(get()));
  },
  setHoldingsColumns(value) {
    set({ holdingsColumns: value });
    persist(snapshot(get()));
  },
  setBenchmarkTicker(value) {
    const next = value.trim() || DEFAULT_BENCHMARK_TICKER;
    set({ benchmarkTicker: next });
    persist(snapshot(get()));
  },
  setGainLossPalette(value) {
    applyRootAttribute("data-gainloss", value, "us");
    set({ gainLossPalette: value });
    persist(snapshot(get()));
  },
  setDensity(value) {
    applyRootAttribute("data-density", value, "default");
    set({ density: value });
    persist(snapshot(get()));
  },
  setRadius(value) {
    applyRootAttribute("data-radius", value, "default");
    set({ radius: value });
    persist(snapshot(get()));
  },
  setShowTradeMarkers(value) {
    set({ showTradeMarkers: value });
    persist(snapshot(get()));
  },
  setDashboardHiddenCards(value) {
    set({ dashboardHiddenCards: value });
    persist(snapshot(get()));
  },
  setOnboardingDismissed(value) {
    set({ onboardingDismissed: value });
    persist(snapshot(get()));
  },
  toggleSidebarCollapsed() {
    set({ sidebarCollapsed: !get().sidebarCollapsed });
    persist(snapshot(get()));
  },
  setNorthstarMetric(value) {
    const next = value.trim() || "netWorth";
    set({ northstarMetric: next });
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
