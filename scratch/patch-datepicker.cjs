const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add DatePicker import
const importDP = `import { DatePicker } from "../components/ui/date-picker";\n`;
if (!content.includes('DatePicker')) {
  content = content.replace('import { useToast } from "../components/Toast";', importDP + 'import { useToast } from "../components/Toast";');
}

// Replace input type="month"
const newPicker = `<DatePicker value={selectedMonth + "-01"} onChange={(val) => setSelectedMonth(val.slice(0, 7))} className="h-full border border-[var(--ns-border)] rounded-md" />`;
content = content.replace(/<input\s+type="month"[^>]*\/>/, newPicker);

fs.writeFileSync(file, content);
