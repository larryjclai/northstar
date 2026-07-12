import {
  Bank,
  CaretLeft,
  CaretRight,
  Compass,
  DotsThreeOutline,
  Eye,
  EyeSlash,
  FileText,
  GearSix,
  House,
  Plus,
  Receipt,
  Target,
  TrendUp,
  X,
} from "@phosphor-icons/react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Button } from "./coss/button";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivacySync, useUiPreferences } from "../state/uiPreferences";
import { useQuickAdd } from "../state/quickAdd";
import { useDemoMode } from "../state/demoMode";
import { exitDemoMode } from "../data/demoData";
import { usePostDueRecurring, useFinanceData } from "../data/hooks";
import { todayInTimezone } from "../domain";
import { buildCreditCardReminders } from "../domain/dashboardSummary";
import { buildReminderNotifications, unacknowledgedReminders } from "../domain/reminderNotifications";
import { GlobalSearch } from "./GlobalSearch";
import { ModalShell } from "./ModalShell";
import { QuickAdd } from "./QuickAdd";
import { useToast } from "./Toast";
import { OnboardingOverlay, openOnboarding } from "./OnboardingOverlay";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { getFinanceRepository } from "../data/repositories";
import { loadSyncAccount } from "../features/connect/sync/account";
import { loadVaultKey } from "../features/connect/crypto/vault";
import { isRecoveryKitConfirmed } from "../features/connect/crypto/recovery-kit";
import { runSync, isSyncRunning, isTauriRuntime } from "../features/connect/sync/sync-manager";
import { useSyncStatus } from "../state/syncStatus";
import { queryKeys } from "../data/hooks";
import { refreshLatestMarketData } from "../features/market-data/useMarketRefresh";
import { runDailyBackupIfDue } from "../features/local-backup/localBackup";
import { isCrossDeviceLinkUpdateError, UPDATE_RESTART_RETRY_MESSAGE } from "../features/updater/errors";
import { buildPaymentReminders, syncScheduledReminders } from "../features/notifications/scheduler";
import { haptic } from "../lib/haptics";

const appIconUrl = new URL("../../src-tauri/icons/icon.png", import.meta.url).href;

/**
 * Mark the document for native vibrancy — macOS Tauri only. tauri.conf's
 * windowEffects(sidebar) puts an NSVisualEffectView behind the (transparent)
 * webview; this attribute lets globals.css open the shell up so the system
 * material shows through the sidebar. Touch devices (Tauri iOS) and plain
 * browsers keep the CSS-only glass, so nothing changes for them.
 */
function applyNativeGlassAttribute() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const isTauri = "__TAURI_INTERNALS__" in window;
  const isMacDesktop = navigator.platform.toUpperCase().includes("MAC") && navigator.maxTouchPoints === 0;
  if (isTauri && isMacDesktop) document.documentElement.setAttribute("data-native-glass", "");
}





