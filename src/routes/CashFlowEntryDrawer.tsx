import {
  ArrowsLeftRight,
  Calendar,
  PencilSimple,
  Plus,
  Receipt,
  TrendDown,
  TrendUp,
  X,
  ForkKnife,
  Car,
  GameController,
  MonitorPlay,
  House,
  Pill,
  GraduationCap,
  DotsThree,
  Briefcase,
  Money,
  Wrench,
  Gift,
  Tag,
} from "@phosphor-icons/react";
import { useEffect } from "react";
import type { LedgerDraft, TransferDraft } from "../data/repositories";
import { formatNumber } from "../domain";

type CashDrawerMode = "income" | "expense" | "transfer" | "receivable" | "payable";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "餐飲": <ForkKnife size={16} />,
  "食物": <ForkKnife size={16} />,
  "交通": <Car size={16} />,
  "娛樂": <GameController size={16} />,
  "訂閱": <MonitorPlay size={16} />,
  "居住": <House size={16} />,
  "居家": <House size={16} />,
  "醫療": <Pill size={16} />,
  "教育": <GraduationCap size={16} />,
  "薪資": <Briefcase size={16} />,
  "獎金": <Gift size={16} />,
  "投資": <TrendUp size={16} />,
  "兼職": <Wrench size={16} />,
  "租金": <House size={16} />,
};

