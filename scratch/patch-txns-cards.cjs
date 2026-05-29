const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/TransactionsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const summaryCardDef = `
function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="ns-card" style={{ padding: 18 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="num" style={{ fontSize: 22, fontWeight: 500 }}>{value}</div>
        {sublabel && <div className="num" style={{ fontSize: 13, color: 'var(--ns-muted)' }}>{sublabel}</div>}
      </div>
    </div>
  );
}
`;

content = content.replace(/function SummaryCard\(\{[\s\S]*?\}\) \{\n  return \([\s\S]*?  \);\n\}/, summaryCardDef.trim());

content = content.replace('<div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">', '<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>');

fs.writeFileSync(file, content);
