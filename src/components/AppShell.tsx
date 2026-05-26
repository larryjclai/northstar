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
import { useEffect } from "react";
import { usePrivacySync, useUiPreferences } from "../state/uiPreferences";

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

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:self-start" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
        <div className="mb-6 flex items-center gap-3">
          <img src={appIconUrl} alt="" className="size-10 rounded-lg" />
          <div className="flex-1">
            <div className="font-semibold">Northstar</div>
            <div className="text-xs" style={{ color: "var(--ns-muted)" }}>投資與現金流</div>
          </div>
          <button
            type="button"
            onClick={togglePrivacy}
            title={privacyMode ? "顯示金額 (⌘⇧H)" : "隱藏金額 (⌘⇧H)"}
            aria-label={privacyMode ? "顯示金額" : "隱藏金額"}
            aria-pressed={privacyMode}
            className="grid size-9 place-items-center rounded-md outline-none transition hover:opacity-80"
            style={{
              background: privacyMode ? "var(--ns-accent-soft)" : "transparent",
              color: privacyMode ? "var(--ns-accent)" : "var(--ns-muted)",
            }}
          >
            {privacyMode ? <EyeSlash size={18} weight="fill" /> : <Eye size={18} weight="duotone" />}
          </button>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition"
              activeProps={{ style: { background: "var(--ns-accent-soft)", color: "var(--ns-accent)" } }}
              inactiveProps={{ style: { color: "var(--ns-muted)" } }}
            >
              <item.icon size={18} weight="duotone" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main key={privacyMode ? "privacy-on" : "privacy-off"} className="pb-20 lg:pb-0">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t lg:hidden" style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}>
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] outline-none" activeProps={{ style: { color: "var(--ns-accent)" } }} inactiveProps={{ style: { color: "var(--ns-muted)" } }}>
            <item.icon size={20} weight="duotone" />
            {item.label}
          </Link>
        ))}
      </nav>
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
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--ns-muted)" }}>{description}</p>
        {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
