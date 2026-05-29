const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../src/routes/CashFlowRoute.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Import CategoryManagementDrawer
const importStmt = `import { CategoryManagementDrawer } from "../components/CategoryManagementDrawer";`;
content = content.replace('import { DatePicker } from "../components/ui/date-picker";', 'import { DatePicker } from "../components/ui/date-picker";\\n' + importStmt);

// 2. Add state for drawer open
const stateStmt = `  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);`;
content = content.replace('  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState("none");', '  const [drawerRecurringFreq, setDrawerRecurringFreq] = useState("none");\\n' + stateStmt);

// 3. Add the button in the UI (replace `<a>Categories</a>` or similar)
// Let's find the filter bar
content = content.replace(
  '<a className="ns-btn ghost" style={{ padding: "0 10px" }}>分類</a>',
  '<button className="ns-btn ghost" style={{ padding: "0 10px" }} onClick={() => setCategoryDrawerOpen(true)}>分類管理</button>'
);
// In case the exact string wasn't found, try a generic replace
content = content.replace(
  /<button className="ns-btn ghost" style=\{\{ padding: "0 10px" \}\}>分類<\/button>/g,
  '<button className="ns-btn ghost" style={{ padding: "0 10px" }} onClick={() => setCategoryDrawerOpen(true)}>分類管理</button>'
);

// 4. Mount the drawer at the end
const drawerComponent = `      <CategoryManagementDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={appSettings?.categories || []}
        onSave={async (cats) => {
          if (!appSettings) return;
          await updateAppSettings({ ...appSettings, categories: cats });
          toast.success("已更新分類設定");
        }}
      />`;

content = content.replace('    </div>\n  );\n}', drawerComponent + '\\n    </div>\\n  );\\n}');

fs.writeFileSync(file, content);
