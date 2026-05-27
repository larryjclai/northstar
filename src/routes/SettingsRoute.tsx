import { ArrowsClockwise, ArrowsLeftRight, CheckCircle, Clock, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, PencilSimple, Plus, Storefront, Tag, Trash, UploadSimple, UsersThree, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Field, TextInput } from "../components/Field";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository, type RepositorySnapshot } from "../data/repositories";
import { COMMON_TIMEZONES, isValidTimezone, formatDateTimeInTimezone } from "../domain";
import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../domain";
import { useRefreshFxRates } from "../features/market-data/useMarketRefresh";
import { useUiPreferences, type ClockMode, type NameLocalePreference } from "../state/uiPreferences";
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
  const renameMerchantMutation = useRepositoryMutation(
    (repository, input: { oldName: string; newName: string }) => repository.renameMerchant(input.oldName, input.newName),
    ["settings", "ledger"],
  );
  const renameSubcategoryMutation = useRepositoryMutation(
    (repository, input: { category: string; oldSub: string; newSub: string }) => repository.renameSubcategory(input.category, input.oldSub, input.newSub),
    ["settings", "ledger"],
  );
  const [renamingMerchant, setRenamingMerchant] = useState<string | null>(null);
  const [merchantRenameValue, setMerchantRenameValue] = useState("");
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

  async function saveMerchantRename(oldName: string) {
    const newName = merchantRenameValue.trim();
    setRenamingMerchant(null);
    if (!newName || newName === oldName) return;
    try {
      await renameMerchantMutation.mutateAsync({ oldName, newName });
      setForm((current) => ({
        ...current,
        merchants: current.merchants.map((m) => (m === oldName ? newName : m)),
      }));
      toast.success(`已將商家「${oldName}」改名為「${newName}」`);
    } catch (error) {
      toast.error("改名失敗", { description: error instanceof Error ? error.message : "未預期的錯誤。" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader
        title="設定"
        description="整理幣別、匯率、分類與商家，讓每次記帳更快、更一致。"
        action={
          <ActionButton onClick={submit} disabled={updateSettings.isPending} size="sm" loading={updateSettings.isPending}>
            <CheckCircle size={16} />儲存設定
          </ActionButton>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <DisplayAndPrivacyCard />
          <Card title="幣別與匯率">
            <div className="grid gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
                <Field label="主要幣別">
                  <TextInput
                    value={form.primaryCurrency}
                    onChange={(event) => setForm({ ...form, primaryCurrency: event.target.value.toUpperCase() })}
                    placeholder="TWD"
                  />
                </Field>
                <PreferencePreview icon={<CurrencyCircleDollar size={20} />} title="總覽換算基準" text={`${form.primaryCurrency || "TWD"} 會用於淨值、帳戶與現金流摘要。`} />
              </div>
              <div className="grid gap-2">
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
                    className="text-xs font-semibold"
                    style={{ color: "var(--ns-accent)" }}
                  >
                    {showAllRates ? "收合部分匯率" : `顯示全部匯率（${form.exchangeRates.length}）`}
                  </button>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="secondary"
                    onClick={() => setForm((current) => ({
                      ...current,
                      exchangeRates: [...current.exchangeRates, { from: "USD", to: current.primaryCurrency || "TWD", rate: 1, updatedAt: new Date().toISOString() }],
                    }))}
                  >
                    <Plus size={16} />新增匯率
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={refreshAllFxRates} disabled={refreshFxRates.isPending || form.exchangeRates.length === 0}>
                    <ArrowsClockwise size={16} />{refreshFxRates.isPending ? "抓取中" : "全部更新（1Y）"}
                  </ActionButton>
                </div>
              </div>
            </div>
          </Card>

          <Card title="分類與商家">
            <div className="grid gap-3">
              {form.categories.map((group, index) => (
                <CategoryEditor
                  key={`${group.name}-${index}`}
                  group={group}
                  onChange={(next) => setCategory(index, next, setForm)}
                  onDelete={() => setForm((current) => ({ ...current, categories: current.categories.filter((_, rowIndex) => rowIndex !== index) }))}
                  onRenameChild={async (oldSub, newSub) => {
                    try {
                      await renameSubcategoryMutation.mutateAsync({ category: group.name, oldSub, newSub });
                      setCategory(index, { ...group, children: group.children.map((c) => (c === oldSub ? newSub : c)) }, setForm);
                      toast.success(`已將子分類「${oldSub}」改名為「${newSub}」`);
                    } catch (error) {
                      toast.error("改名失敗", { description: error instanceof Error ? error.message : "未預期的錯誤。" });
                    }
                  }}
                />
              ))}
              <ActionButton
                variant="secondary"
                onClick={() => setForm((current) => ({ ...current, categories: [...current.categories, { name: "新分類", children: [] }] }))}
              >
                <Plus size={16} />新增分類
              </ActionButton>
            </div>
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--ns-muted)" }}>常用商家</h3>
              <div className="flex flex-wrap gap-2">
              {visibleMerchants.map((merchant) => (
                renamingMerchant === merchant ? (
                  <span key={merchant} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--ns-accent)", background: "var(--ns-surface-strong)" }}>
                    <input
                      autoFocus
                      className="w-24 bg-transparent outline-none"
                      value={merchantRenameValue}
                      onChange={(event) => setMerchantRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveMerchantRename(merchant);
                        if (event.key === "Escape") setRenamingMerchant(null);
                      }}
                    />
                    <button type="button" aria-label="確認改名" onClick={() => void saveMerchantRename(merchant)} style={{ color: "var(--ns-positive)" }}><CheckCircle size={14} weight="fill" /></button>
                    <button type="button" aria-label="取消" onClick={() => setRenamingMerchant(null)}><X size={14} /></button>
                  </span>
                ) : (
                  <span key={merchant} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-strong)" }}>
                    {merchant}
                    <button type="button" aria-label={`改名 ${merchant}`} onClick={() => { setRenamingMerchant(merchant); setMerchantRenameValue(merchant); }} style={{ color: "var(--ns-muted)" }}><PencilSimple size={13} /></button>
                    <button type="button" aria-label={`移除 ${merchant}`} onClick={() => setForm((current) => ({ ...current, merchants: current.merchants.filter((item) => item !== merchant) }))}><X size={14} /></button>
                  </span>
                )
              ))}
              </div>
              {form.merchants.length > 16 ? (
                <button
                  type="button"
                  onClick={() => setShowAllMerchants((value) => !value)}
                  className="mt-2 text-xs font-semibold"
                  style={{ color: "var(--ns-accent)" }}
                >
                  {showAllMerchants ? "收合商家清單" : `顯示全部商家（${form.merchants.length}）`}
                </button>
              ) : null}
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <TextInput value={merchantDraft} onChange={(event) => setMerchantDraft(event.target.value)} placeholder="新增常用商家" />
                <ActionButton variant="secondary" onClick={addMerchant}><Plus size={16} />新增商家</ActionButton>
              </div>
            </div>
          </Card>

          <Card title="退休目標">
            <p className="text-sm" style={{ color: "var(--ns-muted)" }}>
              FIRE 計畫已搬到「目標」分頁，支援年齡、報酬率、通膨與支出分項試算。
            </p>
            <div className="mt-3">
              <Link
                to="/goals"
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold outline-none transition"
                style={{ background: "var(--ns-accent)", color: "var(--ns-on-accent, white)", borderColor: "var(--ns-accent)" }}
              >
                <Target size={16} weight="fill" />前往目標
              </Link>
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="目前設定">
            <SummaryBlock icon={<Tag size={18} />} title="分類" items={form.categories.map((item) => `${item.name} · ${item.children.length} 個子分類`)} />
            <div className="my-4 h-px" style={{ background: "var(--ns-border)" }} />
            <SummaryBlock icon={<Storefront size={18} />} title="商家" items={form.merchants} />
            <div className="my-4 h-px" style={{ background: "var(--ns-border)" }} />
            <SummaryBlock icon={<ArrowsLeftRight size={18} />} title="匯率" items={form.exchangeRates.map((rate) => `${rate.from} → ${rate.to} = ${rate.rate.toFixed(2)}`)} />
          </Card>
          <Card title="備份與安全">
            <div className="mb-3 space-y-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)", background: "var(--ns-surface-subtle)" }}>
              <StatusRow icon={<Key size={18} />} text="同步開啟前會建立救援金鑰。" />
              <StatusRow icon={<UsersThree size={18} />} text="家庭共享會使用獨立 Household Space Key。" />
              <StatusRow icon={<CheckCircle size={18} />} text="不登入也能完整使用本機帳本。" />
            </div>
            <p className="text-sm" style={{ color: "var(--ns-muted)" }}>
              匯出整份資料庫成 JSON 檔（含交易、持倉、匯率歷史、每日股價）。匯入會覆蓋現有資料，請先備份再執行。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={exportBackup} disabled={snapshotBusy}>
                <DownloadSimple size={16} />匯出備份 JSON
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={snapshotBusy}>
                <UploadSimple size={16} />匯入備份
              </ActionButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importBackup(file);
                  event.target.value = "";
                }}
              />
            </div>
            {importStatus ? (
              <div
                className="mt-3 rounded-md border px-3 py-2 text-xs"
                style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)", background: "var(--ns-surface-strong)" }}
              >
                <span className="inline-flex items-center gap-2">
                  <Clock size={14} />{importStatus}
                </span>
              </div>
            ) : null}
          </Card>
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
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
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
        <ActionButton variant="danger" onClick={onDelete}><Trash size={16} /></ActionButton>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ns-muted)" }}>
        <span>每日匯率：{stats ? `${stats.count} 筆（${stats.firstDate} ~ ${stats.lastDate}）` : "尚未抓取"}</span>
        <span className="ml-auto" />
        <ActionButton variant="ghost" onClick={() => onRefresh("5d")} disabled={busy}>
          <ArrowsClockwise size={14} />更新最新
        </ActionButton>
        <ActionButton variant="ghost" onClick={() => onRefresh("1y")} disabled={busy}>
          <ArrowsClockwise size={14} />回補 1 年
        </ActionButton>
        <ActionButton variant="ghost" onClick={() => onRefresh("5y")} disabled={busy}>
          <ArrowsClockwise size={14} />回補 5 年
        </ActionButton>
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
  onRenameChild,
}: {
  group: CategoryGroup;
  onChange: (group: CategoryGroup) => void;
  onDelete: () => void;
  onRenameChild?: (oldSub: string, newSub: string) => Promise<void>;
}) {
  const [childDraft, setChildDraft] = useState("");
  const [renamingChild, setRenamingChild] = useState<string | null>(null);
  const [childRenameValue, setChildRenameValue] = useState("");

  async function saveChildRename(oldSub: string) {
    const newSub = childRenameValue.trim();
    setRenamingChild(null);
    if (!newSub || newSub === oldSub) return;
    await onRenameChild?.(oldSub, newSub);
  }

  return (
    <details className="rounded-lg border p-3" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
      <summary className="cursor-pointer list-none select-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{group.name || "未命名分類"}</span>
          <span className="text-xs" style={{ color: "var(--ns-muted)" }}>
            {group.children.length} 個子分類
          </span>
        </div>
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput value={group.name} onChange={(event) => onChange({ ...group, name: event.target.value })} aria-label="分類名稱" />
          <ActionButton variant="danger" onClick={onDelete}><Trash size={16} /></ActionButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.children.map((child) => (
            renamingChild === child ? (
              <span key={child} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)", outline: "1px solid var(--ns-accent)" }}>
                <input
                  autoFocus
                  className="w-20 bg-transparent outline-none"
                  value={childRenameValue}
                  onChange={(event) => setChildRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveChildRename(child);
                    if (event.key === "Escape") setRenamingChild(null);
                  }}
                />
                <button type="button" aria-label="確認改名" onClick={() => void saveChildRename(child)}><CheckCircle size={14} weight="fill" /></button>
                <button type="button" aria-label="取消" onClick={() => setRenamingChild(null)}><X size={14} /></button>
              </span>
            ) : (
              <span key={child} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
                {child}
                {onRenameChild ? (
                  <button type="button" aria-label={`改名 ${child}`} onClick={() => { setRenamingChild(child); setChildRenameValue(child); }} className="opacity-60 hover:opacity-100">
                    <PencilSimple size={13} />
                  </button>
                ) : null}
                <button type="button" aria-label={`移除 ${child}`} onClick={() => onChange({ ...group, children: group.children.filter((item) => item !== child) })}>
                  <X size={14} />
                </button>
              </span>
            )
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput value={childDraft} onChange={(event) => setChildDraft(event.target.value)} placeholder="新增子分類" />
          <ActionButton
            variant="secondary"
            onClick={() => {
              const next = childDraft.trim();
              if (!next) return;
              onChange({ ...group, children: [...new Set([...group.children, next])] });
              setChildDraft("");
            }}
          >
            <Plus size={16} />新增
          </ActionButton>
        </div>
      </div>
    </details>
  );
}

