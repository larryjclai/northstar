import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "worker", "src-tauri", "scratch", "**/*.cjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-refresh/only-export-components": "warn",
      "prefer-const": "warn",
      "no-irregular-whitespace": "warn",
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.property.name="toLocaleString"]',
          message:
            "金額顯示必須走 src/domain/currency.ts 的 helpers（formatMoney / formatNumber / formatCompactMoney…），它們內建隱私遮罩。日期或輸入框編輯狀態屬例外——加 eslint-disable-next-line 並附一行理由。",
        },
      ],
    },
  },
  prettier,
);
