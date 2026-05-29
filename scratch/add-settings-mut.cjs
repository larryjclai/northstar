const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const mut = `  const updateSettingsMutation = useRepositoryMutation(
    (repository, input: import("../domain/types").AppSettings) => repository.updateAppSettings(input),
    ["settings"],
  );`;

content = content.replace('  const createRecurring = useRepositoryMutation(', mut + '\\n  const createRecurring = useRepositoryMutation(');
content = content.replace('await updateAppSettings({', 'await updateSettingsMutation.mutateAsync({');

fs.writeFileSync(file, content);
