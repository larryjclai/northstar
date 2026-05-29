const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowEntryDrawer.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add state
const recurringState = `
  const [recurring, setRecurring] = useState("none");
`;
content = content.replace('  const [mode, setMode] = useState<CashType>(initialType);', recurringState + '  const [mode, setMode] = useState<CashType>(initialType);');

// 2. Add UI for Transfer (around line 231)
const recurringHtmlTransfer = `
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>週期交易</div>
                  <select value={recurring} onChange={e => setRecurring(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }}>
                    <option value="none">單次交易</option>
                    <option value="weekly">每週</option>
                    <option value="monthly">每月</option>
                    <option value="yearly">每年</option>
                  </select>
                </div>
`;
content = content.replace(
  '<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>\n                <div>\n                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>外加手續費 (選填)</div>',
  '<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>\n' + recurringHtmlTransfer + '\n                <div>\n                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>外加手續費 (選填)</div>'
);

// 3. Add UI for Income/Expense (around line 311)
const recurringHtmlLedger = `
              <div>
                <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>週期交易</div>
                <select value={recurring} onChange={e => setRecurring(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }}>
                  <option value="none">單次交易</option>
                  <option value="weekly">每週</option>
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                </select>
              </div>
`;
content = content.replace(
  '            <div>\n              <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>備註</div>',
  '            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>\n' + recurringHtmlLedger + '\n            <div>\n              <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>備註</div>\n              <input type="text" value={ledgerForm.note} onChange={e => setLedgerForm({ ...ledgerForm, note: e.target.value })} placeholder="選填" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />\n            </div>\n            </div>'
);
// Remove the original ledger note to avoid duplication
content = content.replace('              <input type="text" value={ledgerForm.note} onChange={e => setLedgerForm({ ...ledgerForm, note: e.target.value })} placeholder="選填" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />\n            </div>\n\n', '');

// 4. Modify submit function to append recurring to note
const submitFunction = `
  async function submit() {
    setMessage("");

    const rLabel = recurring === "weekly" ? "每週" : recurring === "monthly" ? "每月" : recurring === "yearly" ? "每年" : "";
    const recurringPrefix = rLabel ? \`[週期交易: \${rLabel}] \` : "";
`;
content = content.replace('  async function submit() {\n    setMessage("");', submitFunction);
content = content.replace(/note: transferForm.note.trim\(\)/g, 'note: (recurringPrefix + transferForm.note).trim()');
content = content.replace(/note: ledgerForm.note.trim\(\)/g, 'note: (recurringPrefix + ledgerForm.note).trim()');

fs.writeFileSync(file, content);