export function AppShell() {
  const { t } = useTranslation();
  useEffect(applyNativeGlassAttribute, []);

  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: House },
    { to: "/investments", label: t("nav.investments"), icon: TrendUp },
    { to: "/cash-flow", label: t("nav.cashflow"), icon: Receipt },
    { to: "/accounts", label: t("nav.accounts"), icon: Bank },
    { to: "/goals", label: t("nav.goals"), icon: Target },
  ];
  
  const nav2Items = [
    { to: "/reports/annual", label: "年度報表", icon: FileText },
    { to: "/settings", label: t("nav.settings"), icon: GearSix },
  ];
  useBlockBrowserBackOnBackspace();
  usePrivacySync();
  useMenuSettingsShortcut();
  useAutoSync();
  useAutoMarketRefresh();
  useAutoUpdateCheck();
  useDailyLocalBackup();
  useDockBadge();
  useReminderNotifications();
  const timezone = useUiPreferences((state) => state.timezone);
  usePostDueRecurring(todayInTimezone(timezone));
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  const togglePrivacy = useUiPreferences((state) => state.togglePrivacyMode);
  // Toggling privacy remounts <main> (formatters read a module-global synced
  // by usePrivacySync — see uiPreferences.ts). Preserve scroll position across
  // that remount, and blur the content in on every toggle AFTER the first one
  // (never on initial app launch).
  const privacyScrollRef = useRef(0);
  const hasToggledPrivacyRef = useRef(false);
  const handleTogglePrivacy = useCallback(() => {
    privacyScrollRef.current = window.scrollY;
    hasToggledPrivacyRef.current = true;
    void haptic("selection");
    togglePrivacy();
  }, [togglePrivacy]);
  usePrivacyShortcut(handleTogglePrivacy);
  useLayoutEffect(() => {
    window.scrollTo(0, privacyScrollRef.current);
  }, [privacyMode]);
  const [searchOpen, setSearchOpen] = useState(false);
  const quickAddOpen = useQuickAdd((state) => state.open);
  const setQuickAddOpen = useQuickAdd((state) => state.setOpen);
  const toggleQuickAdd = useQuickAdd((state) => state.toggle);
  const [moreOpen, setMoreOpen] = useState(false);
  const demoActive = useDemoMode((state) => state.active);
  const setDemoActive = useDemoMode((state) => state.set);
  const onboardingDismissed = useUiPreferences((state) => state.onboardingDismissed);
  const sidebarCollapsed = useUiPreferences((state) => state.sidebarCollapsed);
  const toggleSidebarCollapsed = useUiPreferences((state) => state.toggleSidebarCollapsed);
  const [demoExiting, setDemoExiting] = useState(false);
  const shellQueryClient = useQueryClient();

  async function handleExitDemo() {
    setDemoExiting(true);
    try {
      await exitDemoMode(await getFinanceRepository());
      setDemoActive(false);
      await shellQueryClient.invalidateQueries();
    } finally {
      setDemoExiting(false);
    }
  }

  // Mobile bottom nav shows the four highest-frequency destinations inline;
  // lower-frequency entries (目標 / 設定) live behind a "更多" sheet so the
  // bar stays readable on a 390px screen.
  const mobilePrimaryNav = navItems.slice(0, 4);
  const mobileMoreNav = [...navItems.slice(4), ...nav2Items];
  useQuickAddShortcut(() => toggleQuickAdd());

  const collapsed = sidebarCollapsed;

  return (
    <div
      className="ns-app-shell min-h-screen lg:grid"
      style={{ gridTemplateColumns: collapsed ? "64px 1fr" : "240px 1fr", transition: "grid-template-columns 0.2s ease" }}
    >
      {/* macOS overlay title bar: full-width draggable strip; hidden on non-macOS via CSS. */}
      <div data-tauri-drag-region className="ns-titlebar-drag" aria-hidden="true" />
      {/* ── Desktop sidebar ── */}
      <aside
        className="ns-sidebar hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:self-start"
        style={{
          padding: collapsed
            ? "calc(16px + var(--ns-titlebar-inset, 0px)) 8px 14px"
            : "calc(22px + var(--ns-titlebar-inset, 0px)) 14px 14px",
          gap: 4,
          overflow: "hidden",
          width: collapsed ? 64 : 240,
          minWidth: collapsed ? 64 : 240,
          // The sidebar is position:sticky → setting a z-index makes it form its
          // own stacking context that sits ABOVE every fixed overlay backdrop
          // (TransactionDetailPanel 998/999, CashFlow modals 1000, drawers,
          // QuickAdd). This keeps the macOS-vibrancy sidebar from being greyed
          // out by a full-viewport `inset:0` scrim (052 follow-up; plan 063).
          // Clicks that land on the sidebar simply won't dismiss the overlay,
          // which is acceptable — outside-click still works on the content area.
          zIndex: 1100,
          transition: "width 0.2s ease, min-width 0.2s ease, padding 0.2s ease",
        }}
      >
        {/* macOS: drag cap for the sidebar's top whitespace — .ns-titlebar-drag
           (z-index 30) sits below the aside (z-index 1100), so it can't be
           grabbed where the aside covers it. This patches that gap from inside
           the aside. display:none on every non-macOS platform. */}
        <div data-tauri-drag-region className="ns-sidebar-drag-cap" aria-hidden="true" />
        {/* Logo + collapse toggle — the drag-region attribute makes this strip
           draggable on macOS so the user can move the window by grabbing the
           sidebar header (the overlay title bar has no visible chrome). It does
           NOT propagate to child elements, so every non-interactive child
           (img/span/wrapper div) needs its own data-tauri-drag-region. The
           collapse buttons are deliberately excluded so they stay clickable. */}
        {collapsed ? (
          <div data-tauri-drag-region style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 0 16px" }}>
            <img data-tauri-drag-region src={appIconUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="展開側欄"
              className="ns-nav-link dim"
              style={{ justifyContent: "center", padding: "9px 8px" }}
            >
              <CaretRight size={14} />
            </button>
          </div>
        ) : (
          <div data-tauri-drag-region style={{ padding: "0 8px 16px", display: "flex", alignItems: "center", gap: 9, justifyContent: "space-between" }}>
            <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <img data-tauri-drag-region src={appIconUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0 }} />
              <span
                data-tauri-drag-region
                className="text-[15px]"
                style={{ fontFamily: "var(--ns-font-brand)", fontWeight: 600, letterSpacing: -0.01, whiteSpace: "nowrap" }}
              >
                Northstar
              </span>
            </div>
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title="收合側欄"
              className="ns-nav-link shrink-0 dim"
              style={{ padding: "5px 6px" }}
            >
              <CaretLeft size={14} />
            </button>
          </div>
        )}

        {/* Global Search Trigger */}
        <div style={{ padding: collapsed ? "0 0 8px" : "0 8px 8px" }}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="搜尋 (⌘K)"
              className="ns-nav-link w-full"
              style={{ justifyContent: "center", padding: "9px 8px" }}
            >
              <MagnifyingGlass size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-body text-muted-foreground bg-secondary/30 hover:bg-secondary/50 rounded-md border border-border/50 transition-colors muted"
            >
              <MagnifyingGlass size={15} />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          )}
        </div>

        {/* Quick Add trigger */}
        <div style={{ padding: collapsed ? "0 0 8px" : "0 8px 8px" }}>
          {collapsed ? (
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              title="快速記帳 (⌘N)"
              className="ns-nav-link w-full"
              style={{ justifyContent: "center", padding: "9px 8px", background: "var(--ns-accent)", color: "var(--ns-accent-fg)", borderRadius: "var(--ns-r-sm)" }}
            >
              <Plus size={16} weight="bold" />
            </button>
          ) : (
            <Button
              onClick={() => setQuickAddOpen(true)}
              className="w-full justify-center gap-2"
            >
              <Plus size={15} weight="bold" />
              <span className="flex-1 text-left">快速記帳</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded px-1.5 font-mono text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--ns-accent-fg) 18%, transparent)", color: "var(--ns-accent-fg)" }}>
                <span className="text-xs">⌘</span>N
              </kbd>
            </Button>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col flex-1" style={{ gap: 2 }}>
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className="ns-nav-link"
              activeProps={{ className: "ns-nav-link active" }}
              inactiveProps={{ className: "ns-nav-link" }}
              style={collapsed ? { justifyContent: "center", padding: "9px 8px" } : undefined}
            >
              <item.icon size={16} weight="duotone" />
              {!collapsed && item.label}
            </Link>
          ))}

          {!collapsed && <div className="text-xs muted font-medium" style={{ padding: '18px 11px 8px' }}>Settings</div>}
          {collapsed && <div style={{ height: 18 }} />}
          {nav2Items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className="ns-nav-link"
              activeProps={{ className: "ns-nav-link active" }}
              inactiveProps={{ className: "ns-nav-link" }}
              style={collapsed ? { justifyContent: "center", padding: "9px 8px" } : undefined}
            >
              <item.icon size={16} weight="duotone" />
              {!collapsed && item.label}
            </Link>
          ))}
        </nav>

        {/* Bottom: onboarding (conditional) + privacy + local-first */}
        <div className="flex flex-col gap-2">
          {!onboardingDismissed && (
            <button
              type="button"
              onClick={openOnboarding}
              title={collapsed ? "新手導覽" : undefined}
              className="ns-nav-link"
              style={collapsed ? { justifyContent: "center", padding: "9px 8px" } : undefined}
            >
              <Compass size={16} weight="duotone" />
              {!collapsed && "新手導覽"}
            </button>
          )}

          <button
            type="button"
            onClick={handleTogglePrivacy}
            title={privacyMode ? "顯示金額 (⌘⇧H)" : "隱藏金額 (⌘⇧H)"}
            aria-label={privacyMode ? "顯示金額" : "隱藏金額"}
            aria-pressed={privacyMode}
            className="ns-nav-link"
            style={{
              background: privacyMode ? "var(--ns-accent-soft)" : undefined,
              color: privacyMode ? "var(--ns-accent)" : undefined,
              ...(collapsed ? { justifyContent: "center", padding: "9px 8px" } : undefined),
            }}
          >
            {privacyMode ? <EyeSlash size={16} weight="fill" /> : <Eye size={16} weight="duotone" />}
            {!collapsed && (privacyMode ? "顯示金額" : "隱藏金額")}
          </button>

          {!collapsed && (
            <div className="ns-surface p-3">
              <div className="flex items-center mb-1" style={{ gap: 7 }}>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="muted">
                  <rect x="5" y="9" width="10" height="8" rx="1.5"/>
                  <path d="M7 9V6a3 3 0 016 0v3"/>
                </svg>
                <span className="text-xs font-medium">Local-first</span>
              </div>
              <div className="text-caption dim" style={{ lineHeight: 1.45 }}>
                {t("shell.dataSavedLocally")}
              </div>
            </div>
          )}
          {collapsed && (
            <div title={t("shell.dataSavedLocally")} className="flex dim" style={{ justifyContent: "center", padding: "6px 0" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="9" width="10" height="8" rx="1.5"/>
                <path d="M7 9V6a3 3 0 016 0v3"/>
              </svg>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      {/* pt safe-area clears the notch / Dynamic Island on iOS (0 on desktop, so
          it's a no-op there). Each route keeps its own top padding on top of it. */}
      <main
        key={privacyMode ? "privacy-on" : "privacy-off"}
        data-privacy-anim={hasToggledPrivacyRef.current ? "" : undefined}
        className="ns-app-main pb-20 lg:pb-0 min-w-0"
        // overflowX clip is a second line of defense (besides html/body): it
        // contains any route-level horizontal overflow here so a single wide
        // element can't push content off-screen or trip the iOS webview into
        // widening its layout viewport. Wide tables still scroll in their own
        // overflow-x:auto wrapper.
        style={{ paddingTop: "env(safe-area-inset-top)", overflowX: "clip" }}
      >
        {demoActive ? (
          <div
            className="flex items-center gap-3 text-body py-2 px-4 accent"
            style={{ background: "var(--ns-accent-soft)", borderBottom: "1px solid var(--ns-border)", position: "sticky", top: 0, zIndex: 30 }}
          >
            <span className="font-semibold">示範模式</span>
            <span className="flex-1 min-w-0 muted truncate">
              你的資料已安全保存，結束後會還原。
            </span>
            <Button variant="outline" className="shrink-0" style={{ height: 30 }} onClick={handleExitDemo} loading={demoExiting}>
              {demoExiting ? "還原中…" : "結束示範"}
            </Button>
          </div>
        ) : null}
        <Outlet />
      </main>

      {/* ── Mobile Quick Add FAB ── */}
      <button
        type="button"
        onClick={() => setQuickAddOpen(true)}
        aria-label="快速記帳"
        // `flex` lives in className (not inline style) so the responsive
        // `lg:hidden` can actually win on desktop — an inline `display:flex`
        // would override it and leak the FAB onto the desktop layout.
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex items-center justify-center lg:hidden"
        style={{ zIndex: 40, width: 52, height: 52, borderRadius: 999, background: "var(--ns-accent)", color: "var(--ns-accent-fg)", border: "none", boxShadow: "var(--ns-shadow-xl)" }}
      >
        <Plus size={24} weight="bold" />
      </button>

      {/* ── Mobile "更多" overflow sheet ── */}
      {moreOpen ? (
        <ModalShell
          variant="sheet"
          mobilePresentation="bottom-sheet"
          title="更多"
          onClose={() => setMoreOpen(false)}
          className="lg:hidden"
          style={{ zIndex: 50 }}
        >
          {(dismiss) => (
            <>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-xs muted font-medium">更多</span>
                <button type="button" aria-label="關閉" onClick={dismiss} className="muted" style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={18} />
                </button>
              </div>
              <nav className="flex flex-col p-2">
                {mobileMoreNav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm outline-none"
                    activeProps={{ style: { color: "var(--ns-accent)", background: "var(--ns-accent-soft)" } }}
                    inactiveProps={{ style: { color: "var(--ns-fg)" } }}
                  >
                    <item.icon size={20} weight="duotone" />
                    {item.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </ModalShell>
      ) : null}

      {/* ── Mobile bottom nav ── */}
      <nav
        className="ns-mobile-dock fixed inset-x-0 bottom-0 grid grid-cols-5 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {mobilePrimaryNav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] outline-none"
            activeProps={{ style: { color: "var(--ns-accent)" } }}
            inactiveProps={{ style: { color: "var(--ns-fg-muted)" } }}
          >
            <item.icon size={20} weight="duotone" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-1 px-1 py-2 !text-caption outline-none"
          style={{ lineHeight: 1.4, background: "none", border: "none", cursor: "pointer", color: moreOpen ? "var(--ns-accent)" : "var(--ns-fg-muted)" }}
          aria-label="更多"
          aria-expanded={moreOpen}
        >
          <DotsThreeOutline size={20} weight="duotone" />
          更多
        </button>
      </nav>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <OnboardingOverlay />
    </div>
  );
}

const MIN_MARKET_REFRESH_INTERVAL_MS = 15 * 60_000;

function useAutoMarketRefresh() {
  const queryClient = useQueryClient();
  // Demo data ships synthetic quotes for real tickers — live quotes would
  // corrupt the showcase (e.g. post-split 0050.TW vs the demo's pre-split
  // cost basis), so all auto-refresh is suspended while demo mode is on.
  const demoActive = useDemoMode((state) => state.active);
  const lastRefreshRef = useRef(0);
  const triggerRefresh = useCallback(async () => {
    if (useDemoMode.getState().active) return;
    if (Date.now() - lastRefreshRef.current < MIN_MARKET_REFRESH_INTERVAL_MS) return;
    lastRefreshRef.current = Date.now();
    try {
      await refreshLatestMarketData();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets }),
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dailyFxRates }),
      ]);
    } catch (error) {
      console.warn("[market] automatic refresh failed", error);
    }
  }, [queryClient]);

  useEffect(() => {
    if (demoActive) return;
    // Re-running on demo exit fires an immediate refresh (throttle reset so it
    // isn't swallowed), so real quotes come back right away.
    lastRefreshRef.current = 0;
    void triggerRefresh();
    window.addEventListener("focus", triggerRefresh);
    return () => window.removeEventListener("focus", triggerRefresh);
  }, [triggerRefresh, demoActive]);
}

