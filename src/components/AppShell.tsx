import {
  Bank,
  ChartLineUp,
  GearSix,
  House,
  ListChecks,
  Receipt,
  TrendUp,
} from "@phosphor-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRepository } from "../data/hooks";

const navItems = [
  { to: "/", label: "總覽", icon: House },
  { to: "/holdings", label: "持倉", icon: TrendUp },
  { to: "/transactions", label: "交易", icon: ListChecks },
  { to: "/cash-flow", label: "收支", icon: Receipt },
  { to: "/accounts", label: "帳戶", icon: Bank },
  { to: "/settings", label: "設定", icon: GearSix },
] as const;

export function AppShell() {
  useBlockBrowserBackOnBackspace();
  const repository = useRepository();
  const repositoryErrorMessage = repository.error instanceof Error ? repository.error.message : repository.error ? String(repository.error) : null;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r p-4 lg:block" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
            <ChartLineUp size={22} weight="fill" />
          </div>
          <div>
            <div className="font-semibold">Northstar</div>
            <div className="text-xs" style={{ color: "var(--ns-muted)" }}>投資與現金流</div>
          </div>
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
      <main className="pb-20 lg:pb-0">
        {repositoryErrorMessage ? (
          <div
            role="alert"
            className="mx-auto mt-4 max-w-6xl rounded-md border px-4 py-3 text-sm"
            style={{ borderColor: "var(--ns-negative)", color: "var(--ns-negative)", background: "var(--ns-surface)" }}
          >
            <div className="font-semibold">資料庫初始化失敗</div>
            <div className="mt-1 break-all">{repositoryErrorMessage}</div>
            <div className="mt-2 text-xs" style={{ color: "var(--ns-muted)" }}>
              請把這段訊息回報；若資料庫已壞，可刪除 ~/Library/Application Support/app.northstar.finance/northstar.db 後重啟。
            </div>
          </div>
        ) : null}
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

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="max-w-3xl text-sm leading-6" style={{ color: "var(--ns-muted)" }}>{description}</p>
    </header>
  );
}
