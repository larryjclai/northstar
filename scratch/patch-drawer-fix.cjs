const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowEntryDrawer.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/value=\{recurring\}/g, 'value={drawerRecurringFreq}');
content = content.replace(/setRecurring\(/g, 'setDrawerRecurringFreq(');

// Also remove my submit function hijack, we should just let onSubmit do its thing, 
// because if the state is managed in CashFlowRoute, it's likely CashFlowRoute's submit handler uses drawerRecurringFreq!
const rLabelCode = `    const rLabel = drawerRecurringFreq === "weekly" ? "每週" : drawerRecurringFreq === "monthly" ? "每月" : drawerRecurringFreq === "yearly" ? "每年" : "";
    const recurringPrefix = rLabel ? \`[週期交易: \${rLabel}] \` : "";`;

content = content.replace(/const rLabel = recurring === "weekly".*? "";/, '');
content = content.replace(/const recurringPrefix = rLabel \?.*? "";/, '');
content = content.replace(/note: \(recurringPrefix \+ transferForm\.note\)\.trim\(\)/g, 'note: transferForm.note.trim()');
content = content.replace(/note: \(recurringPrefix \+ ledgerForm\.note\)\.trim\(\)/g, 'note: ledgerForm.note.trim()');

// If we removed the old submit function and it has trailing garbage we should revert submit
fs.writeFileSync(file, content);