function PreferencePreview({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="grid size-9 place-items-center rounded-md" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{text}</div>
      </div>
    </div>
  );
}

function SummaryBlock({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-semibold">{icon}{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length ? items.map((item) => (
          <span key={item} className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)" }}>{item}</span>
        )) : <span className="text-sm" style={{ color: "var(--ns-muted)" }}>尚未建立</span>}
      </div>
    </div>
  );
}

function StatusRow({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex items-center gap-2">{icon}<span>{text}</span></div>;
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
  const [customTzInput, setCustomTzInput] = useState("");
  const [tzError, setTzError] = useState<string | null>(null);
  const toast = useToast();

  // Live clock so you can verify the chosen timezone matches your reality.
  const [tickNow, setTickNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTickNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
    <Card title="顯示與隱私">
      <div className="space-y-4">
        <button
          type="button"
          onClick={togglePrivacy}
          aria-pressed={privacyMode}
          className="flex w-full items-start gap-3 rounded-md border p-3 text-left outline-none transition hover:opacity-90"
          style={{
            borderColor: privacyMode ? "var(--ns-accent)" : "var(--ns-border)",
            background: privacyMode ? "var(--ns-accent-soft)" : "transparent",
          }}
        >
          <div
            className="grid size-9 shrink-0 place-items-center rounded-md"
            style={{
              background: privacyMode ? "var(--ns-accent)" : "var(--ns-surface-strong, var(--ns-surface))",
              color: privacyMode ? "white" : "var(--ns-muted)",
            }}
          >
            {privacyMode ? <EyeSlash size={18} weight="fill" /> : <Eye size={18} weight="duotone" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              隱藏金額（截圖模式）
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--ns-muted)" }}>
                {privacyMode ? "已開啟" : "已關閉"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--ns-muted)" }}>
              開啟後所有金額會以 ＊＊＊＊＊＊ 顯示，方便錄影或回報問題。可用 ⌘⇧H 快速切換。
            </p>
          </div>
        </button>

        <Field label="標的名稱語系">
          <div className="grid grid-cols-3 gap-2">
            {localeOptions.map((option) => {
              const active = option.value === nameLocale;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNameLocale(option.value)}
                  aria-pressed={active}
                  className="flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-medium outline-none transition"
                  style={{
                    borderColor: active ? "var(--ns-accent)" : "var(--ns-border)",
                    background: active ? "var(--ns-accent-soft)" : "transparent",
                    color: active ? "var(--ns-accent)" : "var(--ns-muted)",
                  }}
                >
                  <Globe size={14} weight={active ? "fill" : "duotone"} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>
        <p className="-mt-2 text-xs leading-5" style={{ color: "var(--ns-muted)" }}>
          影響股票名稱顯示偏好。缺少對應翻譯時自動使用 Yahoo 回傳的原文。
        </p>

        <Field label="時間制式">
          <div className="grid grid-cols-2 gap-2">
            {clockOptions.map((option) => {
              const active = option.value === clockMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setClockMode(option.value)}
                  aria-pressed={active}
                  className="flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-medium outline-none transition"
                  style={{
                    borderColor: active ? "var(--ns-accent)" : "var(--ns-border)",
                    background: active ? "var(--ns-accent-soft)" : "transparent",
                    color: active ? "var(--ns-accent)" : "var(--ns-muted)",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Field>
        <p className="-mt-2 text-xs leading-5" style={{ color: "var(--ns-muted)" }}>
          影響新增收支時的時間挑選器。在表單上也能即時切換。
        </p>

        <Field label="時區">
          <select
            value={timezone}
            onChange={(event) => handleTimezoneSelect(event.target.value)}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--ns-border)", color: "var(--ns-fg)" }}
          >
            {timezoneOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <div className="-mt-2 grid grid-cols-[1fr_auto] gap-2">
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
          <ActionButton variant="secondary" onClick={applyCustomTimezone}>套用</ActionButton>
        </div>
        {tzError ? (
          <p className="-mt-2 text-xs leading-5" style={{ color: "var(--ns-danger, #c0392b)" }}>{tzError}</p>
        ) : (
          <p className="-mt-2 text-xs leading-5" style={{ color: "var(--ns-muted)" }}>
            目前 {timezone}：{formatDateTimeInTimezone(tickNow, timezone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: clockMode === "12h" })}
          </p>
        )}
      </div>
    </Card>
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
