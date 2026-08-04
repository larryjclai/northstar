import { Plus, X, ArrowRight } from "@phosphor-icons/react";
import { Badge } from "./coss/badge";
import { Button } from "./coss/button";
import { Card } from "./coss/card";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import {
  buildLedgerLabelStats,
  buildLedgerSuggestions,
  buildMerchantCategoryMap,
  buildUserLexicon,
  categoryPickerOptions,
  defaultAccountForCategory,
  formatMoney,
  formatNumber,
  formatPrice,
  loadCorrections,
  nowAsDatetimeLocal,
  parseQuickAdd,
  saveCorrection,
  type CorrectionStore,
  type LedgerTransaction,
  type QuickAddParsed,
} from "../domain";
import { orchestrate, type ParseSource } from "../domain/nlParser";
import { ALL_BOOKS, bookAccountIdSet, scopeRows } from "../domain/bookScope";
import { escapeTargetInsideDialog } from "../lib/escapeOwnership";
import { createOnDeviceParser } from "../lib/foundationModels";
import { haptic } from "../lib/haptics";
import { useUiPreferences } from "../state/uiPreferences";
import { useToast } from "./Toast";
import { AccountFilter } from "./AccountFilter";
import { SuggestInput } from "./SuggestInput";
import { Glyph } from "../lib/icons";
import { readableTextColor } from "../lib/color";
import { useKeyboardInset } from "../hooks/useKeyboardInset";

// §6.4 example chips shown on empty input — one 投資 example, the rest 記帳.
const QUICK_ADD_EXAMPLES: { text: string; mode: "ledger" | "investment" }[] = [
  { text: "午餐 120 信用卡", mode: "ledger" },
  { text: "計程車 250", mode: "ledger" },
  { text: "2330.TW 5股 @1042", mode: "investment" },
];

type LedgerConfirm = {
  kind: "ledger";
  entryType: "expense" | "income";
  amount: string;
  accountId: string;
  name: string;
  merchant: string;
  category: string;
  subcategory: string;
  date: string;
};
type InvestmentConfirm = {
  kind: "investment";
  action: "buy" | "sell";
  ticker: string;
  quantity: string;
  price: string;
  accountId: string;
  date: string;
};
type Confirm = LedgerConfirm | InvestmentConfirm;

