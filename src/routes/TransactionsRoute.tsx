import { ListChecks } from "@phosphor-icons/react";
import { Card } from "../components/Card";
import { PageHeader } from "../components/AppShell";
import { seedAssets, seedInvestmentRecords } from "../data/seed";

export function TransactionsRoute() {
  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="投資交易" description="交易資料模型已帶 sync-ready 欄位；FIFO / portfolio calculator 測試會保護後續移植。" />
      <Card title="最近交易" action={<ListChecks size={20} weight="duotone" />}>
        <div className="space-y-3">
          {seedInvestmentRecords.map((record) => {
            const asset = seedAssets.find((item) => item.id === record.assetId);
            return (
              <div key={record.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">{asset?.ticker ?? record.assetId}</div>
                    <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{record.date} · {record.action}</div>
                  </div>
                  <div className="tabular text-right">
                    <div>{record.quantity} × {record.price}</div>
                    <div className="text-sm" style={{ color: "var(--ns-muted)" }}>fee {record.fee}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

