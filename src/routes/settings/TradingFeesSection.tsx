import { useState, useEffect } from "react";
import { Button } from "../../components/coss/button";
import { Card } from "../../components/coss/card";
import { DEFAULT_TW_FEES, type TradingFeeConfig } from "../../domain/tradingFees";
import { useFinanceData } from "../../data/hooks";
import type { SettingsTabProps } from "./shared";

/** Clamp a percentage string input to a sane numeric value (stored as a decimal). */
function pctToDecimal(pctStr: string): number {
  const v = parseFloat(pctStr);
  if (isNaN(v) || v < 0) return 0;
  return v / 100;
}

function decimalToPct(decimal: number): string {
  // Show up to 4 significant decimal places of the percentage value.
  return (decimal * 100).toPrecision(4).replace(/\.?0+$/, "");
}

export function SettingsTradingFees({ form, submit }: Pick<SettingsTabProps, "form" | "submit">) {
  const saved: TradingFeeConfig = form.tradingFees ?? DEFAULT_TW_FEES;

  const { accounts } = useFinanceData();
  const investmentAccounts = (accounts.data ?? []).filter(
    (a) => a.deletedAt === null && a.type === "investment",
  );

  // Local draft so edits batch before saving on blur/submit.
  const [draft, setDraft] = useState<TradingFeeConfig>(saved);

  // Re-sync when the parent form reloads (e.g. after a settings fetch).
  useEffect(() => {
    setDraft(form.tradingFees ?? DEFAULT_TW_FEES);
  }, [form.tradingFees]);

  async function save(next: TradingFeeConfig) {
    setDraft(next);
    await submit({ ...form, tradingFees: next });
  }

  async function toggleEnabled() {
    await save({ ...draft, enabled: !draft.enabled });
  }

  async function resetDefaults() {
    await save(DEFAULT_TW_FEES);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Investments</div>
        <h2 style={{ fontFamily: "var(--ns-font-display)", fontSize: 24, margin: 0, fontWeight: 600 }}>
          交易成本（台股）
        </h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
          自動試算台股買賣的券商手續費與證券交易稅，並預填到新增交易的「手續費」欄位。
          預填僅適用於 .TW / .TWO 標的，且可隨時手動覆寫。
        </p>
      </div>

      <Card className="p-5 space-y-4">
        {/* Enable toggle */}
        <button
          type="button"
          onClick={toggleEnabled}
          className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition"
          style={{
            borderColor: draft.enabled ? "var(--ns-accent)" : "var(--ns-border)",
            background: draft.enabled ? "var(--ns-accent-soft)" : "transparent",
          }}
        >
          <div style={{
            width: 36, height: 20, borderRadius: 10, flexShrink: 0,
            background: draft.enabled ? "var(--ns-accent)" : "var(--ns-border)",
            position: "relative", transition: "background 0.15s",
          }}>
            <div style={{
              position: "absolute", top: 2, left: draft.enabled ? 18 : 2,
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              transition: "left 0.15s",
            }} />
          </div>
          <div>
            <div className="font-medium">
              自動試算手續費 — {draft.enabled ? "已開啟" : "已關閉"}
            </div>
            <div className="text-xs muted">
              開啟後，買賣台股時系統將依以下費率預填手續費（可手動修改）。
            </div>
          </div>
        </button>

        {/* Rate fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>
              券商手續費率（%）
            </label>
            <input
              className="ns-input"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              value={decimalToPct(draft.brokerFeeRate)}
              onChange={(e) => setDraft({ ...draft, brokerFeeRate: pctToDecimal(e.target.value) })}
              onBlur={() => save(draft)}
              style={{ fontFamily: "var(--ns-font-mono)", textAlign: "right" }}
            />
            <div className="text-xs muted mt-1">台灣法定上限 0.1425%</div>
          </div>

          <div>
            <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>
              最低手續費（NTD）
            </label>
            <input
              className="ns-input"
              type="number"
              step="1"
              min="0"
              value={draft.minBrokerFee}
              onChange={(e) => setDraft({ ...draft, minBrokerFee: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              onBlur={() => save(draft)}
              style={{ fontFamily: "var(--ns-font-mono)", textAlign: "right" }}
            />
            <div className="text-xs muted mt-1">多數券商為 NT$20</div>
          </div>

          <div>
            <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>
              證交稅率 — 股票賣出（%）
            </label>
            <input
              className="ns-input"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={decimalToPct(draft.sellTaxRateStock)}
              onChange={(e) => setDraft({ ...draft, sellTaxRateStock: pctToDecimal(e.target.value) })}
              onBlur={() => save(draft)}
              style={{ fontFamily: "var(--ns-font-mono)", textAlign: "right" }}
            />
            <div className="text-xs muted mt-1">法定費率 0.3%（僅賣出課徵）</div>
          </div>

          <div>
            <label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>
              證交稅率 — ETF 賣出（%）
            </label>
            <input
              className="ns-input"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={decimalToPct(draft.sellTaxRateEtf)}
              onChange={(e) => setDraft({ ...draft, sellTaxRateEtf: pctToDecimal(e.target.value) })}
              onBlur={() => save(draft)}
              style={{ fontFamily: "var(--ns-font-mono)", textAlign: "right" }}
            />
            <div className="text-xs muted mt-1">法定費率 0.1%（僅賣出課徵）</div>
          </div>
        </div>

        {/* Reset */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--ns-border)" }}>
          <p className="text-xs muted mb-0">
            以上為台灣法定預設費率（v1）。日沖減稅與期貨/選擇權不在此範圍。
          </p>
          <Button variant="ghost" size="sm" onClick={resetDefaults}>
            重設為預設值
          </Button>
        </div>
      </Card>

      {/* Per-account brokerage discount (折扣) */}
      <Card className="p-5 space-y-4">
        <div>
          <h3 style={{ fontFamily: "var(--ns-font-display)", fontSize: 16, margin: 0, fontWeight: 600 }}>
            各券商手續費設定
          </h3>
          <p className="text-xs muted mt-1 mb-0">
            若該券商（如美股）不收手續費，請取消勾選。若有折數（如 6 折），請於勾選後輸入。
          </p>
        </div>

        {investmentAccounts.length > 0 ? (
          <div className="space-y-3">
            {investmentAccounts.map((a) => {
              const current = draft.accountDiscounts?.[a.id];
              const isEnabled = current !== 0; // 0 means free (disabled)
              
              return (
                <div key={a.id} className="flex flex-col gap-3 p-3 rounded-md border" style={{ borderColor: "var(--ns-border)", background: isEnabled ? "transparent" : "var(--ns-surface-hover)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{a.name}</span>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = { ...(draft.accountDiscounts ?? {}) };
                          if (checked) {
                            delete next[a.id]; // Restore to default full fee
                          } else {
                            next[a.id] = 0; // 0 multiplier = free
                          }
                          setDraft({ ...draft, accountDiscounts: next });
                          save({ ...draft, accountDiscounts: next });
                        }}
                        style={{ accentColor: "var(--ns-accent)", width: 16, height: 16 }}
                      />
                      套用手續費
                    </label>
                  </div>
                  
                  {isEnabled && (
                    <div className="flex items-center justify-between gap-3 pl-6">
                      <span className="text-xs muted">手續費折扣（留空為無折扣）</span>
                      <div className="flex items-center gap-2">
                        <input
                          className="ns-input"
                          type="number"
                          step="0.1"
                          min="0"
                          max="10"
                          style={{ width: 80, fontFamily: "var(--ns-font-mono)", textAlign: "right", height: 28, fontSize: 13 }}
                          placeholder="無"
                          value={current == null || current === 0 ? "" : (current * 10).toString()}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next = { ...(draft.accountDiscounts ?? {}) };
                            if (raw === "") delete next[a.id];
                            else next[a.id] = Math.min(1, Math.max(0, (parseFloat(raw) || 0) / 10));
                            setDraft({ ...draft, accountDiscounts: next });
                          }}
                          onBlur={() => save(draft)}
                        />
                        <span className="text-xs muted">折</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs muted mb-0">前往「帳戶」新增券商帳戶。</p>
        )}
      </Card>
    </div>
  );
}
