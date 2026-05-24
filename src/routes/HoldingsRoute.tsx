import { MagnifyingGlass, TrendUp } from "@phosphor-icons/react";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/AppShell";
import { seedAssets } from "../data/seed";

export function HoldingsRoute() {
  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="持倉" description="持倉列表先接 seeded repository；下一步會接 SQLite repositories 和 Yahoo provider refresh 狀態。" />
      <Card title="投資資產">
        <div className="divide-y" style={{ borderColor: "var(--ns-border)" }}>
          {seedAssets.map((asset) => (
            <div key={asset.id} className="grid grid-cols-[1fr_auto] gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                  <TrendUp size={20} weight="duotone" />
                </div>
                <div>
                  <div className="font-semibold">{asset.ticker}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.name}</div>
                </div>
              </div>
              <div className="tabular text-right">
                <div>{asset.totalQuantity.toLocaleString("zh-TW")} 股</div>
                <div className="text-sm" style={{ color: "var(--ns-muted)" }}>均價 {asset.averageCost}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-4">
        <EmptyState icon={MagnifyingGlass} title="Symbol search boundary ready" body="Yahoo symbol search provider 已建立；UI 搜尋與 picker 會在 DB 層接上後實作。" />
      </div>
    </div>
  );
}

