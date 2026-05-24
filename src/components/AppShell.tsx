import {
  ArrowsLeftRight,
  Bank,
  ChartLineUp,
  GearSix,
  House,
  ListChecks,
  LockKey,
  Receipt,
  TrendUp,
} from "@phosphor-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import { connectProductRules } from "../features/connect";

const navItems = [
  { to: "/", label: "總覽", icon: House },
  { to: "/holdings", label: "持倉", icon: TrendUp },
  { to: "/transactions", label: "交易", icon: ListChecks },
  { to: "/cash-flow", label: "收支", icon: Receipt },
  { to: "/accounts", label: "帳戶", icon: Bank },
  { to: "/settings", label: "設定", icon: GearSix },
] as const;

export function AppShell() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r p-4 lg:block" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
            <ChartLineUp size={22} weight="fill" />
          </div>
          <div>
            <div className="font-semibold">Northstar</div>
            <div className="text-xs" style={{ color: "var(--ns-muted)" }}>Local-first finance</div>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition"
              activeProps={{ style: { background: "var(--ns-accent-soft)", color: "var(--ns-accent)" } }}
              inactiveProps={{ style: { color: "var(--ns-muted)" } }}
            >
              <item.icon size={18} weight="duotone" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--ns-border)" }}>
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <LockKey size={18} weight="duotone" />
            Connect policy
          </div>
          <p style={{ color: "var(--ns-muted)" }}>{connectProductRules[1]}</p>
        </div>
      </aside>
      <main className="pb-20 lg:pb-0">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-6 border-t lg:hidden" style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}>
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} className="flex flex-col items-center gap-1 px-1 py-2 text-[11px]" activeProps={{ style: { color: "var(--ns-accent)" } }} inactiveProps={{ style: { color: "var(--ns-muted)" } }}>
            <item.icon size={20} weight="duotone" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ns-muted)" }}>
        <ArrowsLeftRight size={16} weight="duotone" />
        Tauri rebuild scaffold
      </div>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="max-w-3xl text-sm leading-6" style={{ color: "var(--ns-muted)" }}>{description}</p>
    </header>
  );
}

