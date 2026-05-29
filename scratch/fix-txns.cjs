const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/TransactionsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// The groupedRecords already groups ALL rows.
// Let's create paginatedGroups
const pageLogic = `  const totalPages = Math.ceil(groupedRecords.length / pageSize);
  const paginatedGroups = groupedRecords.slice((page - 1) * pageSize, page * pageSize);`;

content = content.replace(/  const totalPages = Math\.ceil\(recordRows\.length \/ pageSize\);\n  const paginatedRows = recordRows\.slice\(\(page - 1\) \* pageSize, page \* pageSize\);/, pageLogic);

// Then replace groupedRecords.map with paginatedGroups.map in the JSX
content = content.replace(/\{groupedRecords\.map\(\(group\)/g, '{paginatedGroups.map((group)');
content = content.replace(/\{groupedRecords\.length === 0 \? \(/g, '{paginatedGroups.length === 0 ? (');

fs.writeFileSync(file, content);
