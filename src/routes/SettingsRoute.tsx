import { ArrowsClockwise, ArrowsLeftRight, CheckCircle, Clock, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, Plus, Storefront, Tag, Trash, UploadSimple, UsersThree, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Field, TextInput } from "../components/Field";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository, type RepositorySnapshot } from "../data/repositories";
import { COMMON_TIMEZONES, isValidTimezone, formatDateTimeInTimezone } from "../domain";
import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../domain";
import { useRefreshFxRates } from "../features/market-data/useMarketRefresh";
import { useUiPreferences, type ClockMode, type NameLocalePreference, type ThemeMode } from "../state/uiPreferences";
import { Link } from "@tanstack/react-router";
import { Target } from "@phosphor-icons/react";

const emptySettings: AppSettings = {
  primaryCurrency: "TWD",
  categories: [],
  merchants: [],
  exchangeRates: [],
};

export function SettingsRoute() {
  const { settings, dailyFxRates } = useFinanceData();
  const [form, setForm] = useState(emptySettings);
  const [merchantDraft, setMerchantDraft] = useState("");
  const [showAllRates, setShowAllRates] = useState(false);
  const [showAllMerchants, setShowAllMerchants] = useState(false);
  const seededRef = useRef(false);
  const updateSettings = useRepositoryMutation((repository, input: AppSettings) => repository.updateAppSettings(input), ["settings"]);
  const refreshFxRates = useRefreshFxRates();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string>("");
  const toast = useToast();

  async function exportBackup() {
    const progressId = toast.info("正在準備備份…", { description: "讀取資料庫快照中。", durationMs: 0 });
    try {
      setSnapshotBusy(true);
      const repository = await getFinanceRepository();
      const snapshot = await repository.exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `northstar-backup-${stamp}.json`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.dismiss(progressId);
      toast.success("已匯出備份", {
        description: `${filename}（${formatBytes(blob.size)}）已下載到「下載」資料夾。`,
      });
    } catch (error) {
      toast.dismiss(progressId);
      toast.error("備份失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
        detail: formatErrorDetail(error),
      });
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function importBackup(file: File) {
    if (!window.confirm("匯入會覆蓋目前所有資料，確定要繼續嗎？")) return;
    setImportStatus("");
    const progressId = toast.info("正在匯入備份…", {
      description: "讀取檔案中。",
      durationMs: 0,
    });
    try {
      setSnapshotBusy(true);
      setImportStatus("讀取備份檔…");
      const text = await file.text();
      setImportStatus("解析 JSON…");
      const parsed = JSON.parse(text) as RepositorySnapshot;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.accounts)) {
        throw new Error("檔案格式不正確：找不到 accounts 陣列。");
      }
      const summary = {
        accounts: parsed.accounts.length,
        ledger: parsed.ledgerTransactions?.length ?? 0,
        assets: parsed.portfolioAssets?.length ?? 0,
        records: parsed.investmentRecords?.length ?? 0,
        prices: parsed.dailyPrices?.length ?? 0,
        fx: parsed.dailyFxRates?.length ?? 0,
        recurring: parsed.recurringTransactions?.length ?? 0,
        quotes: parsed.marketQuotes?.length ?? 0,
        goals: parsed.financialGoals?.length ?? 0,
      };
      console.log("[import] parsed backup", summary);
      setImportStatus(
        `寫入資料庫中…（${summary.accounts} 帳戶、${summary.assets} 持倉、${summary.ledger} 筆記帳、${summary.prices} 筆股價）`,
      );
      const repository = await getFinanceRepository();
      await repository.importSnapshot(parsed);
      await queryClient.invalidateQueries();
      seededRef.current = false;
      setImportStatus("");
      toast.dismiss(progressId);
      toast.success("已匯入備份", {
        description: `${summary.accounts} 帳戶、${summary.assets} 持倉、${summary.ledger} 筆記帳、${summary.prices} 筆股價、${summary.fx} 筆匯率。`,
      });
    } catch (error) {
      console.error("[import] failed", error);
      const detail = formatErrorDetail(error, { fileName: file.name, fileSize: file.size });
      toast.dismiss(progressId);
      toast.error("匯入失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。請複製詳細內容回報。",
        detail,
      });
      setImportStatus(error instanceof Error ? error.message : "匯入失敗");
    } finally {
      setSnapshotBusy(false);
    }
  }

  useEffect(() => {
    if (!settings.data) return;
    if (seededRef.current) return;
    setForm(normalizeForm(settings.data));
    seededRef.current = true;
  }, [settings.data]);

  const fxStats = useMemo(() => buildFxStats(dailyFxRates.data ?? []), [dailyFxRates.data]);
  const visibleRates = (showAllRates ? form.exchangeRates : form.exchangeRates.slice(0, 4))
    .map((rate, sourceIndex) => ({ rate, sourceIndex }));
  const visibleMerchants = showAllMerchants ? form.merchants : form.merchants.slice(0, 16);

  async function submit() {
    const next = normalizeForm(form);
    try {
      await updateSettings.mutateAsync(next);
      setForm(next);
      toast.success("設定已儲存");
    } catch (error) {
      toast.error("設定儲存失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
        detail: formatErrorDetail(error),
      });
    }
  }

  async function refreshAllFxRates() {
    const pairs = form.exchangeRates.map((rate) => ({ from: rate.from, to: rate.to || form.primaryCurrency }));
    if (pairs.length === 0) {
      toast.warning("沒有可更新的匯率", { description: "請先新增一組匯率配對。" });
      return;
    }
    try {
      const result = await refreshFxRates.mutateAsync({ pairs, range: "1y" });
      if (result.failed.length) {
        toast.warning("部分匯率更新失敗", {
          description: `已抓取 ${result.saved} 筆，但有 ${result.failed.length} 組失敗。`,
          detail: result.failed.join("\n"),
        });
      } else {
        toast.success(`已抓取 ${result.saved} 筆每日匯率`);
      }
    } catch (error) {
      toast.error("匯率更新失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
        detail: formatErrorDetail(error),
      });
    }
  }

  async function refreshSinglePair(rate: ExchangeRate, range: string) {
    try {
      const result = await refreshFxRates.mutateAsync({ pairs: [{ from: rate.from, to: rate.to || form.primaryCurrency }], range });
      if (result.failed.length) {
        toast.warning(`${rate.from}→${rate.to || form.primaryCurrency} 部分失敗`, { detail: result.failed.join("\n") });
      } else {
        toast.success(`${rate.from}→${rate.to || form.primaryCurrency} 已抓取 ${result.saved} 筆`);
      }
    } catch (error) {
      toast.error("匯率更新失敗", {
        description: error instanceof Error ? error.message : "未預期的錯誤。",
        detail: formatErrorDetail(error),
      });
    }
  }

  function addMerchant() {
    const next = merchantDraft.trim();
    if (!next) return;
    setForm((current) => ({ ...current, merchants: [...new Set([...current.merchants, next])] }));
    setMerchantDraft("");
  }

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Preferences</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>設定</h1>
        </div>
        <button className="ns-btn primary" onClick={submit} disabled={updateSettings.isPending}>
          <CheckCircle size={14} />儲存設定
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DisplayAndPrivacyCard />
          <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}><h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>幣別與匯率</h3></div>
          <div style={{ padding: 22 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
                <Field label="主要幣別">
                  <TextInput
                    value={form.primaryCurrency}
                    onChange={(event) => setForm({ ...form, primaryCurrency: event.target.value.toUpperCase() })}
                    placeholder="TWD"
                  />
                </Field>
                <PreferencePreview icon={<CurrencyCircleDollar size={20} />} title="總覽換算基準" text={`${form.primaryCurrency || "TWD"} 會用於淨值、帳戶與現金流摘要。`} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleRates.map(({ rate, sourceIndex }) => {
                  const pairKey = `${rate.from}|${rate.to || form.primaryCurrency}`;
                  return (
                    <RateRow
                      key={`${rate.from}-${rate.to}-${sourceIndex}`}
                      rate={rate}
                      primaryCurrency={form.primaryCurrency}
                      stats={fxStats.get(pairKey)}
                      onChange={(next) => setRate(sourceIndex, next, setForm)}
                      onDelete={() => setForm((current) => ({ ...current, exchangeRates: current.exchangeRates.filter((_, rowIndex) => rowIndex !== sourceIndex) }))}
                      onRefresh={(range) => refreshSinglePair(rate, range)}
                      busy={refreshFxRates.isPending}
                    />
                  );
                })}
                {form.exchangeRates.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllRates((value) => !value)}
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--ns-accent)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    {showAllRates ? "收合部分匯率" : `顯示全部匯率（${form.exchangeRates.length}）`}
                  </button>
                ) : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="ns-btn"
                    onClick={() => setForm((current) => ({
                      ...current,
                      exchangeRates: [...current.exchangeRates, { from: "USD", to: current.primaryCurrency || "TWD", rate: 1, updatedAt: new Date().toISOString() }],
                    }))}
                  >
                    <Plus size={14} />新增匯率
                  </button>
                  <button className="ns-btn" onClick={refreshAllFxRates} disabled={refreshFxRates.isPending || form.exchangeRates.length === 0}>
                    <ArrowsClockwise size={14} />{refreshFxRates.isPending ? "抓取中" : "全部更新（1Y）"}
                  </button>
                </div>
              </div>
            </div>
          </div></div>

          <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}><h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>分類與商家</h3></div>
          <div style={{ padding: 22 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.categories.map((group, index) => (
                <CategoryEditor
                  key={`${group.name}-${index}`}
                  group={group}
                  onChange={(next) => setCategory(index, next, setForm)}
                  onDelete={() => setForm((current) => ({ ...current, categories: current.categories.filter((_, rowIndex) => rowIndex !== index) }))}
                />
              ))}
              <button
                className="ns-btn"
                onClick={() => setForm((current) => ({ ...current, categories: [...current.categories, { name: "新分類", children: [] }] }))}
              >
                <Plus size={14} />新增分類
              </button>
            </div>
            <div style={{ marginTop: 20 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 10 }}>常用商家</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {visibleMerchants.map((merchant) => (
                <span key={merchant} style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", padding: "4px 10px", fontSize: 13 }}>
                  {merchant}
                  <button type="button" aria-label={`移除 ${merchant}`} style={{ display: "flex", lineHeight: 1 }} onClick={() => setForm((current) => ({ ...current, merchants: current.merchants.filter((item) => item !== merchant) }))}>
                    <X size={13} />
                  </button>
                </span>
              ))}
              </div>
              {form.merchants.length > 16 ? (
                <button
                  type="button"
                  onClick={() => setShowAllMerchants((value) => !value)}
                  style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--ns-accent)", background: "none", border: "none", cursor: "pointer" }}
                >
                  {showAllMerchants ? "收合商家清單" : `顯示全部商家（${form.merchants.length}）`}
                </button>
              ) : null}
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <TextInput value={merchantDraft} onChange={(event) => setMerchantDraft(event.target.value)} placeholder="新增常用商家" />
                <button className="ns-btn" onClick={addMerchant}><Plus size={14} />新增商家</button>
              </div>
            </div>
          </div></div>

          <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}><h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>退休目標</h3></div>
          <div style={{ padding: 22 }}>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
              FIRE 計畫已搬到「目標」分頁，支援年齡、報酬率、通膨與支出分項試算。
            </p>
            <Link to="/goals" className="ns-btn primary" style={{ display: "inline-flex" }}>
              <Target size={14} weight="fill" />前往目標
            </Link>
          </div></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}><h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>目前設定</h3></div>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
            <SummaryBlock icon={<Tag size={16} />} title="分類" items={form.categories.map((item) => `${item.name} · ${item.children.length} 個子分類`)} />
            <div style={{ height: 1, background: "var(--ns-border)" }} />
            <SummaryBlock icon={<Storefront size={16} />} title="商家" items={form.merchants} />
            <div style={{ height: 1, background: "var(--ns-border)" }} />
            <SummaryBlock icon={<ArrowsLeftRight size={16} />} title="匯率" items={form.exchangeRates.map((rate) => `${rate.from} → ${rate.to} = ${rate.rate.toFixed(2)}`)} />
          </div></div>
          <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}><h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>備份與安全</h3></div>
          <div style={{ padding: 22 }}>
            <div style={{ borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", padding: 12, fontSize: 13, background: "var(--ns-bg-hover)", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <StatusRow icon={<Key size={16} />} text="同步開啟前會建立救援金鑰。" />
              <StatusRow icon={<UsersThree size={16} />} text="家庭共享會使用獨立 Household Space Key。" />
              <StatusRow icon={<CheckCircle size={16} />} text="不登入也能完整使用本機帳本。" />
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
              匯出整份資料庫成 JSON 檔（含交易、持倉、匯率歷史、每日股價）。匯入會覆蓋現有資料，請先備份再執行。
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="ns-btn" onClick={exportBackup} disabled={snapshotBusy}>
                <DownloadSimple size={14} />匯出備份 JSON
              </button>
              <button className="ns-btn" onClick={() => fileInputRef.current?.click()} disabled={snapshotBusy}>
                <UploadSimple size={14} />匯入備份
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBackup(file);
                  event.target.value = "";
                }}
              />
            </div>
            {importStatus ? (
              <div style={{ marginTop: 12, borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", padding: "8px 12px", fontSize: 12, color: "var(--ns-fg-muted)", background: "var(--ns-bg-hover)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Clock size={13} />{importStatus}
                </span>
              </div>
            ) : null}
          </div></div>
        </div>
      </div>
    </div>
  );
}

