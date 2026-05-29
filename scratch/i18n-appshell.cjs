const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/components/AppShell.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { Link, useRouterState } from "@tanstack/react-router";',
  'import { Link, useRouterState } from "@tanstack/react-router";\nimport { useTranslation } from "react-i18next";'
);

content = content.replace(
  'export function AppShell({ children }: { children: ReactNode }) {',
  'export function AppShell({ children }: { children: ReactNode }) {\n  const { t } = useTranslation();'
);

// Map the nav labels to t("nav.xxx")
content = content.replace(
  '{ id: "/", label: "總覽", icon: <House size={16} /> },',
  '{ id: "/", label: t("nav.dashboard"), icon: <House size={16} /> },'
);
content = content.replace(
  '{ id: "/investments", label: "投資", icon: <TrendUp size={16} /> },',
  '{ id: "/investments", label: t("nav.investments"), icon: <TrendUp size={16} /> },'
);
content = content.replace(
  '{ id: "/cash-flow", label: "記帳", icon: <Receipt size={16} /> },',
  '{ id: "/cash-flow", label: t("nav.cashflow"), icon: <Receipt size={16} /> },'
);
content = content.replace(
  '{ id: "/accounts", label: "帳戶", icon: <Bank size={16} /> },',
  '{ id: "/accounts", label: t("nav.accounts"), icon: <Bank size={16} /> },'
);
content = content.replace(
  '{ id: "/goals", label: "目標・FIRE", icon: <Target size={16} /> },',
  '{ id: "/goals", label: t("nav.goals"), icon: <Target size={16} /> },'
);
content = content.replace(
  '{ id: "/settings", label: "設定", icon: <Gear size={16} /> },',
  '{ id: "/settings", label: t("nav.settings"), icon: <Gear size={16} /> },'
);

// Update search placeholder
content = content.replace(
  '<span className="ns-nav-label" style={{ color: "var(--ns-fg-muted)" }}>Search...</span>',
  '<span className="ns-nav-label" style={{ color: "var(--ns-fg-muted)" }}>{t("shell.searchPlaceholder")}</span>'
);

// Update privacy/local text
content = content.replace(
  '<div style={{ fontSize: 13, fontWeight: 500 }}>隱藏金額</div>',
  '<div style={{ fontSize: 13, fontWeight: 500 }}>{t("shell.hideAmounts")}</div>'
);
content = content.replace(
  '<div style={{ fontSize: 13, fontWeight: 500 }}>Local-first</div>',
  '<div style={{ fontSize: 13, fontWeight: 500 }}>{t("shell.localFirst")}</div>'
);
content = content.replace(
  '資料僅保存在此裝置上。',
  '{t("shell.dataSavedLocally")}'
);

fs.writeFileSync(file, content);
