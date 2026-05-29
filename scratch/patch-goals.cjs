const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/GoalsRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Fix 1: activeRate in projection
const projUseMemoOld = `  const projection = useMemo(
    () => (fireGoal ? projectRetirement({ goal: fireGoal, currentValue }) : null),
    [fireGoal, currentValue],
  );`;
const projUseMemoNew = `  const projection = useMemo(
    () => (fireGoal ? projectRetirement({ goal: { ...fireGoal, annualReturnRate: activeRate }, currentValue }) : null),
    [fireGoal, currentValue, activeRate],
  );`;
content = content.replace(projUseMemoOld, projUseMemoNew);

// Fix 2: remove window.confirm from handleDeleteGoal
const deleteOld = `  async function handleDeleteGoal(id: string) {
    if (!window.confirm("確定要刪除這個目標嗎？")) return;
    try {
      await deleteGoal.mutateAsync(id);
      toast.success("已刪除目標");
    } catch (e) {
      toast.error("刪除目標失敗");
    }
  }`;
const deleteNew = `  async function handleDeleteGoal(id: string) {
    try {
      await deleteGoal.mutateAsync(id);
      toast.success("已刪除目標");
    } catch (e) {
      toast.error("刪除目標失敗");
    }
  }`;
content = content.replace(deleteOld, deleteNew);

fs.writeFileSync(file, content);
