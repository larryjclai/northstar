const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Revert paginatedGroups back to dayGroups
content = content.replace(/paginatedGroups\.map\(\(g, gi\)/g, 'dayGroups.map((g, gi)');
content = content.replace(/if \(paginatedGroups\.length === 0\)/g, 'if (dayGroups.length === 0)');
content = content.replace(/\{paginatedGroups\.length === 0 \? \(/g, '{dayGroups.length === 0 ? (');

// 2. Fix the bug: paginatedRows should use monthRows, not sortedRows
// Let's find monthRows definition: `const monthRows = useMemo(() => ...`
// Wait, paginatedRows is currently: `const paginatedRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);`
content = content.replace(
  'const paginatedRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);',
  'const totalPages = Math.ceil(monthRows.length / pageSize);\n  const paginatedRows = useMemo(() => monthRows.slice((page - 1) * pageSize, page * pageSize), [monthRows, page]);'
);

// We should also replace `{totalPages}` if it was previously `Math.ceil(dayGroups.length / pageSize)`
// Actually, earlier I added totalPages computation, let's see if it's there.
content = content.replace(
  /const totalPages = Math\.ceil\(dayGroups\.length \/ pageSize\);\n  const paginatedGroups = dayGroups\.slice\(\(page - 1\) \* pageSize, page \* pageSize\);/,
  ''
);

fs.writeFileSync(file, content);
