const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowEntryDrawer.tsx');
let content = fs.readFileSync(file, 'utf8');

const recurringState = `
  const [recurring, setRecurring] = useState("none");
`;

const recurringFormInit = `
    setRecurring("none");
`;

const formHtml = `
          {/* Recurring */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--ns-fg-muted)" }}>週期交易</label>
            <select
              className="ns-input"
              value={recurring}
              onChange={(e) => setRecurring(e.target.value)}
              style={{ appearance: "none" }}
            >
              <option value="none">單次交易 (不重複)</option>
              <option value="weekly">每週</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--ns-fg-muted)" }}>備註</label>
`;

content = content.replace('  const [note, setNote] = useState("");', '  const [note, setNote] = useState("");\n' + recurringState);
content = content.replace('setNote(item.note);', 'setNote(item.note);\n    setRecurring("none");');
content = content.replace('setNote("");', 'setNote("");\n    setRecurring("none");');
content = content.replace('          <div className="flex flex-col gap-1.5">\n            <label className="text-xs font-medium" style={{ color: "var(--ns-fg-muted)" }}>備註</label>', formHtml);

// Make sure onSubmit appends the recurring setting if it's not none
const submitFunction = `
  async function submit() {
    setMessage("");
    let finalNote = note;
    if (recurring !== "none") {
      const rLabel = recurring === "weekly" ? "每週" : recurring === "monthly" ? "每月" : "每年";
      finalNote = \`[週期交易: \${rLabel}] \${finalNote}\`.trim();
    }
`;
content = content.replace('  async function submit() {\n    setMessage("");', submitFunction);
content = content.replace(/note: note\.trim\(\),/g, 'note: finalNote.trim(),');

fs.writeFileSync(file, content);
