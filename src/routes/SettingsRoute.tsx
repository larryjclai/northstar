import { Key, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { Card } from "../components/Card";
import { PageHeader } from "../components/AppShell";

export function SettingsRoute() {
  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="設定" description="管理同步、裝置安全與家庭共享。核心資料會先留在你的裝置上。" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="救援金鑰">
          <Key size={28} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>開啟同步前會先建立救援金鑰，避免遺失裝置時無法恢復資料。</p>
        </Card>
        <Card title="信任裝置">
          <ShieldCheck size={28} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>新裝置需要既有裝置批准，或用救援金鑰完成恢復。</p>
        </Card>
        <Card title="家庭共享">
          <UsersThree size={28} weight="duotone" style={{ color: "var(--ns-accent)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--ns-muted)" }}>只分享你選擇的帳戶，私人紀錄仍保留在個人空間。</p>
        </Card>
      </div>
      <Card title="同步原則">
        <ul className="space-y-2 text-sm" style={{ color: "var(--ns-muted)" }}>
          <li>• 不開啟同步也可以完整使用本機帳本。</li>
          <li>• 開啟同步前會先完成救援金鑰。</li>
          <li>• 登入帳號只確認身分，不會讓伺服器讀取你的財務資料。</li>
          <li>• 家庭共享只分享你選擇的帳戶。</li>
        </ul>
      </Card>
    </div>
  );
}
