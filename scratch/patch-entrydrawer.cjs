const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add props to EntryDrawer
content = content.replace(
  '  message,\n}: {\n',
  '  message,\n  drawerRecurringFreq,\n  setDrawerRecurringFreq,\n}: {\n'
);
content = content.replace(
  '  message: string;\n}) {\n',
  '  message: string;\n  drawerRecurringFreq: string;\n  setDrawerRecurringFreq: (v: string) => void;\n}) {\n'
);

// 2. Pass props from CashFlowRoute to EntryDrawer
content = content.replace(
  '        message={message}\n      />\n',
  '        message={message}\n        drawerRecurringFreq={drawerRecurringFreq}\n        setDrawerRecurringFreq={setDrawerRecurringFreq}\n      />\n'
);

fs.writeFileSync(file, content);