function toConfirm(
  parsed: QuickAddParsed,
  fallbackText: string,
  nowDatetimeLocal: string,
): Confirm {
  if (parsed.kind === "investment") {
    return {
      kind: "investment",
      action: parsed.action,
      ticker: parsed.ticker,
      quantity: parsed.quantity ? String(parsed.quantity) : "",
      price: parsed.price ? String(parsed.price) : "",
      accountId: parsed.accountId ?? "",
      date: parsed.date ?? nowDatetimeLocal,
    };
  }
  if (parsed.kind === "ledger") {
    // name (description) and merchant (store) are separate records: the parser
    // fills merchant only from @ syntax or a known-merchant hit, so free text
    // no longer gets duplicated into both fields.
    return {
      kind: "ledger",
      entryType: parsed.entryType,
      amount: String(parsed.amount),
      accountId: parsed.accountId ?? "",
      name: parsed.name ?? "",
      merchant: parsed.merchant,
      category: parsed.category,
      subcategory: parsed.subcategory,
      date: parsed.date ?? nowDatetimeLocal,
    };
  }
  // unknown → prefill an expense with the raw text as the name for manual completion
  return {
    kind: "ledger",
    entryType: "expense",
    amount: "",
    accountId: "",
    name: fallbackText.trim(),
    merchant: "",
    category: "",
    subcategory: "",
    date: nowDatetimeLocal,
  };
}

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const timezone = useUiPreferences((state) => state.timezone);
  const sidebarCollapsed = useUiPreferences((state) => state.sidebarCollapsed);
  const activeBookId = useUiPreferences((state) => state.activeBookId);
  const overlayLeft = sidebarCollapsed ? 64 : 240;
  const { accounts, ledger, settings } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];

  // 帳本 entry defaults (plan 189 §5): the account picker defaults to the active
  // book's accounts (with a 顯示全部 escape); 總帳 shows all. Parsing still reads
  // every account so typing another book's account name resolves. `switcher
  // Ledger` scopes the §6.5 default-account-for-category lookup to the book so it
  // composes with plan 175's logic (book filter first, then the usual account).
  const isAllBooks = activeBookId === ALL_BOOKS;
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const switcherAccountIds = useMemo(
    () => bookAccountIdSet(accountRows, activeBookId),
    [accountRows, activeBookId],
  );
  const bookAccounts = useMemo(
    () => accountRows.filter((a) => switcherAccountIds.has(a.id)),
    [accountRows, switcherAccountIds],
  );
  const pickerAccounts = isAllBooks || showAllAccounts ? accountRows : bookAccounts;
  const primaryCurrency = settings.data?.primaryCurrency ?? "TWD";
  const merchantCat = useMemo(() => buildMerchantCategoryMap(ledgerRows), [ledgerRows]);
  const [corrections, setCorrections] = useState<CorrectionStore>(() => loadCorrections());
  const lexicon = useMemo(
    () =>
      settings.data
        ? buildUserLexicon(accountRows, ledgerRows, settings.data, corrections)
        : undefined,
    [accountRows, ledgerRows, settings.data, corrections],
  );
  const categoryGroups = settings.data?.categories ?? [];

  const [text, setText] = useState("");
  const [mode, setMode] = useState<"ledger" | "investment">("ledger");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Snapshot of the confirm card at parse time — used to detect what the user
  // corrected so we can persist the correction for future parses.
  const [originalGuess, setOriginalGuess] = useState<Confirm | null>(null);
  const [error, setError] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  // Real-time preview: updated every 150 ms as the user types (P5).
  const [preview, setPreview] = useState<QuickAddParsed | null>(null);
  // §6.3 preview remediation: account chosen via a preview-stage account chip
  // (shown when the parse has an amount but no account match) — carried into
  // toConfirm()'s accountId when the user hits Enter/解析. Cleared per-session.
  const [previewAccountOverride, setPreviewAccountOverride] = useState<string | null>(null);
  // §6.3 preview remediation: true once the user taps the 建議 badge on a
  // guessed category chip to dismiss it — suppresses that guess from flowing
  // into the confirm card so its picker starts empty. Reset whenever the
  // preview re-parses (new text = a fresh guess, if any).
  const [categoryGuessCleared, setCategoryGuessCleared] = useState(false);
  // Track whether the last confirm result came from Tier 0 or Tier 1 (P6).
  const [parseSource, setParseSource] = useState<ParseSource>("rules");
  // Device-side AI availability — null while checking, then true/false.
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Stable on-device parser handle — created once for the lifetime of the component.
  const onDeviceParser = useMemo(() => createOnDeviceParser(), []);
  // iOS WKWebView doesn't shrink the layout viewport for the software keyboard —
  // shift the panel up by the covered height so the input bar stays visible.
  const keyboardInset = useKeyboardInset();

  const createLedger = useRepositoryMutation(
    (repository, input: import("../data/repositories").LedgerDraft) =>
      repository.createLedgerTransaction(input),
    ["ledger", "accounts"],
  );
  const createInvestment = useRepositoryMutation(
    (repository, input: import("../data/repositories").InvestmentDraft) =>
      repository.createInvestmentRecord(input),
    ["investments", "assets", "accounts", "ledger"],
  );

  useEffect(() => {
    if (open) {
      setText("");
      setMode("ledger");
      setConfirm(null);
      setOriginalGuess(null);
      setError("");
      setParseSource("rules");
      setPreviewAccountOverride(null);
      setCategoryGuessCleared(false);
      setTimeout(() => inputRef.current?.focus(), 30);
      // Prewarm the on-device model so the first real parse call has minimal latency.
      onDeviceParser.prewarm?.();
      // Probe device-side AI availability so we can surface it to the user.
      setAiAvailable(null);
      onDeviceParser
        .available()
        .then(setAiAvailable)
        .catch(() => setAiAvailable(false));
    }
  }, [open, onDeviceParser]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // QuickAdd hosts no ModalShell today, but the stacking contract must
      // stay uniform with EntryDrawer's (plan 305/301): a stacked ModalShell
      // dialog's focus trap keeps focus inside it, so an Escape meant for
      // that dialog still targets it — ignore it here so this window
      // listener doesn't also close QuickAdd underneath.
      if (e.key === "Escape" && !escapeTargetInsideDialog(e)) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced real-time preview (P5): parse 150 ms after the user stops typing.
  // Cleared when the confirm card is open or the input is empty.
  useEffect(() => {
    if (confirm || !text.trim()) {
      setPreview(null);
      return;
    }
    // A new parse cycle means fresh input — let a new guess (if any) show
    // its 建議 badge again rather than staying suppressed from a prior edit.
    setCategoryGuessCleared(false);
    const now = nowAsDatetimeLocal(timezone);
    const t = setTimeout(() => {
      const parsed = parseQuickAdd(text, {
        accounts: accountRows,
        merchantCategory: merchantCat,
        lexicon,
        mode,
        nowDatetimeLocal: now,
      });
      setPreview(parsed.kind !== "unknown" ? parsed : null);
    }, 150);
    return () => clearTimeout(t);
  }, [text, mode, confirm, accountRows, merchantCat, lexicon, timezone]);

  const ledgerSuggestions = useMemo(
    () =>
      confirm?.kind === "ledger"
        ? buildLedgerSuggestions(ledgerRows, {
            category: confirm.category || undefined,
            merchant: confirm.merchant || undefined,
          })
        : { merchants: [], accountIds: [] },
    [confirm, ledgerRows],
  );

  // All known merchants ranked by history frequency, for the 商家 autocomplete.
  // lexicon.merchants already merges ledger history with settings.merchants,
  // deduped; fall back to the history-derived map before settings load.
  const merchantOptions = useMemo(
    () => (lexicon ? lexicon.merchants.map((m) => m.name) : [...merchantCat.keys()]),
    [lexicon, merchantCat],
  );

  // 名稱 autocomplete (plan 282): only from ledger history, deliberately not
  // via the lexicon — lexicon.merchants mixes in settings.merchants seeds,
  // names have no such seed layer.
  const nameOptions = useMemo(
    () => buildLedgerLabelStats(ledgerRows, "name").map((s) => s.value),
    [ledgerRows],
  );

  if (!open) return null;

  async function parse() {
    if (!text.trim()) return;
    const now = nowAsDatetimeLocal(timezone);
    const ctx = {
      accounts: accountRows,
      merchantCategory: merchantCat,
      lexicon,
      mode,
      nowDatetimeLocal: now,
      categories: categoryGroups.map((g) => g.name),
    };
    const { result: parsed, source } = await orchestrate(text, ctx, onDeviceParser);
    const c = toConfirm(parsed, text, now);
    // §6.3 preview remediation: an account chip tapped at the preview stage
    // (before an account matched) takes priority over the §6.5 category-based
    // default below — it's an explicit user choice, not a derived guess.
    if (c.kind === "ledger" && !c.accountId && previewAccountOverride) {
      c.accountId = previewAccountOverride;
    }
    // §6.3 preview remediation: the user dismissed the preview's guessed
    // category — start the confirm card's picker empty instead of carrying
    // the guess forward.
    if (c.kind === "ledger" && categoryGuessCleared) {
      c.category = "";
      c.subcategory = "";
    }
    // §6.5 記住每分類的常用帳戶: when the parser resolved a category but no
    // account, default to the account most used for that category (derived from
    // ledger history). This sets a *default*, not a parse — the confirm card
    // stays fully editable, and because originalGuess captures it too, keeping
    // the default is not recorded as a user correction.
    if (c.kind === "ledger" && !c.accountId && c.category) {
      // Compose with plan 189: in a specific book, prefer the usual account
      // *within that book* (scope the history first, then 175's default).
      const usual = defaultAccountForCategory(
        isAllBooks ? ledgerRows : scopeRows(ledgerRows, switcherAccountIds),
        c.category,
      );
      if (usual) c.accountId = usual;
    }
    setConfirm(c);
    setOriginalGuess(c);
    setParseSource(source);
    setError("");
  }

  function accountCurrency(id: string) {
    return accountRows.find((a) => a.id === id)?.currency ?? primaryCurrency;
  }

  async function submit() {
    if (!confirm) return;
    setError("");
    try {
      if (confirm.kind === "ledger") {
        const amount = Number(confirm.amount);
        if (!amount || amount <= 0) {
          setError("請輸入有效金額。");
          return;
        }
        if (!confirm.accountId) {
          setError("請選擇帳戶。");
          return;
        }
        await createLedger.mutateAsync({
          accountId: confirm.accountId,
          date: confirm.date || nowAsDatetimeLocal(timezone),
          name: confirm.name.trim() || confirm.merchant.trim(),
          amount: confirm.entryType === "expense" ? -Math.abs(amount) : Math.abs(amount),
          currency: accountCurrency(confirm.accountId),
          category: confirm.category.trim(),
          subcategory: confirm.subcategory.trim(),
          merchant: confirm.merchant.trim(),
          entryType: confirm.entryType,
          settlementStatus: "settled",
          note: "",
        });
        toast.success("已記一筆");
        void haptic("success");

        // Persist corrections: if the user changed account or category from
        // what the parser guessed, remember the mapping for next time.
        if (originalGuess?.kind === "ledger") {
          const key = confirm.merchant.trim() || confirm.name.trim();
          if (key) {
            const corr: import("../domain").QuickAddCorrection = {};
            if (confirm.accountId && confirm.accountId !== originalGuess.accountId) {
              corr.accountId = confirm.accountId;
            }
            if (
              confirm.category !== originalGuess.category ||
              confirm.subcategory !== originalGuess.subcategory
            ) {
              corr.category = confirm.category;
              corr.subcategory = confirm.subcategory;
            }
            if (Object.keys(corr).length > 0) {
              saveCorrection(key, corr);
              setCorrections((prev) => ({
                ...prev,
                [key.toLowerCase().trim()]: { ...prev[key.toLowerCase().trim()], ...corr },
              }));
            }
          }
        }
      } else {
        const quantity = Number(confirm.quantity);
        const price = Number(confirm.price);
        if (!confirm.ticker.trim()) {
          setError("請輸入標的代號。");
          return;
        }
        if (!quantity || quantity <= 0) {
          setError("請輸入有效股數。");
          return;
        }
        await createInvestment.mutateAsync({
          ticker: confirm.ticker.trim().toUpperCase(),
          name: confirm.ticker.trim().toUpperCase(),
          currency: confirm.accountId ? accountCurrency(confirm.accountId) : primaryCurrency,
          linkedAccountId: confirm.accountId || null,
          date: confirm.date || nowAsDatetimeLocal(timezone),
          action: confirm.action,
          price: price || 0,
          quantity,
          fee: 0,
          note: "",
        });
        toast.success(confirm.action === "buy" ? "已記錄買入" : "已記錄賣出");
        void haptic("success");
      }
      onClose();
    } catch (e) {
      // plugin-sql surfaces DB errors as bare strings, not Error instances —
      // a plain `instanceof Error` check would swallow them and show the generic
      // fallback (the cause of "儲存失敗" appearing even on real DB errors).
      const message = e instanceof Error ? e.message : typeof e === "string" ? e : "儲存失敗。";
      setError(message);
    }
  }

  const pending = createLedger.isPending || createInvestment.isPending;

  function chooseMerchant(merchant: string) {
    if (!confirm || confirm.kind !== "ledger") return;
    const known = merchantCat.get(merchant);
    setConfirm({
      ...confirm,
      merchant,
      category: confirm.category || known?.category || "",
      subcategory: confirm.subcategory || known?.subcategory || "",
    });
  }

  return (
    <div
      className="ns-quickadd-overlay flex"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: overlayLeft,
        zIndex: 80,
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <style>{`@media (max-width:1023.98px){.ns-quickadd-overlay{left:0 !important;}}`}</style>
      <div style={{ position: "absolute", inset: 0, background: "var(--ns-scrim)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_140ms_var(--ns-ease-out-strong)] flex flex-col gap-2.5"
        style={{
          position: "relative",
          width: "min(620px, 94vw)",
          marginBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          maxHeight: `calc(100dvh - 24px - env(safe-area-inset-top, 0px) - ${keyboardInset}px)`,
          transform: keyboardInset ? `translateY(-${keyboardInset}px)` : undefined,
        }}
      >
        {/* Confirm card (shown after parsing) */}
        {confirm ? (
          <Card
            className="p-4"
            style={{ boxShadow: "var(--ns-shadow-strong)", overflowY: "auto", minHeight: 0 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--ns-fg-muted)" }}>
                  確認 ·{" "}
                  {confirm.kind === "investment"
                    ? confirm.action === "buy"
                      ? "買入"
                      : "賣出"
                    : confirm.entryType === "expense"
                      ? "支出"
                      : "收入"}
                </span>
                {parseSource === "on-device" ? (
                  <span
                    className="text-micro"
                    title="由裝置端 AI 解析（Apple Foundation Models）"
                    style={{
                      opacity: 0.6,
                      padding: "1px 6px",
                      borderRadius: 999,
                      border: "1px solid var(--ns-border)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    AI
                  </span>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="取消"
                onClick={() => setConfirm(null)}
              >
                <X size={14} />
              </Button>
            </div>
            {confirm.kind === "ledger" ? (
              (() => {
                // Only offer categories matching the entry's 收入/支出 type (plan 056 +
                // plan 098). The selected category is always kept visible even if its
                // kind doesn't match — e.g. an NL-parser guess — so it stays deselectable.
                const pickerCategories = categoryPickerOptions(
                  categoryGroups,
                  confirm.entryType,
                  confirm.category,
                );
                return (
                  <div className="ns-quickadd-grid gap-2.5">
                    <Field label="金額">
                      <input
                        className="ns-input"
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={
                          amountFocused
                            ? confirm.amount
                            : parseFloat(confirm.amount)
                              ? parseFloat(confirm.amount).toLocaleString("zh-TW")
                              : confirm.amount
                        }
                        onFocus={() => setAmountFocused(true)}
                        onBlur={() => setAmountFocused(false)}
                        onChange={(e) =>
                          setConfirm({ ...confirm, amount: e.target.value.replace(/[^\d.]/g, "") })
                        }
                      />
                    </Field>
                    <Field label="分類">
                      {/* Two-level picker: category chips (icon glyph + name, contrast-aware
                      when active) then its subcategories below (B11 + B14). */}
                      <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
                        {pickerCategories.map((category) => {
                          const active = confirm.category === category.name;
                          const color = category.color || "var(--ns-accent)";
                          return (
                            <button
                              key={category.name}
                              type="button"
                              onClick={() =>
                                setConfirm({
                                  ...confirm,
                                  category: active ? "" : category.name,
                                  subcategory: "",
                                })
                              }
                              className="text-xs items-center gap-1 ns-chip"
                              style={{
                                padding: "4px 10px",
                                borderRadius: 999,
                                cursor: "pointer",
                                background: active ? color : "var(--ns-bg-card)",
                                color: active ? readableTextColor(color) : "var(--ns-fg)",
                                border: active
                                  ? "1px solid rgba(0,0,0,0.12)"
                                  : "1px solid var(--ns-border)",
                                display: "inline-flex",
                                fontFamily: "inherit",
                              }}
                            >
                              {category.iconName && <Glyph name={category.iconName} size={13} />}
                              {category.name}
                            </button>
                          );
                        })}
                      </div>
                      {(() => {
                        const subs =
                          pickerCategories.find((c) => c.name === confirm.category)?.children ?? [];
                        return subs.length ? (
                          <div
                            className="flex pl-2"
                            style={{
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 7,
                              borderLeft: "2px solid var(--ns-border)",
                            }}
                          >
                            {subs.map((s) => {
                              const active = confirm.subcategory === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() =>
                                    setConfirm({ ...confirm, subcategory: active ? "" : s })
                                  }
                                  className="text-caption ns-chip"
                                  style={{
                                    padding: "3px 9px",
                                    borderRadius: 999,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    background: active ? "var(--ns-accent)" : "var(--ns-bg-hover)",
                                    color: active ? "var(--ns-accent-fg)" : "var(--ns-fg-muted)",
                                    border: "none",
                                  }}
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        ) : null;
                      })()}
                    </Field>
                    <Field label="名稱">
                      <SuggestInput
                        value={confirm.name}
                        options={nameOptions}
                        onChange={(next) => setConfirm({ ...confirm, name: next })}
                        placeholder="交易名稱"
                        ariaLabel="名稱建議"
                      />
                    </Field>
                    <Field label="商家">
                      {/* Autocomplete input: filtered dropdown of known merchants,
                      ranked by history frequency; free text stays allowed.
                      Selecting reuses chooseMerchant so the merchant's learned
                      category auto-applies (plan 180). */}
                      <SuggestInput
                        value={confirm.merchant}
                        options={merchantOptions}
                        onChange={chooseMerchant}
                        ariaLabel="商家建議"
                      />
                    </Field>
                    <Field label="帳戶">
                      <AccountFilter
                        accounts={pickerAccounts}
                        value={confirm.accountId}
                        onChange={(id) => setConfirm({ ...confirm, accountId: id })}
                        allowAll={false}
                        placeholder="選擇帳戶"
                        style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                        positionerClassName="z-[90]"
                      />
                      {/* 帳本 escape (plan 189 §5): reveal accounts outside the active
                      book without leaving 快速記帳. Hidden in 總帳 (all shown). */}
                      {!isAllBooks && !showAllAccounts ? (
                        <button
                          type="button"
                          className="muted text-xs"
                          style={{
                            marginTop: 4,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                          onClick={() => setShowAllAccounts(true)}
                        >
                          顯示全部帳戶
                        </button>
                      ) : null}
                    </Field>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <Field label="日期">
                        <input
                          className="ns-input"
                          type="datetime-local"
                          value={confirm.date}
                          onChange={(e) => setConfirm({ ...confirm, date: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="text-xs" style={{ gridColumn: "1 / -1" }}>
                      {ledgerSuggestions.merchants.length > 0 ||
                      ledgerSuggestions.accountIds.length > 0 ? (
                        <div className="muted" style={{ marginBottom: 5 }}>
                          依過往紀錄建議
                        </div>
                      ) : null}
                      <div className="flex" style={{ flexWrap: "wrap", gap: 5 }}>
                        {ledgerSuggestions.merchants.map((merchant) => (
                          <Button
                            key={merchant}
                            variant="outline"
                            size="xs"
                            onClick={() => chooseMerchant(merchant)}
                          >
                            {merchant}
                          </Button>
                        ))}
                        {ledgerSuggestions.accountIds.map((accountId) => {
                          const account = accountRows.find((row) => row.id === accountId);
                          return account ? (
                            <Button
                              key={accountId}
                              variant="outline"
                              size="xs"
                              onClick={() => setConfirm({ ...confirm, accountId })}
                            >
                              {account.name}
                            </Button>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <div
                      className="ns-surface text-xs"
                      style={{ gridColumn: "1 / -1", padding: "9px 11px" }}
                    >
                      {confirm.entryType === "expense" ? "支出" : "收入"}{" "}
                      {formatMoney(Number(confirm.amount) || 0, accountCurrency(confirm.accountId))}
                      {confirm.accountId
                        ? ` · ${accountRows.find((row) => row.id === confirm.accountId)?.name ?? ""}`
                        : ""}
                      {confirm.category
                        ? ` · ${confirm.category}${confirm.subcategory ? ` / ${confirm.subcategory}` : ""}`
                        : ""}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="ns-quickadd-grid gap-2.5">
                <Field label="代號">
                  <input
                    className="ns-input"
                    value={confirm.ticker}
                    onChange={(e) => setConfirm({ ...confirm, ticker: e.target.value })}
                  />
                </Field>
                <Field label="帳戶">
                  <AccountFilter
                    accounts={accountRows.filter((a) => a.type === "investment")}
                    value={confirm.accountId}
                    onChange={(id) => setConfirm({ ...confirm, accountId: id })}
                    allowAll={false}
                    placeholder="未指定"
                    style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
                    positionerClassName="z-[90]"
                  />
                </Field>
                <Field label="股數">
                  <input
                    className="ns-input"
                    inputMode="decimal"
                    value={confirm.quantity}
                    onChange={(e) =>
                      setConfirm({ ...confirm, quantity: e.target.value.replace(/[^\d.]/g, "") })
                    }
                  />
                </Field>
                <Field label="價格">
                  <input
                    className="ns-input"
                    inputMode="decimal"
                    value={confirm.price}
                    onChange={(e) =>
                      setConfirm({ ...confirm, price: e.target.value.replace(/[^\d.]/g, "") })
                    }
                  />
                </Field>
              </div>
            )}
            {error ? (
              <div className="text-xs mt-2.5" style={{ color: "var(--ns-neg)" }}>
                {error}
              </div>
            ) : null}
            <div className="flex gap-2 mt-3.5">
              <Button
                variant="outline"
                style={{ flex: "0 0 auto" }}
                onClick={() => setConfirm(null)}
              >
                返回
              </Button>
              <Button
                className="flex-1"
                style={{ justifyContent: "center" }}
                onClick={submit}
                disabled={pending}
              >
                {pending ? "儲存中…" : "確認新增"}
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Type toggle — let the user pick 記帳 vs 投資 so the parser routes
            correctly instead of guessing (investment input rarely starts with
            a 買/賣 verb). Hidden once a confirm card is open. */}
        {!confirm ? (
          <div className="flex gap-2" style={{ justifyContent: "center" }}>
            {(
              [
                ["ledger", "記帳"],
                ["investment", "投資"],
              ] as const
            ).map(([value, label]) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className="text-xs ns-chip"
                  style={{
                    padding: "5px 16px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background: active ? "var(--ns-accent)" : "var(--ns-bg-card)",
                    color: active ? "var(--ns-accent-fg)" : "var(--ns-fg-muted)",
                    border: active ? "1px solid var(--ns-accent)" : "1px solid var(--ns-border)",
                    boxShadow: active ? "var(--ns-shadow)" : "none",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Device-side AI availability hint (only when not confirming). Lets the
            user see whether Apple Foundation Models is actually backing the parser. */}
        {!confirm && aiAvailable !== null ? (
          <div className="flex" style={{ justifyContent: "center" }}>
            <span
              className="text-micro items-center"
              title={
                aiAvailable
                  ? "裝置端 AI（Apple Foundation Models）可用，會在規則無法解析時自動接手"
                  : "此裝置無法使用 Apple Foundation Models（需 macOS/iOS 26+、Apple Silicon 並開啟 Apple Intelligence），改用規則解析"
              }
              style={{
                display: "inline-flex",
                gap: 5,
                padding: "2px 9px",
                borderRadius: 999,
                border: "1px solid var(--ns-border)",
                color: "var(--ns-fg-muted)",
                opacity: 0.85,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: aiAvailable ? "var(--ns-pos)" : "var(--ns-fg-muted)",
                }}
              />
              {aiAvailable ? "裝置端 AI · 可用" : "裝置端 AI · 不可用（規則解析）"}
            </span>
          </div>
        ) : null}

        {/* Real-time preview chips (P5) — shown while typing, hidden once confirm card opens.
            §6.3 remediation: also offers account chips when unmatched and badges
            guessed categories, so gaps get fixed before Enter. */}
        {!confirm && preview ? (
          <PreviewChips
            parsed={preview}
            accounts={accountRows}
            ledgerRows={ledgerRows}
            accountOverride={previewAccountOverride}
            onSelectAccount={setPreviewAccountOverride}
            categoryGuessCleared={categoryGuessCleared}
            onClearCategoryGuess={() => setCategoryGuessCleared(true)}
          />
        ) : null}

        {/* Example chips (§6.4) — on empty input, offer 2–3 tappable examples
            (記帳 / 投資) that fill the input box so first-time users see the
            expected shape. Hidden once the user types or a confirm card opens. */}
        {!confirm && !text.trim() ? (
          <div className="flex" style={{ flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {QUICK_ADD_EXAMPLES.map((ex) => (
              <button
                key={ex.text}
                type="button"
                onClick={() => {
                  setMode(ex.mode);
                  setText(ex.text);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="text-micro ns-chip"
                title="填入範例"
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: "var(--ns-bg-card)",
                  color: "var(--ns-fg-muted)",
                  border: "1px dashed var(--ns-border)",
                }}
              >
                {ex.text}
              </button>
            ))}
          </div>
        ) : null}

        {/* Input bar */}
        <div
          className="flex items-center gap-1"
          style={{
            background: "var(--ns-bg-card)",
            border: "1px solid var(--ns-border)",
            borderRadius: 999,
            padding: "6px 6px 6px 18px",
            boxShadow: "var(--ns-shadow-strong)",
          }}
        >
          <Plus
            size={16}
            weight="bold"
            className="shrink-0"
            style={{ color: "var(--ns-accent)" }}
          />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") parse();
            }}
            placeholder={
              mode === "investment"
                ? "投資 · 試試「2330.TW 5股 @1042」或「賣 AAPL 10 @180」"
                : "記帳 · 試試「午餐 @添飯 120 信用卡」或「+ 接案 5000 富邦」"
            }
            className="text-body flex-1 p-2"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--ns-fg)",
              fontFamily: "inherit",
            }}
          />
          <Badge variant="outline" className="rounded-full text-micro">
            <span className="mono">⌘N</span>
          </Badge>
          <Button
            style={{ padding: "8px 16px", borderRadius: 999 }}
            onClick={parse}
            disabled={!text.trim()}
          >
            解析 <ArrowRight size={13} weight="bold" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="text-xs font-medium"
        style={{ display: "block", marginBottom: 5, fontSize: 10.5, color: "var(--ns-fg-muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ── P5: Real-time preview chip bar ──────────────────────────────────────────

interface PreviewChip {
  label: string;
  value: string;
  color: string;
}

function PreviewChips({
  parsed,
  accounts,
  ledgerRows,
  accountOverride,
  onSelectAccount,
  categoryGuessCleared,
  onClearCategoryGuess,
}: {
  parsed: QuickAddParsed;
  accounts: { id: string; name: string }[];
  ledgerRows: LedgerTransaction[];
  accountOverride: string | null;
  onSelectAccount: (accountId: string) => void;
  categoryGuessCleared: boolean;
  onClearCategoryGuess: () => void;
}) {
  const chips: PreviewChip[] = [];
  // §6.3: the category chip. `parseQuickAdd` has no syntax for a user to type
  // a category by name — its only source is `resolveCategory()` (merchant map
  // / lexicon inference, see src/domain/quickAdd.ts:172-192 and :413-417), so
  // ANY non-empty preview-time category is a guess. Rendered separately (not
  // pushed into `chips`) because it's interactive: tapping dismisses it.
  let categoryChip: PreviewChip | null = null;

  if (parsed.kind === "ledger") {
    if (parsed.amount)
      chips.push({ label: "金額", value: formatNumber(parsed.amount), color: "var(--ns-pos)" });
    if (parsed.accountId) {
      const name = accounts.find((a) => a.id === parsed.accountId)?.name ?? parsed.accountId;
      chips.push({ label: "帳戶", value: name, color: "var(--ns-accent)" });
    } else if (accountOverride) {
      // User already picked one from the remediation chips below.
      const name = accounts.find((a) => a.id === accountOverride)?.name ?? accountOverride;
      chips.push({ label: "帳戶", value: name, color: "var(--ns-accent)" });
    }
    if (parsed.category && !categoryGuessCleared) {
      categoryChip = {
        label: "分類",
        value: parsed.category + (parsed.subcategory ? ` / ${parsed.subcategory}` : ""),
        color: "var(--ns-info)",
      };
    }
    if (parsed.date)
      chips.push({ label: "日期", value: parsed.date.slice(0, 10), color: "var(--ns-warn)" });
    // Show name and merchant as separate chips when they differ; when they're
    // the same string (merchant-only leftover) show a single 商家 chip, and
    // when no merchant was recognised show a single 名稱 chip.
    if (parsed.name && parsed.merchant && parsed.name !== parsed.merchant) {
      chips.push({ label: "名稱", value: parsed.name, color: "var(--ns-fg-muted)" });
      chips.push({ label: "商家", value: parsed.merchant, color: "var(--ns-fg-muted)" });
    } else if (parsed.merchant) {
      chips.push({ label: "商家", value: parsed.merchant, color: "var(--ns-fg-muted)" });
    } else if (parsed.name) {
      chips.push({ label: "名稱", value: parsed.name, color: "var(--ns-fg-muted)" });
    }
    if (parsed.entryType === "income")
      chips.push({ label: "類型", value: "收入", color: "var(--ns-pos)" });
  }
  if (parsed.kind === "investment") {
    if (parsed.ticker)
      chips.push({ label: "標的", value: parsed.ticker, color: "var(--ns-accent)" });
    if (parsed.quantity)
      chips.push({ label: "股數", value: String(parsed.quantity), color: "var(--ns-pos)" });
    if (parsed.price)
      chips.push({ label: "價格", value: formatPrice(parsed.price), color: "var(--ns-warn)" });
    if (parsed.accountId) {
      const name = accounts.find((a) => a.id === parsed.accountId)?.name ?? parsed.accountId;
      chips.push({ label: "帳戶", value: name, color: "var(--ns-accent)" });
    }
    chips.push({
      label: "操作",
      value: parsed.action === "buy" ? "買入" : "賣出",
      color: parsed.action === "buy" ? "var(--ns-pos)" : "var(--ns-neg)",
    });
  }

  // §6.3: amount parsed but no account matched (and none picked yet at the
  // preview stage) → offer up to 3 account chips, ranked by history the same
  // way the confirm card's own remediation does (buildLedgerSuggestions),
  // scoped to the guessed category when there is one.
  const needsAccount =
    parsed.kind === "ledger" && parsed.amount > 0 && !parsed.accountId && !accountOverride;
  const accountSuggestions = needsAccount
    ? buildLedgerSuggestions(ledgerRows, {
        category: parsed.category || undefined,
      }).accountIds.slice(0, 3)
    : [];

  if (chips.length === 0 && !categoryChip && accountSuggestions.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2"
      style={{
        flexWrap: "wrap",
        padding: "6px 14px",
        background: "var(--ns-bg-card)",
        borderRadius: 12,
        border: "1px solid var(--ns-border)",
        boxShadow: "var(--ns-shadow)",
      }}
    >
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="text-micro items-center"
          style={{
            display: "inline-flex",
            gap: 3,
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--ns-bg-hover)",
            color: "var(--ns-fg-muted)",
          }}
        >
          <span className="font-semibold" style={{ color: chip.color }}>
            {chip.label}
          </span>
          <span>{chip.value}</span>
        </span>
      ))}
      {categoryChip ? (
        <button
          type="button"
          onClick={() => onClearCategoryGuess()}
          className="text-micro items-center ns-chip"
          title="分類為系統猜測，點擊清除後可在確認畫面自行選擇"
          style={{
            display: "inline-flex",
            gap: 3,
            padding: "2px 8px",
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: "inherit",
            background: "var(--ns-bg-hover)",
            color: "var(--ns-fg-muted)",
            border: "1px dashed var(--ns-border)",
          }}
        >
          <span className="font-semibold" style={{ color: categoryChip.color }}>
            {categoryChip.label}
          </span>
          <span>{categoryChip.value}</span>
          <span style={{ opacity: 0.7 }}>建議</span>
        </button>
      ) : null}
      {accountSuggestions.map((accountId) => {
        const account = accounts.find((a) => a.id === accountId);
        if (!account) return null;
        return (
          <button
            key={accountId}
            type="button"
            onClick={() => onSelectAccount(accountId)}
            className="text-micro items-center ns-chip"
            title="選擇帳戶"
            style={{
              display: "inline-flex",
              gap: 3,
              padding: "2px 8px",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
              background: "var(--ns-bg-hover)",
              color: "var(--ns-fg-muted)",
              border: "1px dashed var(--ns-border)",
            }}
          >
            <span className="font-semibold" style={{ color: "var(--ns-accent)" }}>
              帳戶
            </span>
            <span>{account.name}</span>
          </button>
        );
      })}
    </div>
  );
}
