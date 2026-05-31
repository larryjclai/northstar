import {
  Bank,
  Eye,
  EyeSlash,
  GearSix,
  House,
  Plus,
  Receipt,
  Target,
  TrendUp,
} from "@phosphor-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivacySync, useUiPreferences } from "../state/uiPreferences";
import { usePostDueRecurring } from "../data/hooks";
import { todayInTimezone } from "../domain";
import { GlobalSearch } from "./GlobalSearch";
import { QuickAdd } from "./QuickAdd";
import { useTranslation } from "react-i18next";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { getFinanceRepository } from "../data/repositories";
import { loadSyncAccount } from "../features/connect/sync/account";
import { loadVaultKey } from "../features/connect/crypto/vault";
import { runSync, isTauriRuntime } from "../features/connect/sync/sync-manager";
import { useSyncStatus } from "../state/syncStatus";

const appIconUrl = new URL("../../src-tauri/icons/icon.png", import.meta.url).href;





export function AppShell() {
  const { t } = useTranslation();

  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: House },
    { to: "/investments", label: t("nav.investments"), icon: TrendUp },
    { to: "/cash-flow", label: t("nav.cashflow"), icon: Receipt },
    { to: "/accounts", label: t("nav.accounts"), icon: Bank },
    { to: "/goals", label: t("nav.goals"), icon: Target },
  ];
  
  const nav2Items = [
    { to: "/settings", label: t("nav.settings"), icon: GearSix },
  ];
  useBlockBrowserBackOnBackspace();
  usePrivacySync();
  usePrivacyShortcut();
  useAutoSync();
  const timezone = useUiPreferences((state) => state.timezone);
  usePostDueRecurring(todayInTimezone(timezone));
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  const togglePrivacy = useUiPreferences((state) => state.togglePrivacyMode);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  useQuickAddShortcut(() => setQuickAddOpen((v) => !v));

  return (
    <div
      className="min-h-screen lg:grid"
      style={{ gridTemplateColumns: "240px 1fr", background: "var(--ns-bg)" }}
    >
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:self-start"
        style={{
          background: "var(--ns-bg-elev)",
          borderRight: "1px solid var(--ns-border)",
          padding: "22px 14px 14px",
          gap: 4,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "0 8px 16px", display: "flex", alignItems: "center", gap: 9 }}>
          <img src={appIconUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
          <span
            style={{
              fontFamily: "var(--ns-font-display)",
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: -0.01,
            }}
          >
            Northstar
          </span>
        </div>

        {/* Global Search Trigger */}
        <div style={{ padding: "0 8px 8px" }}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-secondary/30 hover:bg-secondary/50 rounded-md border border-border/50 transition-colors"
            style={{ color: "var(--ns-fg-muted)", fontSize: 13 }}
          >
            <MagnifyingGlass size={15} />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Quick Add trigger */}
        <div style={{ padding: "0 8px 8px" }}>
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="ns-btn primary"
            style={{ width: "100%", justifyContent: "center", gap: 8 }}
          >
            <Plus size={15} weight="bold" />
            <span className="flex-1 text-left">快速記帳</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded px-1.5 font-mono text-[10px] font-medium" style={{ background: "color-mix(in srgb, var(--ns-accent-fg) 18%, transparent)", color: "var(--ns-accent-fg)" }}>
              <span className="text-xs">⌘</span>N
            </kbd>
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="ns-nav-link"
              activeProps={{ className: "ns-nav-link active" }}
              inactiveProps={{ className: "ns-nav-link" }}
            >
              <item.icon size={16} weight="duotone" />
              {item.label}
            </Link>
          ))}

          <div className="ns-eyebrow" style={{ padding: '18px 11px 8px' }}>Settings</div>
          {nav2Items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="ns-nav-link"
              activeProps={{ className: "ns-nav-link active" }}
              inactiveProps={{ className: "ns-nav-link" }}
            >
              <item.icon size={16} weight="duotone" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Bottom: privacy + local-first notice */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={togglePrivacy}
            title={privacyMode ? "顯示金額 (⌘⇧H)" : "隱藏金額 (⌘⇧H)"}
            aria-label={privacyMode ? "顯示金額" : "隱藏金額"}
            aria-pressed={privacyMode}
            className="ns-nav-link"
            style={{
              background: privacyMode ? "var(--ns-accent-soft)" : undefined,
              color: privacyMode ? "var(--ns-accent)" : undefined,
            }}
          >
            {privacyMode ? <EyeSlash size={16} weight="fill" /> : <Eye size={16} weight="duotone" />}
            {privacyMode ? "顯示金額" : "隱藏金額"}
          </button>

          <div
            className="ns-surface"
            style={{ padding: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ns-fg-muted)" }}>
                <rect x="5" y="9" width="10" height="8" rx="1.5"/>
                <path d="M7 9V6a3 3 0 016 0v3"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Local-first</span>
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.45, color: "var(--ns-fg-dim)" }}>
              {t("shell.dataSavedLocally")}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main key={privacyMode ? "privacy-on" : "privacy-off"} className="pb-20 lg:pb-0">
        <Outlet />
      </main>

      {/* ── Mobile Quick Add FAB ── */}
      <button
        type="button"
        onClick={() => setQuickAddOpen(true)}
        aria-label="快速記帳"
        className="fixed right-4 bottom-20 lg:hidden"
        style={{ zIndex: 40, width: 52, height: 52, borderRadius: 999, background: "var(--ns-accent)", color: "var(--ns-accent-fg)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--ns-shadow-xl)" }}
      >
        <Plus size={24} weight="bold" />
      </button>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t lg:hidden"
        style={{ background: "var(--ns-bg-elev)", borderColor: "var(--ns-border)" }}
      >
        {[...navItems, ...nav2Items].map((item) => (
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
      </nav>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
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

function usePrivacyShortcut() {
  const toggle = useUiPreferences((state) => state.togglePrivacyMode);
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

// ── Auto-sync on Tauri window focus ────────────────────────────────────────
// Triggers a push+pull cycle whenever the app regains OS focus,
// with a 60-second cooldown to avoid hammering the server.

const MIN_SYNC_INTERVAL_MS = 60_000;

function useAutoSync() {
  const { setPhase, setSyncDone, setError } = useSyncStatus();
  const lastSyncRef = useRef<number>(0);

  const triggerSync = useCallback(async () => {
    // Skip if sync not configured
    const account = loadSyncAccount();
    if (!account) return;
    const vaultKey = await loadVaultKey();
    if (!vaultKey) return;

    // Debounce: don't sync more than once per minute
    if (Date.now() - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;
    lastSyncRef.current = Date.now();

    try {
      setPhase("pushing");
      const repo = await getFinanceRepository();
      setPhase("pulling");
      const result = await runSync(repo);
      setSyncDone(result.pushed, result.pulled, result.applied);
    } catch (e) {
      setError(e instanceof Error ? e.message : "同步失敗");
    }
  }, [setPhase, setSyncDone, setError]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenFn: (() => void) | null = null;

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
          style={{
            fontFamily: "var(--ns-font-display)",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: -0.02,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--ns-fg-muted)" }}>
          {description}
        </p>
        {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
