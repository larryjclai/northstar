const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/DashboardRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Import DatePicker
content = content.replace(
  'import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";',
  'import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";\nimport { DatePicker } from "../components/ui/date-picker";\nimport { useState } from "react";\n'
);

// Add state
const stateInjection = `  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedAccount, setSelectedAccount] = useState<string>("all");`;

content = content.replace(
  '  const refreshQuotes = useRefreshQuotes();',
  '  const refreshQuotes = useRefreshQuotes();\n' + stateInjection
);

// Update monthKeyNow usage
content = content.replace(
  'const monthKeyNow = new Date().toISOString().slice(0, 7);\n  const monthRows = ledgerRows.filter((row) => row.date.startsWith(monthKeyNow) && row.settlementStatus === "settled");',
  'const monthRows = ledgerRows.filter((row) => row.date.startsWith(monthKey) && row.settlementStatus === "settled" && (selectedAccount === "all" || row.accountId === selectedAccount));'
);

// Update trend filtering by account
content = content.replace(
  '() => buildNetWorthTrend(accountRows, ledgerRows, assetRows, quoteRows, appSettings, fxHistory),',
  '() => buildNetWorthTrend(\n      selectedAccount === "all" ? accountRows : accountRows.filter(a => a.id === selectedAccount),\n      selectedAccount === "all" ? ledgerRows : ledgerRows.filter(r => r.accountId === selectedAccount),\n      selectedAccount === "all" ? assetRows : assetRows.filter(a => a.accountId === selectedAccount),\n      quoteRows, appSettings, fxHistory\n    ),'
);

// Update net worth and assets filtering
// Since Dashboard calculates `availableCash`, `liabilities`, `marketValue` globally:
content = content.replace(
  'const availableCash = calculateAvailableCash(accountRows, toPrimary);',
  'const filteredAccounts = selectedAccount === "all" ? accountRows : accountRows.filter(a => a.id === selectedAccount);\n  const availableCash = calculateAvailableCash(filteredAccounts, toPrimary);'
);
content = content.replace(
  'const liabilities = calculateLiabilities(accountRows, toPrimary);',
  'const liabilities = calculateLiabilities(filteredAccounts, toPrimary);'
);

content = content.replace(
  'const marketValue = assetRows.reduce((sum, asset) => {',
  'const filteredAssets = selectedAccount === "all" ? assetRows : assetRows.filter(a => a.accountId === selectedAccount);\n  const marketValue = filteredAssets.reduce((sum, asset) => {'
);
// Make sure allocation uses filteredAssets
content = content.replace(
  'for (const asset of assetRows) {',
  'for (const asset of filteredAssets) {'
);
content = content.replace(
  '[assetRows, quoteRows, availableCash, toPrimary]',
  '[filteredAssets, quoteRows, availableCash, toPrimary]'
);

// Add the UI filters to the header
const filterUI = `        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select 
            className="ns-input" 
            style={{ width: 140, height: 36 }}
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
          >
            <option value="all">所有帳戶</option>
            {accountRows.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <DatePicker view="month" value={monthKey + "-01"} onChange={date => setMonthKey(date.slice(0, 7))} />
          <button className="ns-btn" onClick={() => refreshQuotes.mutate(assetRows.map((a) => a.ticker))} disabled={refreshQuotes.isPending || assetRows.length === 0}>
            <ArrowsClockwise size={14} />{refreshQuotes.isPending ? "更新中" : "更新"}
          </button>
          <Link to="/cash-flow" className="ns-btn primary"><Plus size={14} weight="bold" />新增</Link>
        </div>`;

content = content.replace(
  /<div style=\{\{ display: "flex", gap: 8 \}\}>\s*<button className="ns-btn".*?<\/button>\s*<Link to="\/cash-flow".*?<\/Link>\s*<\/div>/s,
  filterUI
);

// Update todayLabel to monthLabel in overview
content = content.replace(
  'const todayLabel = new Date().toLocaleDateString("zh-TW", { month: "long", day: "numeric" });',
  'const todayLabel = new Date().toLocaleDateString("zh-TW", { month: "long", day: "numeric" });\n  const monthLabel = monthKey.replace("-", " / ");'
);
content = content.replace(
  'Overview · {todayLabel}',
  'Overview · {monthLabel}'
);

fs.writeFileSync(file, content);
