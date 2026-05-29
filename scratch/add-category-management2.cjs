const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// The file currently has literal `\n` strings in it due to `\\n` in my previous script!
content = content.replace(/\\n/g, '\n');

fs.writeFileSync(file, content);
