import { Plus, X, ArrowRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { buildLedgerSuggestions, buildMerchantCategoryMap, formatMoney, nowAsDatetimeLocal, parseQuickAdd, type QuickAddParsed } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import { useToast } from "./Toast";

type LedgerConfirm = { kind: "ledger"; entryType: "expense" | "income"; amount: string; accountId: string; name: string; merchant: string; category: string; subcategory: string };
type InvestmentConfirm = { kind: "investment"; action: "buy" | "sell"; ticker: string; quantity: string; price: string; accountId: string };
type Confirm = LedgerConfirm | InvestmentConfirm;

function toConfirm(parsed: QuickAddParsed, fallbackText: string): Confirm {
  if (parsed.kind === "investment") {
    return { kind: "investment", action: parsed.action, ticker: parsed.ticker, quantity: parsed.quantity ? String(parsed.quantity) : "", price: parsed.price ? String(parsed.price) : "", accountId: parsed.accountId ?? "" };
  }
  if (parsed.kind === "ledger") {
    // The parser yields one token; seed it into the name (the description) and
    // leave merchant for the user to confirm/fill — they are separate records.
    return { kind: "ledger", entryType: parsed.entryType, amount: String(parsed.amount), accountId: parsed.accountId ?? "", name: parsed.merchant, merchant: parsed.merchant, category: parsed.category, subcategory: parsed.subcategory };
  }
  // unknown → prefill an expense with the raw text as the name for manual completion
  return { kind: "ledger", entryType: "expense", amount: "", accountId: "", name: fallbackText.trim(), merchant: "", category: "", subcategory: "" };
}

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const timezone = useUiPreferences((state) => state.timezone);
  const { accounts, ledger, settings } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const primaryCurrency = settings.data?.primaryCurrency ?? "TWD";
  const merchantCat = useMemo(() => buildMerchantCategoryMap(ledgerRows), [ledgerRows]);
  const categoryGroups = settings.data?.categories ?? [];

  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const createLedger = useRepositoryMutation(
    (repository, input: import("../data/repositories").LedgerDraft) => repository.createLedgerTransaction(input),
    ["ledger", "accounts"],
  );
  const createInvestment = useRepositoryMutation(
    (repository, input: import("../data/repositories").InvestmentDraft) => repository.createInvestmentRecord(input),
    ["investments", "assets", "accounts", "ledger"],
  );

  useEffect(() => {
    if (open) {
      setText("");
      setConfirm(null);
      setError("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const ledgerSuggestions = useMemo(
    () => confirm?.kind === "ledger"
      ? buildLedgerSuggestions(ledgerRows, { category: confirm.category || undefined, merchant: confirm.merchant || undefined })
      : { merchants: [], accountIds: [] },
    [confirm, ledgerRows],
  );
  const merchantOptions = useMemo(
    () => [...new Set([...ledgerSuggestions.merchants, ...merchantCat.keys()])].slice(0, 20),
    [ledgerSuggestions.merchants, merchantCat],
  );

  if (!open) return null;

  function parse() {
    if (!text.trim()) return;
    const parsed = parseQuickAdd(text, { accounts: accountRows, merchantCategory: merchantCat });
    setConfirm(toConfirm(parsed, text));
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
        if (!amount || amount <= 0) { setError("請輸入有效金額。"); return; }
        if (!confirm.accountId) { setError("請選擇帳戶。"); return; }
        await createLedger.mutateAsync({
          accountId: confirm.accountId,
          date: nowAsDatetimeLocal(timezone),
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
      } else {
        const quantity = Number(confirm.quantity);
        const price = Number(confirm.price);
        if (!confirm.ticker.trim()) { setError("請輸入標的代號。"); return; }
        if (!quantity || quantity <= 0) { setError("請輸入有效股數。"); return; }
        await createInvestment.mutateAsync({
          ticker: confirm.ticker.trim().toUpperCase(),
          name: confirm.ticker.trim().toUpperCase(),
          currency: confirm.accountId ? accountCurrency(confirm.accountId) : primaryCurrency,
          linkedAccountId: confirm.accountId || null,
          date: nowAsDatetimeLocal(timezone),
          action: confirm.action,
          price: price || 0,
          quantity,
          fee: 0,
          note: "",
        });
        toast.success(confirm.action === "buy" ? "已記錄買入" : "已記錄賣出");
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗。");
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
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_180ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ position: "relative", width: "min(620px, 94vw)", marginBottom: 28, display: "flex", flexDirection: "column", gap: 10 }}
      >
        {/* Confirm card (shown after parsing) */}
        {confirm ? (
          <div className="ns-card" style={{ padding: 16, boxShadow: "var(--ns-shadow-xl)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="ns-eyebrow">確認 · {confirm.kind === "investment" ? (confirm.action === "buy" ? "買入" : "賣出") : confirm.entryType === "expense" ? "支出" : "收入"}</span>
              <button className="ns-btn ghost icon" onClick={() => setConfirm(null)}><X size={14} /></button>
            </div>
            {confirm.kind === "ledger" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="金額"><input
                  className="ns-input"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={amountFocused ? confirm.amount : (parseFloat(confirm.amount) ? parseFloat(confirm.amount).toLocaleString("zh-TW") : confirm.amount)}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  onChange={(e) => setConfirm({ ...confirm, amount: e.target.value.replace(/[^\d.]/g, "") })}
                /></Field>
                <Field label="分類">
                  <input className="ns-input" value={confirm.category} onChange={(e) => setConfirm({ ...confirm, category: e.target.value })} placeholder="選填" />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                    {categoryGroups.slice(0, 8).map((category) => (
                      <button key={category.name} className="ns-pill" onClick={() => setConfirm({ ...confirm, category: category.name })}>
                        {category.iconName || "•"} {category.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="名稱">
                  <input className="ns-input" value={confirm.name} onChange={(e) => setConfirm({ ...confirm, name: e.target.value })} placeholder="交易名稱" />
                </Field>
                <Field label="商家">
                  <input className="ns-input" list="quick-add-merchants" value={confirm.merchant} onChange={(e) => chooseMerchant(e.target.value)} placeholder="選填" />
                  <datalist id="quick-add-merchants">{merchantOptions.map((merchant) => <option key={merchant} value={merchant} />)}</datalist>
                </Field>
                <Field label="帳戶">
                  <select className="ns-input" style={{ appearance: "none" }} value={confirm.accountId} onChange={(e) => setConfirm({ ...confirm, accountId: e.target.value })}><option value="">選擇帳戶</option>{accountRows.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                </Field>
                <div style={{ gridColumn: "1 / -1", fontSize: 12 }}>
                  {(ledgerSuggestions.merchants.length > 0 || ledgerSuggestions.accountIds.length > 0) ? (
                    <div className="muted" style={{ marginBottom: 5 }}>依過往紀錄建議</div>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ledgerSuggestions.merchants.map((merchant) => <button key={merchant} className="ns-pill" onClick={() => chooseMerchant(merchant)}>{merchant}</button>)}
                    {ledgerSuggestions.accountIds.map((accountId) => {
                      const account = accountRows.find((row) => row.id === accountId);
                      return account ? <button key={accountId} className="ns-pill" onClick={() => setConfirm({ ...confirm, accountId })}>{account.name}</button> : null;
                    })}
                  </div>
                </div>
                <div className="ns-surface" style={{ gridColumn: "1 / -1", padding: "9px 11px", fontSize: 12.5 }}>
                  {confirm.entryType === "expense" ? "支出" : "收入"} {formatMoney(Number(confirm.amount) || 0, accountCurrency(confirm.accountId))}
                  {confirm.accountId ? ` · ${accountRows.find((row) => row.id === confirm.accountId)?.name ?? ""}` : ""}
                  {confirm.category ? ` · ${confirm.category}${confirm.subcategory ? ` / ${confirm.subcategory}` : ""}` : ""}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="代號"><input className="ns-input" value={confirm.ticker} onChange={(e) => setConfirm({ ...confirm, ticker: e.target.value })} /></Field>
                <Field label="帳戶"><select className="ns-input" style={{ appearance: "none" }} value={confirm.accountId} onChange={(e) => setConfirm({ ...confirm, accountId: e.target.value })}><option value="">未指定</option>{accountRows.filter((a) => a.type === "investment").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
                <Field label="股數"><input className="ns-input" inputMode="decimal" value={confirm.quantity} onChange={(e) => setConfirm({ ...confirm, quantity: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
                <Field label="價格"><input className="ns-input" inputMode="decimal" value={confirm.price} onChange={(e) => setConfirm({ ...confirm, price: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
              </div>
            )}
            {error ? <div style={{ color: "var(--ns-neg)", fontSize: 12.5, marginTop: 10 }}>{error}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="ns-btn" style={{ flex: "0 0 auto" }} onClick={() => setConfirm(null)}>返回</button>
              <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={submit} disabled={pending}>{pending ? "儲存中…" : "確認新增"}</button>
            </div>
          </div>
        ) : null}

        {/* Input bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--ns-bg-card)", border: "1px solid var(--ns-border)", borderRadius: 999, padding: "6px 6px 6px 18px", boxShadow: "var(--ns-shadow-xl)" }}>
          <Plus size={16} weight="bold" style={{ color: "var(--ns-accent)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") parse(); }}
            placeholder="快速記帳 · 試試「拿鐵 120 信用卡」或「買 2330.TW 5股 @1042」"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ns-fg)", fontFamily: "inherit", fontSize: 13.5, padding: "8px" }}
          />
          <span className="ns-pill" style={{ fontSize: 10.5 }}><span className="mono">⌘N</span></span>
          <button className="ns-btn primary" style={{ padding: "8px 16px", borderRadius: 999 }} onClick={parse} disabled={!text.trim()}>
            解析 <ArrowRight size={13} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="ns-eyebrow" style={{ display: "block", marginBottom: 5, fontSize: 10.5 }}>{label}</label>
      {children}
    </div>
  );
}