// ── Proactive "new version available" prompt ───────────────────────────────
// On desktop launch (and on window focus, throttled) the app quietly asks the
// updater whether a newer signed release exists. If so it raises a sticky toast
// with a one-tap "立即更新" action — the user never has to dig into 設定 to find
// out an update is waiting. The manual UpdateChecker in ConnectSection stays as
// the explicit "force a check now" path.

const MIN_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60_000; // at most once per 6h

function useAutoUpdateCheck() {
  const toast = useToast();
  // One in-flight prompt at a time, and don't re-raise the same version after
  // the user dismisses it within a session.
  const checkedRef = useRef(false);
  const promptedVersionRef = useRef<string | null>(null);
  const lastCheckRef = useRef(0);

  const runInstall = useCallback(async (version: string, download: () => Promise<void>) => {
    const progressId = toast.info(`正在下載 v${version}…`, { durationMs: 0, description: "下載完成後將自動重新啟動。" });
    try {
      await download();
      toast.dismiss(progressId);
      const { relaunch } = await import("@tauri-apps/plugin-process");
      toast.success("更新完成，正在重新啟動…", { durationMs: 0 });
      await relaunch();
    } catch (error) {
      toast.dismiss(progressId);
      const detail = error instanceof Error ? error.message : String(error);
      toast.error("更新失敗", {
        description: isCrossDeviceLinkUpdateError(detail)
          ? UPDATE_RESTART_RETRY_MESSAGE
          : "請稍後再試，或到「設定 → 應用程式更新」手動更新。",
        detail,
      });
    }
  }, [toast]);

  const checkForUpdate = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    if (Date.now() - lastCheckRef.current < MIN_UPDATE_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = Date.now();
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) return;
      // Avoid nagging: only one toast per version per session.
      if (promptedVersionRef.current === update.version) return;
      promptedVersionRef.current = update.version;
      const notes = update.body?.trim();
      toast.info(`有新版本可下載 · v${update.version}`, {
        durationMs: 0,
        description: "更新後即可使用最新功能。",
        details: notes || undefined,
        action: { label: "立即更新", onClick: () => void runInstall(update.version, () => update.downloadAndInstall()) },
      });
    } catch {
      // Offline / no release yet / dev build — stay silent; the manual checker
      // surfaces errors when the user explicitly asks.
    }
  }, [toast, runInstall]);

  useEffect(() => {
    if (!checkedRef.current) {
      checkedRef.current = true; // guard StrictMode double-mount for the initial check only
      void checkForUpdate();
    }
    window.addEventListener("focus", checkForUpdate);
    return () => window.removeEventListener("focus", checkForUpdate);
  }, [checkForUpdate]);
}