function RateRow({
  rate,
  primaryCurrency,
  stats,
  onChange,
  onDelete,
  onRefresh,
  busy,
}: {
  rate: ExchangeRate;
  primaryCurrency: string;
  stats?: FxPairStats;
  onChange: (rate: ExchangeRate) => void;
  onDelete: () => void;
  onRefresh: (range: string) => void;
  busy: boolean;
}) {
  return (
    <div style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", alignItems: "end", gap: 8 }}>
        <Field label="來源">
          <TextInput value={rate.from} onChange={(event) => onChange({ ...rate, from: event.target.value.toUpperCase(), updatedAt: new Date().toISOString() })} />
        </Field>
        <Field label="換算成">
          <TextInput value={rate.to || primaryCurrency} onChange={(event) => onChange({ ...rate, to: event.target.value.toUpperCase(), updatedAt: new Date().toISOString() })} />
        </Field>
        <Field label="最新匯率">
          <TextInput
            type="number"
            step="0.01"
            value={rate.rate}
            onChange={(event) => onChange({ ...rate, rate: roundTo2(Number(event.target.value)), updatedAt: new Date().toISOString() })}
          />
        </Field>
        <button className="ns-btn ghost" style={{ padding: 7, color: "var(--ns-neg)" }} onClick={onDelete}><Trash size={14} /></button>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ns-fg-muted)" }}>
        <span>每日匯率：{stats ? `${stats.count} 筆（${stats.firstDate} ~ ${stats.lastDate}）` : "尚未抓取"}</span>
        <span style={{ marginLeft: "auto" }} />
        <button className="ns-btn ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => onRefresh("5d")} disabled={busy}>
          <ArrowsClockwise size={12} />更新最新
        </button>
        <button className="ns-btn ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => onRefresh("1y")} disabled={busy}>
          <ArrowsClockwise size={12} />回補 1 年
        </button>
        <button className="ns-btn ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => onRefresh("5y")} disabled={busy}>
          <ArrowsClockwise size={12} />回補 5 年
        </button>
      </div>
    </div>
  );
}