export function CashFlowEntryDrawer({
  open,
  mode,
  onClose,
  onModeChange,
  editing,
  drawerRecurringFreq,
  setDrawerRecurringFreq,
  ledgerForm,
  setLedgerForm,
  amountExpression,
  setAmountExpression,
  transferForm,
  setTransferForm,
  merchantSuggestions,
  categories,
  subcategories,
  accountRows,
  onAccountSelected,
  onSubmitSingle,
  onSubmitTransfer,
  message,
}: {
  open: boolean;
  mode: CashDrawerMode;
  onClose: () => void;
  onModeChange: (mode: CashDrawerMode) => void;
  editing: boolean;
  drawerRecurringFreq: "none" | "daily" | "weekly" | "monthly" | "yearly";
  setDrawerRecurringFreq: (freq: "none" | "daily" | "weekly" | "monthly" | "yearly") => void;
  ledgerForm: LedgerDraft;
  setLedgerForm: (value: LedgerDraft) => void;
  amountExpression: string;
  setAmountExpression: (value: string) => void;
  transferForm: TransferDraft;
  setTransferForm: (value: TransferDraft) => void;
  merchantSuggestions: string[];
  categories: string[];
  subcategories: string[];
  accountRows: Array<{ id: string; name: string; currency: string }>;
  onAccountSelected: (id: string) => void;
  onSubmitSingle: () => void;
  onSubmitTransfer: () => void;
  message: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const modeColor = {
    expense: "var(--ns-neg)",
    income: "var(--ns-pos)",
    transfer: "var(--ns-accent)",
    receivable: "var(--ns-warn)",
    payable: "var(--ns-chart-4)",
  }[mode];

  const modeSign = {
    expense: "-",
    income: "+",
    transfer: "",
    receivable: "+",
    payable: "-",
  }[mode];

  const tabs: { value: CashDrawerMode; label: string }[] = [
    { value: "expense", label: "支出" },
    { value: "income", label: "收入" },
    { value: "transfer", label: "轉帳" },
    { value: "receivable", label: "應收帳款" },
    { value: "payable", label: "應付帳款" },
  ];

  const displayCategories = categories;

  return (
    <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose} style={{ fontFamily: "var(--ns-font-sans)" }}>
      <div
        className="absolute inset-y-0 right-0 flex h-full w-full sm:w-[500px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex h-full w-full flex-col border-l shadow-2xl animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
          style={{ background: "var(--ns-panel-bg, var(--ns-bg))", borderColor: "var(--ns-panel-border, var(--ns-border))" }}
        >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: modeColor, color: "var(--ns-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={20} weight="bold" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{editing ? "編輯交易" : "新增交易"}</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--ns-fg-muted)", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: "flex", padding: "0 24px", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onModeChange(tab.value)}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: tab.value === mode ? `1px solid ${modeColor}` : "1px solid var(--ns-border)",
                background: tab.value === mode ? "transparent" : "transparent",
                color: tab.value === mode ? modeColor : "var(--ns-fg-muted)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.2s",
                boxShadow: tab.value === mode ? `0 0 0 1px ${modeColor} inset` : "none"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", padding: "24px", flex: 1 }}>
          {mode === "transfer" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>轉帳金額 · {transferForm.sourceCurrency} <span style={{ color: modeColor }}>*</span></div>
                <div style={{ display: "flex", alignItems: "center", background: "var(--ns-surface)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--ns-border)" }}>
                  <div style={{ fontSize: 24, fontWeight: 600, color: modeColor, marginRight: 4 }}>NT$</div>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={transferForm.sourceAmount || ""} 
                    onChange={e => setTransferForm({ ...transferForm, sourceAmount: Number(e.target.value), destinationAmount: Number(e.target.value) })}
                    placeholder="0"
                    style={{ background: "transparent", border: "none", outline: "none", fontSize: 24, fontWeight: 600, color: "var(--ns-fg)", width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>日期</div>
                  <input type="datetime-local" value={transferForm.date.slice(0, 16)} onChange={e => setTransferForm({ ...transferForm, date: e.target.value })} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>幣別</div>
                  <input type="text" value={transferForm.sourceCurrency} onChange={e => setTransferForm({ ...transferForm, sourceCurrency: e.target.value.toUpperCase(), destinationCurrency: e.target.value.toUpperCase() })} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>從 (轉出)</div>
                  <select value={transferForm.sourceAccountId} onChange={e => setTransferForm({ ...transferForm, sourceAccountId: e.target.value })} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>至 (轉入)</div>
                  <select value={transferForm.destinationAccountId} onChange={e => setTransferForm({ ...transferForm, destinationAccountId: e.target.value })} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>外加手續費 (選填)</div>
                  <input type="number" value={transferForm.feeAmount || ""} onChange={e => setTransferForm({ ...transferForm, feeAmount: Number(e.target.value) })} placeholder="0" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>備註</div>
                  <input type="text" value={transferForm.note} onChange={e => setTransferForm({ ...transferForm, note: e.target.value })} placeholder="選填" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>
                  {mode === "income" ? "收入金額" : mode === "receivable" ? "應收金額" : mode === "payable" ? "應付金額" : "支出金額"} · {ledgerForm.currency} <span style={{ color: modeColor }}>*</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", background: "var(--ns-surface)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--ns-border)" }}>
                  <div style={{ fontSize: 24, fontWeight: 600, color: modeColor, marginRight: 4, whiteSpace: "nowrap" }}>{modeSign}NT$</div>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={amountExpression} 
                    onChange={e => setAmountExpression(e.target.value)}
                    placeholder="0"
                    style={{ background: "transparent", border: "none", outline: "none", fontSize: 24, fontWeight: 600, color: "var(--ns-fg)", width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>日期</div>
                  <input type="datetime-local" value={ledgerForm.date.slice(0, 16)} onChange={e => setLedgerForm({ ...ledgerForm, date: e.target.value })} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>{mode === "income" || mode === "receivable" ? "收入帳戶" : "支出帳戶"}</div>
                  <select value={ledgerForm.accountId} onChange={e => onAccountSelected(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }}>
                    <option value="">選擇帳戶</option>
                    {accountRows.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              </div>

              {(mode === "receivable" || mode === "payable") && (
                <div style={{ padding: "12px 16px", background: "var(--ns-surface-strong)", borderRadius: 10, fontSize: 13, color: "var(--ns-fg-dim)", border: "1px solid var(--ns-border)" }}>
                  {mode === "receivable" ? "應收帳款：對方欠你的錢，尚未入帳。可追蹤收款進度與到期日。" : "應付帳款：你欠對方的錢，尚未付款。可追蹤付款截止日與狀態。"}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {mode === "receivable" || mode === "payable" ? (
                  <div style={{ gridColumn: "span 2" }}>
                    <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>對象 ({mode === "receivable" ? "欠款方" : "收款方"}) <span style={{ color: modeColor }}>*</span></div>
                    <input type="text" value={ledgerForm.merchant} onChange={e => setLedgerForm({ ...ledgerForm, merchant: e.target.value, name: e.target.value })} placeholder={mode === "receivable" ? "例：小明、ABC 公司" : "例：房東、供應商"} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                  </div>
                ) : (
                  <>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>名稱</div>
                      <input type="text" value={ledgerForm.name} onChange={e => setLedgerForm({ ...ledgerForm, name: e.target.value })} placeholder="例如：晚餐" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>商家</div>
                      <input type="text" value={ledgerForm.merchant} onChange={e => setLedgerForm({ ...ledgerForm, merchant: e.target.value })} placeholder="例如：UBER" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none", listStyle: "merchant-list" }} list="merchant-list" />
                      <datalist id="merchant-list">{merchantSuggestions.map(m => <option key={m} value={m} />)}</datalist>
                    </div>
                  </>
                )}
              </div>

              {mode === "receivable" || mode === "payable" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>{mode === "receivable" ? "預計收款日" : "付款截止日"}</div>
                    <input type="date" value="" readOnly placeholder="yyyy/mm/dd" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg-muted)", outline: "none" }} title="Not implemented in backend yet" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>狀態</div>
                    <select value="pending" disabled style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none", appearance: "none" }}>
                      <option value="pending">待處理</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>分類</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {displayCategories.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setLedgerForm({ ...ledgerForm, category: cat, subcategory: "" })}
                        style={{ 
                          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", 
                          borderRadius: 20, 
                          background: ledgerForm.category === cat ? modeColor : "transparent",
                          color: ledgerForm.category === cat ? "var(--ns-bg)" : "var(--ns-fg)",
                          border: ledgerForm.category === cat ? "1px solid transparent" : "1px solid var(--ns-border)",
                          fontSize: 13, cursor: "pointer", transition: "all 0.2s"
                        }}
                      >
                        {CATEGORY_ICONS[cat] || <Tag size={16} />} {cat}
                      </button>
                    ))}
                    <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 20, background: "transparent", color: "var(--ns-fg)", border: "1px solid var(--ns-border)", fontSize: 13, cursor: "pointer" }}>
                      <DotsThree size={16} /> 其他
                    </button>
                  </div>
                  {ledgerForm.category && (
                    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", borderLeft: `2px solid ${modeColor}`, paddingLeft: 8 }}>
                      {subcategories.map(sub => (
                        <button 
                          key={sub}
                          onClick={() => setLedgerForm({ ...ledgerForm, subcategory: sub })}
                          style={{ 
                            padding: "6px 12px", borderRadius: 16, 
                            background: ledgerForm.subcategory === sub ? "var(--ns-surface-strong)" : "transparent",
                            color: ledgerForm.subcategory === sub ? "var(--ns-fg)" : "var(--ns-fg-dim)",
                            border: "none", fontSize: 13, cursor: "pointer", transition: "all 0.2s"
                          }}
                        >
                          {sub}
                        </button>
                      ))}
                      {!subcategories.length && <div style={{ fontSize: 13, color: "var(--ns-fg-dim)", padding: "6px" }}>無子分類</div>}
                    </div>
                  )}
                </div>
              )}

              {mode !== "receivable" && mode !== "payable" && (
                <div>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>週期記帳</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { value: "none", label: "不重複" },
                      { value: "daily", label: "每日" },
                      { value: "weekly", label: "每週" },
                      { value: "monthly", label: "每月" },
                      { value: "yearly", label: "每年" },
                    ].map(freq => (
                      <button
                        key={freq.value}
                        onClick={() => setDrawerRecurringFreq(freq.value as any)}
                        style={{
                          padding: "8px 16px", borderRadius: 20,
                          background: drawerRecurringFreq === freq.value ? "var(--ns-fg)" : "transparent",
                          color: drawerRecurringFreq === freq.value ? "var(--ns-bg)" : "var(--ns-fg-dim)",
                          border: drawerRecurringFreq === freq.value ? "1px solid transparent" : "1px solid var(--ns-border)",
                          fontSize: 13, cursor: "pointer", transition: "all 0.2s"
                        }}
                      >
                        {freq.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {mode === "expense" ? (
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>外加手續費 (選填)</div>
                    <input type="number" value={ledgerForm.feeAmount || ""} onChange={e => setLedgerForm({ ...ledgerForm, feeAmount: Number(e.target.value) })} placeholder="0" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                  </div>
                ) : null}
                <div style={{ gridColumn: mode === "expense" ? "auto" : "span 2" }}>
                  <div style={{ fontSize: 13, color: "var(--ns-fg-muted)", marginBottom: 8 }}>備註</div>
                  <input type="text" value={ledgerForm.note} onChange={e => setLedgerForm({ ...ledgerForm, note: e.target.value })} placeholder="選填" style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "1px solid var(--ns-border)", background: "var(--ns-surface)", color: "var(--ns-fg)", outline: "none" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px 24px", display: "flex", gap: 16, alignItems: "center" }}>
          <button 
            onClick={onClose} 
            style={{ padding: "14px 0", background: "transparent", border: "none", color: "var(--ns-fg-muted)", fontSize: 15, cursor: "pointer", flexShrink: 0, width: 60 }}
          >
            取消
          </button>
          <button 
            onClick={mode === "transfer" ? onSubmitTransfer : onSubmitSingle}
            style={{ 
              flex: 1, padding: "14px 24px", borderRadius: 12, border: "none", 
              background: modeColor, color: "var(--ns-bg)", 
              fontSize: 15, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
          >
            ✓ {mode === "transfer" ? "儲存轉帳" : mode === "receivable" ? "記錄應收帳款" : mode === "payable" ? "記錄應付帳款" : "儲存交易"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
