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
      // eslint-plugin-react-hooks@7's `recommended.rules` now bundles the React
      // Compiler diagnostic rules (react-hooks/refs, set-state-in-effect, purity,
      // etc.) as errors. Enabling those is plans/266-react-compiler.md, not this
      // upgrade (plans/264) — so pin the pre-v7 rule set explicitly instead of
      // spreading `recommended.rules`, which would turn them on as a side effect.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-refresh/only-export-components": "warn",
      "prefer-const": "warn",
      "no-irregular-whitespace": "warn",
      // ESLint 10 promoted these two to `error` in its recommended set. This repo's
      // convention is `warn` for advisory rules (see the six above) and `error` only
      // for correctness guards like no-restricted-syntax below. Keeping them visible
      // as warnings rather than breaking CI — the 8 current findings are recorded in
      // plans/README.md for a separate cleanup (plan 264).
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn",
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
