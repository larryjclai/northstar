const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/GoalsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

const oldProj = `  const projection = useMemo(
    () => (fireGoal ? projectRetirement({ goal: { ...fireGoal, annualReturnRate: activeRate }, currentValue }) : null),
    [fireGoal, currentValue, activeRate],
  );

  const projectionRates = { bear: 0.05, base: 0.072, bull: 0.1 };
  const activeRate = projectionRates[activeProjection];`;

const newProj = `  const projectionRates = { bear: 0.05, base: 0.072, bull: 0.1 };
  const activeRate = projectionRates[activeProjection];

  const projection = useMemo(
    () => (fireGoal ? projectRetirement({ goal: { ...fireGoal, expectedAnnualReturn: activeRate }, currentValue }) : null),
    [fireGoal, currentValue, activeRate],
  );`;

content = content.replace(oldProj, newProj);
fs.writeFileSync(file, content);
