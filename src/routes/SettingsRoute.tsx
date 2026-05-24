import { Key, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { Card } from "../components/Card";
import { PageHeader } from "../components/AppShell";
import { connectProductRules } from "../features/connect";

export function SettingsRoute() {
  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="設定" description="Connect/E2EE 先以產品規則與模組邊界落地；真正同步引擎會在 local DB 穩定後接上。" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recovery Kit">
          <Key size={28} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>任何雲端功能啟用前都必須建立並確認 Recovery Kit。</p>
        </Card>
        <Card title="Trusted devices">
          <ShieldCheck size={28} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>新裝置需要既有裝置批准，或使用 Recovery Kit 解開 vault。</p>
        </Card>
        <Card title="Household">
          <UsersThree size={28} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>家庭共享使用 Household Space Key，不會分享整個私人 vault。</p>
        </Card>
      </div>
      <Card title="Connect product rules">
        <ul className="space-y-2 text-sm" style={{ color: "var(--ns-muted)" }}>
          {connectProductRules.map((rule) => (
            <li key={rule}>• {rule}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

