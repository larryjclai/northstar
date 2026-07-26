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
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // React Compiler diagnostic rules (plans/266-react-compiler.md). Plan 264
      // pinned the pre-v7 rule set to avoid inheriting these as `error` from
      // `recommended.rules` as a side effect of a dependency bump. This plan is
      // the deliberate, reviewable opt-in: enabled at `warn` (not `error`) so
      // lint stays green — this repo's convention is `error` only for
      // correctness guards (see `no-restricted-syntax` below). Findings are
      // recorded in plans/266-react-compiler.md, not fixed here.
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-refresh/only-export-components": "warn",
      "prefer-const": "warn",
      "no-irregular-whitespace": "warn",
      // ESLint 10 promoted these two to `error` in its recommended set. Plan 264
      // downgraded them to `warn` to land the ESLint 10 upgrade without breaking CI
      // on the 8 findings it turned up. Plan 272 cleared all 8 findings and restored
      // both to `error`, so a regression now fails CI instead of being absorbed into
      // the warning count.
      "no-useless-assignment": "error",
      "preserve-caught-error": "error",
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
