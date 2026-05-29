const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add createRecurring mutation
const createRecurringMutation = `  const createRecurring = useRepositoryMutation(
    (repository, input: import("../data/repositories").RecurringDraft) => repository.createRecurringTransaction(input),
    ["recurring"],
  );`;

content = content.replace('  const createTransfer = useRepositoryMutation(', createRecurringMutation + '\\n  const createTransfer = useRepositoryMutation(');

// 2. Fix pagination logic inside the return ()
content = content.replace(/dayGroups\.map\(\(g, gi\)/g, 'paginatedGroups.map((g, gi)');
content = content.replace(/if \(dayGroups\.length === 0\)/g, 'if (paginatedGroups.length === 0)');
content = content.replace(/\{dayGroups\.length === 0 \? \(/g, '{paginatedGroups.length === 0 ? (');

// 3. Fix onSubmitLedger logic to create recurring
const ledgerRecurringLogic = `        await createLedger.mutateAsync(payload);
        toast.success("已新增交易");
        if (drawerRecurringFreq !== "none") {
          await createRecurring.mutateAsync({
             frequency: drawerRecurringFreq as any,
             dayOfMonth: parseInt(payload.date.slice(8, 10)),
             accountId: payload.accountId,
             amount: payload.amount,
             currency: payload.currency,
             category: payload.category,
             subcategory: payload.subcategory,
             merchant: payload.merchant,
             entryType: payload.entryType,
             settlementStatus: payload.settlementStatus,
             note: payload.note,
             nextRunDate: payload.date.slice(0, 10)
          });
        }`;

content = content.replace(/        await createLedger\.mutateAsync\(payload\);\n        toast\.success\("已新增交易"\);/g, ledgerRecurringLogic);

fs.writeFileSync(file, content);
