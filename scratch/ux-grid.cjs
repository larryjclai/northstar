const fs = require('fs');
const path = require('path');

// Fix InvestmentsRoute.tsx
const invPath = path.join(__dirname, '../src/routes/InvestmentsRoute.tsx');
let invContent = fs.readFileSync(invPath, 'utf8');
invContent = invContent.replace(
  /style=\{\{ display: 'grid', gridTemplateColumns: 'repeat\(5, 1fr\)', gap: 14, marginBottom: 20 \}\}/g,
  'className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5"'
);
invContent = invContent.replace(
  /className="ns-card" style=\{\{ padding: 18 \}\}/g,
  'className="ns-card p-4 sm:p-5"'
);
invContent = invContent.replace(
  /padding: "32px 40px 100px"/g,
  'padding: "var(--ns-page-padding)"' // Let's use CSS variables or Tailwind for main layout
);
// wait, better to just replace hardcoded paddings with Tailwind
invContent = invContent.replace(
  /style=\{\{ padding: "32px 40px 100px" \}\}/g,
  'className="px-4 sm:px-8 py-6 pb-24"'
);
fs.writeFileSync(invPath, invContent);

// Fix TransactionsRoute.tsx
const txnPath = path.join(__dirname, '../src/routes/TransactionsRoute.tsx');
let txnContent = fs.readFileSync(txnPath, 'utf8');
txnContent = txnContent.replace(
  /style=\{\{ display: "grid", gridTemplateColumns: "repeat\(4, 1fr\)", gap: 14, marginBottom: 20 \}\}/g,
  'className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5"'
);
txnContent = txnContent.replace(
  /className="ns-card" style=\{\{ padding: 18 \}\}/g,
  'className="ns-card p-4 sm:p-5"'
);
fs.writeFileSync(txnPath, txnContent);

// Fix CashFlowRoute.tsx
const cfrPath = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let cfrContent = fs.readFileSync(cfrPath, 'utf8');
cfrContent = cfrContent.replace(
  /style=\{\{ padding: "32px 40px 100px" \}\}/g,
  'className="px-4 sm:px-8 py-6 pb-24"'
);
cfrContent = cfrContent.replace(
  /style=\{\{ display: "grid", gridTemplateColumns: "minmax\(0,1fr\) 320px", gap: 20, alignItems: "start" \}\}/g,
  'className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start"'
);
cfrContent = cfrContent.replace(
  /<BarChart\s+height=\{120\}/g,
  '<BarChart height={200}'
);
cfrContent = cfrContent.replace(
  /height: 120/g,
  'height: 200'
);
fs.writeFileSync(cfrPath, cfrContent);

// Fix GoalsRoute.tsx
const goalsPath = path.join(__dirname, '../src/routes/GoalsRoute.tsx');
let goalsContent = fs.readFileSync(goalsPath, 'utf8');
goalsContent = goalsContent.replace(
  /style=\{\{ padding: "32px 40px 100px" \}\}/g,
  'className="px-4 sm:px-8 py-6 pb-24"'
);
fs.writeFileSync(goalsPath, goalsContent);

