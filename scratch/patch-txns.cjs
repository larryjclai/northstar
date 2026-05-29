const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/TransactionsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add page state
const pageState = `
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [assetFor, monthKey]);

  const recordRows = useMemo(() => {
`;
content = content.replace('  const recordRows = useMemo(() => {', pageState);

const paginationUI = `
          {paginatedRows.map((row) => (
`;
content = content.replace('          {recordRows.map((row) => (', paginationUI);

const paginatedRowsDef = `
  const paginatedRows = useMemo(() => recordRows.slice((page - 1) * pageSize, page * pageSize), [recordRows, page]);
`;
content = content.replace('  const monthRows = useMemo(', paginatedRowsDef + '\n  const monthRows = useMemo(');

const paginationBottom = `
            </div>
          )}
          {recordRows.length > pageSize && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t" style={{ borderColor: 'var(--ns-border)' }}>
              <button className="ns-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</button>
              <div className="text-xs muted">
                第 {page} 頁 / 共 {Math.ceil(recordRows.length / pageSize)} 頁
              </div>
              <button className="ns-btn" disabled={page >= Math.ceil(recordRows.length / pageSize)} onClick={() => setPage(p => p + 1)}>下一頁</button>
            </div>
          )}
        </div>
`;
content = content.replace(/            <\/div>\n          \)}\n        <\/div>/, paginationBottom);

fs.writeFileSync(file, content);