// ── Daily local backup (roadmap 5.1) ───────────────────────────────────────
// On first launch each calendar day, quietly snapshot the whole database to a
// local backup (desktop → real JSON file in Finder; browser → IndexedDB). This
// gives pure-local users (sync off) an automatic safety net. Suspended during
// demo mode so the showcase data is never captured as the user's backup.

function useDailyLocalBackup() {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return; // guard StrictMode double-mount
    ranRef.current = true;
    void (async () => {
      if (useDemoMode.getState().active) return;
      try {
        const repo = await getFinanceRepository();
        await runDailyBackupIfDue(repo);
      } catch (e) {
        console.warn("[backup] daily local backup failed", e);
      }
    })();
  }, []);
}

// ── Dock badge for due credit-card reminders (desktop only) ───────────────
// Mirrors the dashboard's reminder logic (buildCreditCardReminders, due within
// 45 days) and reflects the count on the macOS Dock badge via the Rust
// set_dock_badge command. Only fires under Tauri; null clears the badge at 0.

function useDockBadge() {
  const { accounts } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const acknowledged = useUiPreferences((state) => state.acknowledgedReminders);

  const dueCount = (() => {
    const rows = accounts.data ?? [];
    if (rows.length === 0) return 0;
    const all = buildReminderNotifications(rows, todayInTimezone(timezone));
    return unacknowledgedReminders(all, acknowledged).length;
  })();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_dock_badge", { count: dueCount > 0 ? dueCount : null });
      } catch (e) {
        console.warn("[dock] set badge failed", e);
      }
    })();
  }, [dueCount, acknowledged]);
}

