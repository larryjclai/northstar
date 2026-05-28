import {
  Bank,
  Eye,
  EyeSlash,
  GearSix,
  House,
  Receipt,
  Target,
  TrendUp,
} from "@phosphor-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePrivacySync, useUiPreferences } from "../state/uiPreferences";
import { GlobalSearch } from "./GlobalSearch";
import { MagnifyingGlass } from "@phosphor-icons/react";

const appIconUrl = new URL("../../src-tauri/icons/icon.png", import.meta.url).href;

const navItems = [
  { to: "/", label: "總覽", icon: House },
  { to: "/cash-flow", label: "記帳", icon: Receipt },
  { to: "/accounts", label: "帳戶", icon: Bank },
  { to: "/investments", label: "投資", icon: TrendUp },
  { to: "/goals", label: "目標", icon: Target },
  { to: "/settings", label: "設定", icon: GearSix },
] as const;

export function AppShell() {
  useBlockBrowserBackOnBackspace();
  usePrivacySync();
  usePrivacyShortcut();
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  const togglePrivacy = useUiPreferences((state) => state.togglePrivacyMode);
  const [searchOpen, setSearchOpen] = useState(false);

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
              資料僅保存在此裝置上。
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main key={privacyMode ? "privacy-on" : "privacy-off"} className="pb-20 lg:pb-0">
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t lg:hidden"
        style={{ background: "var(--ns-bg-elev)", borderColor: "var(--ns-border)" }}
      >
        {navItems.map((item) => (
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
    </div>
  );
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
