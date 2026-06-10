# components/ui — 待 COSS 對應物的隔離區

這個資料夾是 shadcn 風格的舊元件層，**僅保留 COSS UI 目前沒有對應物的原語**。
新程式碼一律優先使用 `src/components/coss/`（見 docs/coss-ui-migration-plan.md）。

## App 程式碼允許 import 的元件（白名單）

| 元件 | 用途 | COSS 缺口 |
|---|---|---|
| `command` | ⌘K 指令面板、可搜尋下拉（AppSelect/AccountFilter/CategoryFilter/GlobalSearch） | COSS 無 command palette |
| `popover` | 浮層定位 | COSS 無 popover |
| `date-picker` / `calendar` | 日期選擇 | COSS 無 calendar |
| `month-picker` | 月份選擇 | 同上 |

## 僅供上述元件內部使用（app 程式碼禁止直接 import）

`button` `input` `textarea` `dialog` `input-group` — 這些與 `coss/` 同名元件重複，
只因 calendar/command/dialog 內部引用而保留。直接需要按鈕/輸入框時用 `coss/button`、
`coss/input` 或 `.ns-input`。

2026-06-10 清理：`select` / `sheet` / `sonner` / `label` 無人引用已刪除（連同 npm
依賴 `sonner`）。若日後 COSS 提供 command/popover/calendar 對應物，整個資料夾應退役。
