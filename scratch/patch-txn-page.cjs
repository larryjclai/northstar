const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/TransactionsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const stateCode = `  const [page, setPage] = useState(1);
  const pageSize = 50;`;
content = content.replace(/const monthRows = recordRows\.filter/g, stateCode + '\\n  const monthRows = recordRows.filter');

const effectCode = `  useEffect(() => { setPage(1); }, [monthKey, assetFor]);`;
content = content.replace(/  const twdSettlementWatchCount = monthRows\.filter/g, effectCode + '\\n  const twdSettlementWatchCount = monthRows.filter');

const pageLogic = `  const totalPages = Math.ceil(recordRows.length / pageSize);
  const paginatedRows = recordRows.slice((page - 1) * pageSize, page * pageSize);`;
content = content.replace(/          <div className="overflow-x-auto">/g, pageLogic + '\\n          <div className="overflow-x-auto">');

const pageUi = `                  {paginatedRows.map((r) => (`;
content = content.replace(/                  \{recordRows\.map\(\(r\) => \(/g, pageUi);

const pageControls = `          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, marginBottom: 24 }}>
              <button className="ns-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</button>
              <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
              <button className="ns-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</button>
            </div>
          )}`;
content = content.replace(/          <\/div>\n        <\/div>\n      <\/Card>\n    <\/div>\n  \);\n}/g, '          </div>\\n' + pageControls + '\\n        </div>\\n      </Card>\\n    </div>\\n  );\\n}');

fs.writeFileSync(file, content);