interface FxPairStats {
  count: number;
  firstDate: string;
  lastDate: string;
}

function buildFxStats(rates: DailyFxRate[]): Map<string, FxPairStats> {
  const map = new Map<string, FxPairStats>();
  for (const row of rates) {
    const key = `${row.from}|${row.to}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { count: 1, firstDate: row.date, lastDate: row.date });
    } else {
      existing.count += 1;
      if (row.date < existing.firstDate) existing.firstDate = row.date;
      if (row.date > existing.lastDate) existing.lastDate = row.date;
    }
  }
  return map;
}

function CategoryEditor({
  group,
  onChange,
  onDelete,
}: {
  group: CategoryGroup;
  onChange: (group: CategoryGroup) => void;
  onDelete: () => void;
}) {
  const [childDraft, setChildDraft] = useState("");
  return (
    <details style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", padding: 12 }}>
      <summary style={{ cursor: "pointer", listStyle: "none", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{group.name || "未命名分類"}</span>
          <span className="muted" style={{ fontSize: 11 }}>{group.children.length} 個子分類</span>
        </div>
      </summary>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <TextInput value={group.name} onChange={(event) => onChange({ ...group, name: event.target.value })} aria-label="分類名稱" />
          <button className="ns-btn ghost" style={{ padding: 7, color: "var(--ns-neg)" }} onClick={onDelete}><Trash size={14} /></button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {group.children.map((child) => (
            <span key={child} style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: "var(--ns-r-sm)", padding: "3px 8px", fontSize: 12, background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
              {child}
              <button type="button" aria-label={`移除 ${child}`} style={{ display: "flex", lineHeight: 1 }} onClick={() => onChange({ ...group, children: group.children.filter((item) => item !== child) })}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <TextInput value={childDraft} onChange={(event) => setChildDraft(event.target.value)} placeholder="新增子分類" />
          <button
            className="ns-btn"
            onClick={() => {
              const next = childDraft.trim();
              if (!next) return;
              onChange({ ...group, children: [...new Set([...group.children, next])] });
              setChildDraft("");
            }}
          >
            <Plus size={13} />新增
          </button>
        </div>
      </div>
    </details>
  );
}

function PreferencePreview({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", padding: 12 }}>
      <div style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>{text}</div>
      </div>
    </div>
  );
}

function SummaryBlock({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{icon}{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.length ? items.map((item) => (
          <span key={item} className="ns-pill" style={{ fontSize: 11 }}>{item}</span>
        )) : <span className="muted" style={{ fontSize: 12 }}>尚未建立</span>}
      </div>
    </div>
  );
}

function StatusRow({ icon, text }: { icon: ReactNode; text: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>{icon}<span>{text}</span></div>;
}

function setRate(index: number, rate: ExchangeRate, setForm: Dispatch<SetStateAction<AppSettings>>) {
  setForm((current) => ({
    ...current,
    exchangeRates: current.exchangeRates.map((item, rowIndex) => rowIndex === index ? rate : item),
  }));
}

function setCategory(index: number, group: CategoryGroup, setForm: Dispatch<SetStateAction<AppSettings>>) {
  setForm((current) => ({
    ...current,
    categories: current.categories.map((item, rowIndex) => rowIndex === index ? group : item),
  }));
}

function DisplayAndPrivacyCard() {
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  const togglePrivacy = useUiPreferences((state) => state.togglePrivacyMode);
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const setNameLocale = useUiPreferences((state) => state.setNameLocale);
  const clockMode = useUiPreferences((state) => state.clockMode);
  const setClockMode = useUiPreferences((state) => state.setClockMode);
  const timezone = useUiPreferences((state) => state.timezone);
  const setTimezone = useUiPreferences((state) => state.setTimezone);
  const theme = useUiPreferences((state) => state.theme);
  const setTheme = useUiPreferences((state) => state.setTheme);
  const [customTzInput, setCustomTzInput] = useState("");
  const [tzError, setTzError] = useState<string | null>(null);
  const toast = useToast();

  // Live clock so you can verify the chosen timezone matches your reality.
  const [tickNow, setTickNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTickNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: "system", label: "跟隨系統", icon: "⚙" },
    { value: "light", label: "淺色", icon: "☀" },
    { value: "dark", label: "深色", icon: "☾" },
  ];

  const localeOptions: { value: NameLocalePreference; label: string }[] = [
    { value: "auto", label: "跟隨系統" },
    { value: "zh-Hant", label: "繁體中文" },
    { value: "en", label: "English" },
  ];

  const clockOptions: { value: ClockMode; label: string }[] = [
    { value: "24h", label: "24 小時制" },
    { value: "12h", label: "AM / PM" },
  ];

  // Show the user's selected zone even if it's not in the curated list, so
  // they can see what's currently active without scrolling the dropdown.
  const timezoneOptions = useMemo(() => {
    const list = [...COMMON_TIMEZONES];
    if (!list.some((option) => option.id === timezone)) {
      list.unshift({ id: timezone, label: timezone });
    }
    return list;
  }, [timezone]);

  function applyCustomTimezone() {
    const next = customTzInput.trim();
    if (!next) return;
    if (!isValidTimezone(next)) {
      setTzError(`「${next}」不是有效的 IANA 時區。`);
      return;
    }
    setTimezone(next);
    setCustomTzInput("");
    setTzError(null);
    toast.success("時區已更新", { description: next });
  }

  function handleTimezoneSelect(next: string) {
    setTzError(null);
    setTimezone(next);
    toast.success("時區已更新", { description: next });
  }

  return (
    <div className="ns-card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}><h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 15, fontWeight: 500 }}>顯示與隱私</h3></div>
      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 20 }}>
        <Field label="外觀主題">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {themeOptions.map((option) => {
              const active = option.value === theme;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  aria-pressed={active}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    borderRadius: "var(--ns-r-sm)", border: "1px solid",
                    borderColor: active ? "var(--ns-accent)" : "var(--ns-border)",
                    padding: "8px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    background: active ? "var(--ns-accent-soft)" : "transparent",
                    color: active ? "var(--ns-accent)" : "var(--ns-fg-muted)",
                  }}
                >
                  <span style={{ fontSize: 13 }}>{option.icon}</span>
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>

        <button
          type="button"
          onClick={togglePrivacy}
          aria-pressed={privacyMode}
          style={{
            display: "flex", width: "100%", alignItems: "flex-start", gap: 12,
            borderRadius: "var(--ns-r-md)", border: "1px solid", padding: 12, textAlign: "left", cursor: "pointer",
            borderColor: privacyMode ? "var(--ns-accent)" : "var(--ns-border)",
            background: privacyMode ? "var(--ns-accent-soft)" : "transparent",
          }}
        >
          <div style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "var(--ns-r-sm)", background: privacyMode ? "var(--ns-accent)" : "var(--ns-bg-hover)", color: privacyMode ? "white" : "var(--ns-fg-muted)" }}>
            {privacyMode ? <EyeSlash size={18} weight="fill" /> : <Eye size={18} weight="duotone" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              隱藏金額（截圖模式）
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--ns-fg-muted)" }}>
                {privacyMode ? "已開啟" : "已關閉"}
              </span>
            </div>
            <p className="muted" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6 }}>
              開啟後所有金額會以 ＊＊＊＊＊＊ 顯示，方便錄影或回報問題。可用 ⌘⇧H 快速切換。
            </p>
          </div>
        </button>

        <Field label="標的名稱語系">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {localeOptions.map((option) => {
              const active = option.value === nameLocale;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNameLocale(option.value)}
                  aria-pressed={active}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    borderRadius: "var(--ns-r-sm)", border: "1px solid", padding: "7px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    borderColor: active ? "var(--ns-accent)" : "var(--ns-border)",
                    background: active ? "var(--ns-accent-soft)" : "transparent",
                    color: active ? "var(--ns-accent)" : "var(--ns-fg-muted)",
                  }}
                >
                  <Globe size={13} weight={active ? "fill" : "duotone"} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          影響股票名稱顯示偏好。缺少對應翻譯時自動使用 Yahoo 回傳的原文。
        </p>

        <Field label="時間制式">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {clockOptions.map((option) => {
              const active = option.value === clockMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setClockMode(option.value)}
                  aria-pressed={active}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    borderRadius: "var(--ns-r-sm)", border: "1px solid", padding: "7px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    borderColor: active ? "var(--ns-accent)" : "var(--ns-border)",
                    background: active ? "var(--ns-accent-soft)" : "transparent",
                    color: active ? "var(--ns-accent)" : "var(--ns-fg-muted)",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          影響新增收支時的時間挑選器。在表單上也能即時切換。
        </p>

        <Field label="時區">
          <select
            value={timezone}
            onChange={(event) => handleTimezoneSelect(event.target.value)}
            style={{ width: "100%", borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", background: "transparent", padding: "8px 12px", fontSize: 13, color: "var(--ns-fg)", outline: "none" }}
          >
            {timezoneOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <TextInput
            placeholder="自訂 IANA 時區（例如 Asia/Tokyo）"
            value={customTzInput}
            onChange={(event) => setCustomTzInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyCustomTimezone();
              }
            }}
          />
          <button className="ns-btn" onClick={applyCustomTimezone}>套用</button>
        </div>
        {tzError ? (
          <p className="neg" style={{ fontSize: 12, lineHeight: 1.6 }}>{tzError}</p>
        ) : (
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            目前 {timezone}：{formatDateTimeInTimezone(tickNow, timezone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: clockMode === "12h" })}
          </p>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build a copy-pastable error report. WebView in production builds doesn't
 * expose devtools, so the toast detail is the only way the user can hand us
 * a useful stack trace. Include any context the caller provides too.
 */
function formatErrorDetail(error: unknown, extra: Record<string, unknown> = {}): string {
  const lines: string[] = [];
  if (error instanceof Error) {
    lines.push(`${error.name}: ${error.message}`);
    if (error.stack) lines.push("", error.stack);
    const cause = (error as { cause?: unknown }).cause;
    if (cause) {
      lines.push("", "Caused by:");
      lines.push(typeof cause === "string" ? cause : JSON.stringify(cause, null, 2));
    }
  } else if (typeof error === "string") {
    lines.push(error);
  } else if (error) {
    lines.push(JSON.stringify(error, null, 2));
  } else {
    lines.push("Unknown error (no error object).");
  }
  if (Object.keys(extra).length) {
    lines.push("", "Context:", JSON.stringify(extra, null, 2));
  }
  lines.push("", `When: ${new Date().toISOString()}`);
  return lines.join("\n");
}

function normalizeForm(form: AppSettings): AppSettings {
  return {
    primaryCurrency: form.primaryCurrency.trim().toUpperCase() || "TWD",
    categories: form.categories
      .map((group) => ({ name: group.name.trim(), children: [...new Set(group.children.map((child) => child.trim()).filter(Boolean))] }))
      .filter((group) => group.name),
    merchants: [...new Set(form.merchants.map((merchant) => merchant.trim()).filter(Boolean))],
    exchangeRates: form.exchangeRates
      .map((rate) => ({
        from: rate.from.trim().toUpperCase(),
        to: rate.to.trim().toUpperCase() || form.primaryCurrency.trim().toUpperCase() || "TWD",
        rate: roundTo2(Number(rate.rate)),
        updatedAt: rate.updatedAt || new Date().toISOString(),
      }))
      .filter((rate) => rate.from && rate.to && Number.isFinite(rate.rate) && rate.rate > 0),
  };
}

function roundTo2(value: number) {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 100) / 100;
}
