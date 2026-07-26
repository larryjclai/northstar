// Turn a raw SyncConflictRecord into something a human can actually judge.
// The conflict centre previously showed only `entity · id… · rev N`, which gave
// the user no basis to decide between local and remote. This derives a readable
// title, which side is newer, and the specific fields that differ.

import type { SyncConflictRecord, SyncEntity } from "../../../domain/sync";

const ENTITY_LABELS: Record<SyncEntity, string> = {
  account: "帳戶",
  ledger: "記帳",
  asset: "持倉資產",
  investment: "投資交易",
  recurring: "定期項目",
  recurringInvestment: "定期定額",
  goal: "目標",
  book: "帳本",
  invoice: "發票",
  client: "客戶",
  creditGroup: "信用卡群組",
  settings: "設定",
};

// Sync bookkeeping fields are never meaningful to show as a "change".
const IGNORED_FIELDS = new Set([
  "id",
  "revision",
  "updatedAt",
  "createdAt",
  "deletedAt",
  "userId",
  "householdId",
]);

// Friendly labels for the fields most likely to differ. Unknown keys fall back
// to the raw key so we never hide a real difference.
const FIELD_LABELS: Record<string, string> = {
  name: "名稱",
  balance: "餘額",
  currency: "幣別",
  amount: "金額",
  date: "日期",
  note: "備註",
  merchant: "商家",
  category: "分類",
  entryType: "類型",
  ticker: "代號",
  totalQuantity: "股數",
  averageCost: "平均成本",
  action: "動作",
  quantity: "股數",
  price: "價格",
  fee: "手續費",
  targetAmount: "目標金額",
  isActive: "啟用",
};

const TITLE_FIELDS = ["name", "ticker", "title", "note", "merchant"];

export interface ConflictFieldDiff {
  key: string;
  label: string;
  local: string;
  incoming: string;
}

export interface ConflictSummary {
  entityLabel: string;
  /** Best human identifier for the record (name / ticker / note …). */
  title: string;
  /** "local" | "incoming" | "tie" — which version carries the newer edit. */
  newer: "local" | "incoming" | "tie";
  diffs: ConflictFieldDiff[];
}

export function summarizeConflict(conflict: SyncConflictRecord): ConflictSummary {
  const { localPayload: local, incomingPayload: incoming } = conflict;
  const entityLabel = ENTITY_LABELS[conflict.entity] ?? conflict.entity;

  const titleField = TITLE_FIELDS.find(
    (f) => typeof local[f] === "string" && (local[f] as string).trim(),
  );
  const title = titleField
    ? String(local[titleField])
    : `${entityLabel} ${conflict.entityId.slice(0, 8)}…`;

  const localUpdated = String(local.updatedAt ?? "");
  const incomingUpdated = String(incoming.updatedAt ?? "");
  const newer: ConflictSummary["newer"] =
    localUpdated === incomingUpdated
      ? "tie"
      : localUpdated > incomingUpdated
        ? "local"
        : "incoming";

  const keys = new Set([...Object.keys(local), ...Object.keys(incoming)]);
  const diffs: ConflictFieldDiff[] = [];
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (JSON.stringify(local[key]) === JSON.stringify(incoming[key])) continue;
    diffs.push({
      key,
      label: FIELD_LABELS[key] ?? key,
      local: formatValue(local[key]),
      incoming: formatValue(incoming[key]),
    });
  }

  return { entityLabel, title, newer, diffs };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
