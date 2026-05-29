const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add page state
const pageState = `
  const [page, setPage] = useState(1);
  const pageSize = 50;
  
  useEffect(() => {
    setPage(1);
  }, [monthKey, accountFilter]);
  
  const sortedRows = useMemo(
`;
content = content.replace('  const sortedRows = useMemo(', pageState);

// Replace dayGroups definition
const dayGroupsDef = `
  const paginatedRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);
  const dayGroups = useMemo(() => groupByDay(paginatedRows), [paginatedRows]);
`;
content = content.replace('  const dayGroups = useMemo(() => groupByDay(sortedRows), [sortedRows]);', dayGroupsDef);

// Add pagination buttons at the bottom of the ledger list
const paginationUI = `
            </div>
          )}
          {sortedRows.length > pageSize && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t" style={{ borderColor: 'var(--ns-border)' }}>
              <button className="ns-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</button>
              <div className="text-xs muted">
                第 {page} 頁 / 共 {Math.ceil(sortedRows.length / pageSize)} 頁
              </div>
              <button className="ns-btn" disabled={page >= Math.ceil(sortedRows.length / pageSize)} onClick={() => setPage(p => p + 1)}>下一頁</button>
            </div>
          )}
        </div>
`;
content = content.replace(/            <\/div>\n          \)}\n        <\/div>/, paginationUI);

fs.writeFileSync(file, content);
