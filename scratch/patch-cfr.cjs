const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const stateCode = `  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<CashType>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState("none");`;

content = content.replace(/  const \[drawerOpen, setDrawerOpen\] = useState\(false\);\n  const \[drawerType, setDrawerType\] = useState<CashType>\("expense"\);\n  const \[editingId, setEditingId\] = useState<string \| null>\(null\);/, stateCode);

const uiCode = `          <DrawerField label="週期交易">
            <select
              className="ns-input"
              value={drawerRecurringFreq}
              onChange={(e) => setDrawerRecurringFreq(e.target.value)}
              style={{ appearance: "none" }}
            >
              <option value="none">單次交易 (不重複)</option>
              <option value="weekly">每週</option>
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </DrawerField>

          <DrawerField label="備註">`;

content = content.replace(/          <DrawerField label="備註">/g, uiCode);

const submitLogic1 = `  async function onSubmitSingle() {
    try {
      const rLabel = drawerRecurringFreq === "weekly" ? "每週" : drawerRecurringFreq === "monthly" ? "每月" : drawerRecurringFreq === "yearly" ? "每年" : "";
      const recurringPrefix = rLabel ? \`[週期交易: \${rLabel}] \` : "";
      const noteStr = (recurringPrefix + ledgerForm.note).trim();

      const payload = { ...ledgerForm, note: noteStr };`;
content = content.replace(/  async function onSubmitSingle\(\) {\n    try {\n      const payload = \{ \.\.\.ledgerForm \};/, submitLogic1);

const submitLogic2 = `  async function onSubmitTransfer() {
    try {
      const rLabel = drawerRecurringFreq === "weekly" ? "每週" : drawerRecurringFreq === "monthly" ? "每月" : drawerRecurringFreq === "yearly" ? "每年" : "";
      const recurringPrefix = rLabel ? \`[週期交易: \${rLabel}] \` : "";
      const noteStr = (recurringPrefix + transferForm.note).trim();

      const payload = { ...transferForm, note: noteStr };`;
content = content.replace(/  async function onSubmitTransfer\(\) {\n    try {\n      const payload = \{ \.\.\.transferForm \};/, submitLogic2);

const openCreateMod = `  function openCreate(mode: CashType) {
    setDrawerType(mode);
    setDrawerRecurringFreq("none");`;
content = content.replace(/  function openCreate\(mode: CashType\) {\n    setDrawerType\(mode\);/, openCreateMod);

fs.writeFileSync(file, content);
