const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/DashboardRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// Remove DatePicker import
content = content.replace('import { DatePicker } from "../components/ui/date-picker";\n', '');

// Replace DatePicker component with input type="month"
content = content.replace(
  '<DatePicker view="month" value={monthKey + "-01"} onChange={date => setMonthKey(date.slice(0, 7))} />',
  '<input type="month" className="ns-input" style={{ width: 140, height: 36 }} value={monthKey} onChange={e => setMonthKey(e.target.value)} />'
);

fs.writeFileSync(file, content);
