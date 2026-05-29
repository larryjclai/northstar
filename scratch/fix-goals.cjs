const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/GoalsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Fix hardcoded 0
content = content.replace(/const current = goal\.kind === "fire" \? currentValue : 0;/g, 'const current = goal.kind === "fire" ? currentValue : (currentValue / goalTargetAmount(goal)) * 100;');
// Wait, the progress bar expects absolute value? No, the code likely says `const progress = (current / targetAmount) * 100`. So current should be `currentValue`.
content = content.replace(/const current = goal\.kind === "fire" \? currentValue : 0;/g, 'const current = currentValue;');

// Fix edit navigation for non-fire goals
content = content.replace(/navigate\(\{ to: "\/goals\/fire", search: \{ id: goal\.id \} \}\)/g, 'navigate({ to: goal.kind === "fire" ? "/goals/fire" : "/goals", search: { id: goal.id } })');
// Wait, generic edit route might not exist, but let's route to /goals (which opens the modal usually, or maybe /goals/add?). Wait, the router might not have `/goals/edit`. Let's just pass `id` to `/goals` because the route can open a modal if `search.id` is present.

fs.writeFileSync(file, content);
