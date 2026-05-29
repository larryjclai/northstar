const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/TransactionsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const pageLogic = `  const paginatedGroups = useMemo(() => groupedRecords.slice((page - 1) * pageSize, page * pageSize), [groupedRecords, page]);
  const totalPages = Math.ceil(groupedRecords.length / pageSize);`;

content = content.replace(
  '  const paginatedRows = useMemo(() => recordRows.slice((page - 1) * pageSize, page * pageSize), [recordRows, page]);',
  pageLogic
);

// We need to add the pagination controls back to TransactionsRoute at the end of the mapping.
// Let's replace the last </div> before </Card>
const controls = `          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, marginBottom: 24 }}>
              <button className="ns-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</button>
              <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
              <button className="ns-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</button>
            </div>
          )}`;
content = content.replace(/          <\/div>\n        \)}/, '          </div>\\n' + controls + '\\n        )}');

fs.writeFileSync(file, content);
