import { CaretDown, MagicWand } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { useToast } from "../components/Toast";
import { useRepositoryMutation } from "../data/hooks";
import type { LedgerDraft } from "../data/repositories";
import {
  buildCategorySuggestions,
  buildMerchantCategoryMap,
  buildUserLexicon,
  loadCorrections,
  type CategorySuggestion,
} from "../domain";
import type { Account, AppSettings, LedgerTransaction } from "../domain/types";

const SOURCE_LABEL: Record<CategorySuggestion["source"], string> = {
  "merchant-rule": "商家紀錄",
  lexicon: "學習紀錄",
  keyword: "關鍵字",
};

/**
 * Suggest-and-confirm bulk categorization card (plan 174, Part B).
 *
 * Lists uncategorized transactions with a learned category suggestion each, and
 * writes the *checked* ones only when the user presses the single confirm
 * button. Nothing is ever auto-applied. High-confidence rows are pre-checked;
 * medium-confidence rows start unchecked so the user opts in deliberately.
 *
 * The card mounts only when there is something to suggest (or while it is open,
 * so the「全部完成」empty state is reachable right after applying the last batch).
 */
export function BulkCategorizeCard({
  ledgerRows,
  accounts,
  settings,
}: {
  ledgerRows: LedgerTransaction[];
  accounts: Account[];
  settings: AppSettings | undefined;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // transactionId → explicit checkbox override. Absent = use the confidence
  // default (high → checked, medium → unchecked).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const applyCategory = useRepositoryMutation(
    (repository, input: LedgerDraft & { id: string }) => repository.updateLedgerTransaction(input.id, input),
    ["ledger", "accounts"],
  );

  const corrections = useMemo(() => loadCorrections(), []);
  const lexicon = useMemo(
    () => (settings ? buildUserLexicon(accounts, ledgerRows, settings, corrections) : undefined),
    [accounts, ledgerRows, settings, corrections],
  );
  const merchantMap = useMemo(() => buildMerchantCategoryMap(ledgerRows), [ledgerRows]);
  const suggestions = useMemo(
    () => (lexicon ? buildCategorySuggestions(ledgerRows, lexicon, merchantMap) : []),
    [ledgerRows, lexicon, merchantMap],
  );

  const rowById = useMemo(() => new Map(ledgerRows.map((row) => [row.id, row])), [ledgerRows]);

  const isChecked = (s: CategorySuggestion) => overrides[s.transactionId] ?? (s.confidence === "high");
  const checkedList = suggestions.filter(isChecked);

  if (suggestions.length === 0 && !open) return null;

  async function handleApply() {
    if (checkedList.length === 0) return;
    let applied = 0;
    try {
      // Sequential writes: plugin-sql's pool serialization dislikes parallel
      // mutations (db-locked). Each write reconstructs the row's full draft and
      // only swaps in the suggested category/subcategory.
      for (const s of checkedList) {
        const row = rowById.get(s.transactionId);
        if (!row) continue;
        await applyCategory.mutateAsync(draftFromRow(row, s.category, s.subcategory));
        applied += 1;
      }
      setOverrides({});
      toast.success(`已套用 ${applied} 筆分類`);
    } catch {
      toast.error(applied > 0 ? `已套用 ${applied} 筆，其餘失敗` : "套用失敗");
    }
  }

  return (
    <Card className="mb-3.5" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header — always visible, doubles as the expand toggle. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full text-left"
        style={{ padding: "12px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <MagicWand size={15} weight="duotone" style={{ color: "var(--ns-accent)" }} />
        <span className="text-sm font-semibold">自動分類建議</span>
        {suggestions.length > 0 && (
          <span
            className="text-caption font-medium"
            style={{ padding: "1px 8px", borderRadius: 999, background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}
          >
            {suggestions.length} 筆待確認
          </span>
        )}
        <div className="flex-1" />
        <CaretDown size={14} className="ns-caret-rotate" style={{ color: "var(--ns-fg-muted)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--ns-border)" }}>
          {suggestions.length === 0 ? (
            <div className="muted text-body text-center" style={{ padding: "24px 16px" }}>
              沒有可建議的未分類交易
            </div>
          ) : (
            <>
              <div className="muted text-caption" style={{ padding: "10px 16px 0" }}>
                勾選要套用的建議，確認後才會寫入。高信心預設勾選、中信心需自行勾選。
              </div>
              <div className="flex flex-col">
                {suggestions.map((s) => {
                  const row = rowById.get(s.transactionId);
                  const checked = isChecked(s);
                  return (
                    <label
                      key={s.transactionId}
                      className="flex items-center gap-3"
                      style={{ padding: "10px 16px", cursor: "pointer", borderTop: "1px solid var(--ns-border)" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [s.transactionId]: e.target.checked }))}
                        style={{ accentColor: "var(--ns-accent)", width: 16, height: 16, flexShrink: 0 }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-body font-medium truncate">
                          {s.merchantText || row?.name || "未命名交易"}
                        </div>
                        <div className="muted text-caption" style={{ marginTop: 1 }}>
                          {row?.date?.slice(0, 10) ?? ""}
                          {row ? ` · ${row.currency} ${Math.abs(row.amount)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-caption font-medium" style={{ padding: "2px 8px", borderRadius: 999, background: "var(--ns-surface-strong)", color: "var(--ns-fg)" }}>
                          {s.suggested}
                        </span>
                        <span
                          className="text-caption"
                          style={{
                            padding: "2px 7px", borderRadius: 999,
                            background: s.confidence === "high" ? "var(--ns-pos-soft)" : "var(--ns-border)",
                            color: s.confidence === "high" ? "var(--ns-pos)" : "var(--ns-fg-muted)",
                          }}
                        >
                          {s.confidence === "high" ? "高" : "中"}·{SOURCE_LABEL[s.source]}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-2" style={{ padding: "12px 16px", borderTop: "1px solid var(--ns-border)" }}>
                <span className="muted text-caption flex-1">已勾選 {checkedList.length} / {suggestions.length} 筆</span>
                <Button
                  onClick={handleApply}
                  disabled={checkedList.length === 0 || applyCategory.isPending}
                  style={{ justifyContent: "center" }}
                >
                  {applyCategory.isPending ? "套用中…" : `套用 ${checkedList.length} 筆分類`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Rebuild a full LedgerDraft from an existing row, swapping only the category
 * and subcategory. Preserving every other field keeps the row's invariants
 * (amount sign, currency-account match) intact through updateLedgerTransaction.
 */
function draftFromRow(row: LedgerTransaction, category: string, subcategory: string): LedgerDraft & { id: string } {
  return {
    id: row.id,
    accountId: row.accountId,
    counterAccountId: row.counterAccountId,
    date: row.date,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    originalAmount: row.originalAmount,
    originalCurrency: row.originalCurrency,
    category,
    subcategory,
    merchant: row.merchant,
    entryType: row.entryType,
    settlementStatus: row.settlementStatus,
    note: row.note,
    groupId: row.groupId,
    installmentGroupId: row.installmentGroupId ?? null,
    installmentIndex: row.installmentIndex ?? null,
    installmentTotal: row.installmentTotal ?? null,
    refundOfLedgerId: row.refundOfLedgerId ?? null,
    recurringOccurrenceKey: row.recurringOccurrenceKey ?? null,
    postDate: row.postDate ?? null,
  };
}
