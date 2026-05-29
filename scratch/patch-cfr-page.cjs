const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const stateCode = `  const [page, setPage] = useState(1);
  const pageSize = 50;`;
content = content.replace(/const monthRows = useMemo\(\(\) => \{/g, stateCode + '\\n  const monthRows = useMemo(() => {');

const pageReset = `  const prevSelectedMonthRef = React.useRef(selectedMonth);
  if (prevSelectedMonthRef.current !== selectedMonth) {
    prevSelectedMonthRef.current = selectedMonth;
    setPage(1);
  }`;
content = content.replace('  const top5Merchants = useMemo', '  useEffect(() => { setPage(1); }, [selectedMonth, activeCategory, activeType, selectedAccountId]);\\n\\n  const top5Merchants = useMemo');

const pageLogic = `  const totalPages = Math.ceil(dayGroups.length / pageSize);
  const paginatedGroups = dayGroups.slice((page - 1) * pageSize, page * pageSize);`;
content = content.replace(/  if \(dayGroups\.length === 0\) \{/, pageLogic + '\\n\\n  if (dayGroups.length === 0) {');

const pageUi = `                  {paginatedGroups.map((g, gi) => (`;
content = content.replace(/                  \{dayGroups\.map\(\(g, gi\) => \(/, pageUi);

const pageControls = `                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, marginBottom: 24 }}>
                    <button className="ns-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</button>
                    <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
                    <button className="ns-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</button>
                  </div>`;
content = content.replace(/                <\/div>\n              \)\)\n            \}/, '                </div>\\n              ))}\\n' + pageControls);

fs.writeFileSync(file, content);
