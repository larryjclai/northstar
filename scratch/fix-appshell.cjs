const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/components/AppShell.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add import
if (!content.includes('useTranslation')) {
  content = content.replace(
    'import { GlobalSearch } from "./GlobalSearch";',
    'import { GlobalSearch } from "./GlobalSearch";\nimport { useTranslation } from "react-i18next";'
  );
}

// 2. Add useTranslation hook inside AppShell
if (!content.includes('const { t } = useTranslation();')) {
  content = content.replace(
    'export function AppShell() {',
    'export function AppShell() {\n  const { t } = useTranslation();'
  );
}

// 3. Update nav items to use translation keys. Since navItems is outside, we can change them to function or move inside.
// Better: move navItems inside AppShell, or map them inside AppShell.
// But they are defined outside. Let's just define them inside AppShell.
content = content.replace(
  /const navItems = \[[\s\S]*?\] as const;/m,
  ''
);
content = content.replace(
  /const nav2Items = \[[\s\S]*?\] as const;/m,
  ''
);

content = content.replace(
  'const { t } = useTranslation();',
  `const { t } = useTranslation();

  const navItems = [
    { to: "/", label: t("nav.dashboard"), icon: House },
    { to: "/investments", label: t("nav.investments"), icon: TrendUp },
    { to: "/cash-flow", label: t("nav.cashflow"), icon: Receipt },
    { to: "/accounts", label: t("nav.accounts"), icon: Bank },
    { to: "/goals", label: t("nav.goals"), icon: Target },
  ];
  
  const nav2Items = [
    { to: "/settings", label: t("nav.settings"), icon: GearSix },
  ];`
);

fs.writeFileSync(file, content);