// ── Local notifications for due payment reminders ────────────────────────
// When the user opts in (remindersEnabled), this hook schedules OS
// notifications for upcoming credit-card due dates. If the toggle is off it
// best-effort cancels any previously scheduled notifications. Mirrors
// useDockBadge's data flow — same accounts + timezone + buildCreditCardReminders.

function useReminderNotifications() {
  const { accounts } = useFinanceData();
  const timezone = useUiPreferences((state) => state.timezone);
  const remindersEnabled = useUiPreferences((state) => state.remindersEnabled);

  useEffect(() => {
    const now = new Date();
    if (!remindersEnabled) {
      // Best-effort clear: pass empty array so all pending are cancelled.
      void syncScheduledReminders([], now);
      return;
    }
    const rows = accounts.data ?? [];
    if (rows.length === 0) return;
    const ccReminders = buildCreditCardReminders(
      rows,
      todayInTimezone(timezone),
      (amount) => amount, // scheduling only — no currency conversion needed
    );
    const scheduled = buildPaymentReminders(ccReminders);
    void syncScheduledReminders(scheduled, now);
  }, [remindersEnabled, accounts.data, timezone]);
}

function useQuickAddShortcut(toggle: () => void) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);
}

function useBlockBrowserBackOnBackspace() {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const isEditableField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable;
      if (isEditableField) return;
      event.preventDefault();
    }
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);
}

