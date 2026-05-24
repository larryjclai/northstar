import { Bank } from "@phosphor-icons/react";
import { Card } from "../components/Card";
import { PageHeader } from "../components/AppShell";
import { seedAccounts } from "../data/seed";

export function AccountsRoute() {
  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="帳戶" description="帳戶模型從第一天就包含 household sharing flag，避免同步功能後補時再做資料遷移。" />
      <div className="grid gap-4 md:grid-cols-2">
        {seedAccounts.map((account) => (
          <Card key={account.id}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                  <Bank size={20} weight="duotone" />
                </div>
                <div>
                  <div className="font-semibold">{account.name}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{account.type} · {account.currency}</div>
                </div>
              </div>
              <div className="tabular text-right font-semibold">{account.balance.toLocaleString("zh-TW")}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

