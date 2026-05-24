import { Receipt } from "@phosphor-icons/react";
import { Card } from "../components/Card";
import { PageHeader } from "../components/AppShell";
import { seedAccounts, seedLedgerTransactions } from "../data/seed";

export function CashFlowRoute() {
  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="收支" description="Ledger transactions 保留 split / transfer groupId，後續 editor 會共用 group classifier 與 transfer builder。" />
      <Card title="本月紀錄" action={<Receipt size={20} weight="duotone" />}>
        <div className="space-y-3">
          {seedLedgerTransactions.map((row) => {
            const account = seedAccounts.find((item) => item.id === row.accountId);
            return (
              <div key={row.id} className="grid grid-cols-[1fr_auto] gap-4 rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                <div>
                  <div className="font-semibold">{row.category}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{row.date} · {account?.name}</div>
                </div>
                <div className="tabular text-right" style={{ color: row.amount < 0 ? "var(--ns-negative)" : "var(--ns-positive)" }}>
                  {row.amount.toLocaleString("zh-TW")} {row.currency}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