function usePrivacyShortcut(toggle: () => void) {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const isToggle =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        (event.key === "H" || event.key === "h");
      if (!isToggle) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);
}

// ── Desktop menu → Settings navigation ───────────────────────────────────
// The Rust menu bar emits "menu://settings" when the user picks
// 設定… (⌘,). We listen here and navigate to /settings using the router.

function useMenuSettingsShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenFn: (() => void) | null = null;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("menu://settings", () => {
        void navigate({ to: "/settings" });
      }).then((unlisten) => {
        unlistenFn = unlisten;
      });
    });

    return () => { unlistenFn?.(); };
  }, [navigate]);
}

// ── Auto-sync on Tauri window focus ────────────────────────────────────────
// Triggers a push+pull cycle whenever the app regains OS focus,
// with a 60-second cooldown to avoid hammering the server.

const MIN_SYNC_INTERVAL_MS = 60_000;

function useAutoSync() {
  const { setPhase, setSyncDone, setError } = useSyncStatus();
  const autoSyncQueryClient = useQueryClient();
  const lastSyncRef = useRef<number>(0);

  const triggerSync = useCallback(async () => {
    // Skip if sync not configured
    const account = await loadSyncAccount();
    if (!account) return;
    const vaultKey = await loadVaultKey();
    if (!vaultKey) return;

    // Skip silently until the Recovery Kit is confirmed — the user is guided to
    // do this in Settings, and runSync would otherwise throw on every focus.
    if (!isRecoveryKitConfirmed()) return;

    // Skip if another sync is already running (e.g. manual sync from Settings)
    if (isSyncRunning()) return;

    // Debounce: don't sync more than once per minute
    if (Date.now() - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;
    lastSyncRef.current = Date.now();

    try {
      setPhase("pushing");
      const repo = await getFinanceRepository();
      setPhase("pulling");
      const result = await runSync(repo);
      setSyncDone(result.pushed, result.pulled, result.applied);
      // Refresh the UI if remote changes were merged into SQLite. Without this
      // the React Query cache keeps serving stale data until the next manual
      // refresh or route change.
      if (result.applied > 0) await autoSyncQueryClient.invalidateQueries();
    } catch (e) {
      // Silently skip "already running" — user already sees status from manual sync
      const msg = e instanceof Error ? e.message
        : typeof e === "string" ? e
        : (e as { message?: string })?.message ?? JSON.stringify(e) ?? "同步失敗";
      if (msg === "同步正在進行中，請稍候") return;
      console.error("[sync] auto-sync failed:", e);
      setError(msg);
    }
  }, [setPhase, setSyncDone, setError, autoSyncQueryClient]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenFn: (() => void) | null = null;
    void triggerSync();

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("tauri://focus", () => {
        void triggerSync();
      }).then((unlisten) => {
        unlistenFn = unlisten;
      });
    });

    return () => { unlistenFn?.(); };
  }, [triggerSync]);
}

export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h1
          className="text-[26px] font-semibold"
          style={{
            fontFamily: "var(--ns-font-display)",
            letterSpacing: -0.02,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 muted">
          {description}
        </p>
        {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
