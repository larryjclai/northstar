import { ArrowsClockwise, ArrowsLeftRight, CheckCircle, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, Plus, Storefront, Tag, Trash, UploadSimple, UsersThree, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Field, TextInput } from "../components/Field";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository, type RepositorySnapshot } from "../data/repositories";
import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../domain";
import { useRefreshFxRates } from "../features/market-data/useMarketRefresh";
import { FireGoalEditor } from "../features/goals/FireGoalEditor";
import { useUiPreferences, type ClockMode, type NameLocalePreference } from "../state/uiPreferences";

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
  const [message, setMessage] = useState("");
  const [saveTone, setSaveTone] = useState<"success" | "error" | null>(null);
  const seededRef = useRef(false);
  const updateSettings = useRepositoryMutation((repository, input: AppSettings) => repository.updateAppSettings(input), ["settings"]);
  const refreshFxRates = useRefreshFxRates();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  async function exportBackup() {
    setMessage("");
    setSaveTone(null);
    try {
      setSnapshotBusy(true);
      const repository = await getFinanceRepository();
      const snapshot = await repository.exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.download = `northstar-backup-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("備份已下載。");
      setSaveTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "備份失敗。");
      setSaveTone("error");
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function importBackup(file: File) {
    setMessage("");
    setSaveTone(null);
    if (!window.confirm("匯入會覆蓋目前所有資料，確定要繼續嗎？")) return;
    try {
      setSnapshotBusy(true);
      const text = await file.text();
      const parsed = JSON.parse(text) as RepositorySnapshot;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.accounts)) {
        throw new Error("檔案格式不正確。");
      }
      const repository = await getFinanceRepository();
      await repository.importSnapshot(parsed);
      await queryClient.invalidateQueries();
      seededRef.current = false;
      setMessage("已匯入備份。");
      setSaveTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "匯入失敗。");
      setSaveTone("error");
    } finally {
      setSnapshotBusy(false);
    }
  }

  useEffect(() => {
    if (!settings.data) return;
    if (seededRef.current) return;
    setForm(settings.data);
    seededRef.current = true;
  }, [settings.data]);

  const fxStats = useMemo(() => buildFxStats(dailyFxRates.data ?? []), [dailyFxRates.data]);

  async function submit() {
    setMessage("");
    setSaveTone(null);
    const next = normalizeForm(form);
    try {
      await updateSettings.mutateAsync(next);
      setForm(next);
      setMessage("設定已儲存。");
      setSaveTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "設定儲存失敗。");
      setSaveTone("error");
    }
  }

  async function refreshAllFxRates() {
    setMessage("");
    setSaveTone(null);
    const pairs = form.exchangeRates.map((rate) => ({ from: rate.from, to: rate.to || form.primaryCurrency }));
    if (pairs.length === 0) {
      setMessage("沒有可更新的匯率，請先新增。");
      setSaveTone("error");
      return;
    }
    try {
      const result = await refreshFxRates.mutateAsync({ pairs, range: "1y" });
      setMessage(`已抓取 ${result.saved} 筆每日匯率${result.failed.length ? `（部分失敗：${result.failed.join("；")}）` : "。"}`);
      setSaveTone(result.failed.length ? "error" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "匯率更新失敗。");
      setSaveTone("error");
    }
  }

  async function refreshSinglePair(rate: ExchangeRate, range: string) {
    setMessage("");
    setSaveTone(null);
    try {
      const result = await refreshFxRates.mutateAsync({ pairs: [{ from: rate.from, to: rate.to || form.primaryCurrency }], range });
      setMessage(`${rate.from}→${rate.to || form.primaryCurrency} 已抓取 ${result.saved} 筆。`);
      setSaveTone(result.failed.length ? "error" : "success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "匯率更新失敗。");
      setSaveTone("error");
    }
  }

  function addMerchant() {
    const next = merchantDraft.trim();
    if (!next) return;
    setForm((current) => ({ ...current, merchants: [...new Set([...current.merchants, next])] }));
    setMerchantDraft("");
  }

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader title="設定" description="整理幣別、匯率、分類與商家，讓每次記帳更快、更一致。" />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
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
                {form.exchangeRates.map((rate, index) => {
                  const pairKey = `${rate.from}|${rate.to || form.primaryCurrency}`;
                  return (
                    <RateRow
                      key={`${rate.from}-${rate.to}-${index}`}
                      rate={rate}
                      primaryCurrency={form.primaryCurrency}
                      stats={fxStats.get(pairKey)}
                      onChange={(next) => setRate(index, next, setForm)}
                      onDelete={() => setForm((current) => ({ ...current, exchangeRates: current.exchangeRates.filter((_, rowIndex) => rowIndex !== index) }))}
                      onRefresh={(range) => refreshSinglePair(rate, range)}
                      busy={refreshFxRates.isPending}
                    />
                  );
                })}
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

          <Card title="分類">
            <div className="grid gap-3">
              {form.categories.map((group, index) => (
                <CategoryEditor
                  key={`${group.name}-${index}`}
                  group={group}
                  onChange={(next) => setCategory(index, next, setForm)}
                  onDelete={() => setForm((current) => ({ ...current, categories: current.categories.filter((_, rowIndex) => rowIndex !== index) }))}
                />
              ))}
              <ActionButton
                variant="secondary"
                onClick={() => setForm((current) => ({ ...current, categories: [...current.categories, { name: "新分類", children: [] }] }))}
              >
                <Plus size={16} />新增分類
              </ActionButton>
            </div>
          </Card>

          <FireGoalEditor />

          <Card title="商家">
            <div className="flex flex-wrap gap-2">
              {form.merchants.map((merchant) => (
                <span key={merchant} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-strong)" }}>
                  {merchant}
                  <button type="button" aria-label={`移除 ${merchant}`} onClick={() => setForm((current) => ({ ...current, merchants: current.merchants.filter((item) => item !== merchant) }))}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <TextInput value={merchantDraft} onChange={(event) => setMerchantDraft(event.target.value)} placeholder="新增常用商家" />
              <ActionButton variant="secondary" onClick={addMerchant}><Plus size={16} />新增</ActionButton>
            </div>
          </Card>

          {message ? (
            <div
              role="status"
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                background: saveTone === "error" ? "var(--ns-danger-soft, #fdecea)" : "var(--ns-accent-soft)",
                borderColor: saveTone === "error" ? "var(--ns-danger, #c0392b)" : "var(--ns-accent)",
                color: saveTone === "error" ? "var(--ns-danger, #c0392b)" : "var(--ns-accent)",
              }}
            >
              {message}
            </div>
          ) : null}
          <div>
            <ActionButton onClick={submit} disabled={updateSettings.isPending}>
              <CheckCircle size={16} />{updateSettings.isPending ? "儲存中" : "儲存設定"}
            </ActionButton>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <DisplayAndPrivacyCard />
          <Card title="目前設定">
            <SummaryBlock icon={<Tag size={18} />} title="分類" items={form.categories.map((item) => `${item.name} · ${item.children.length} 個子分類`)} />
            <div className="my-4 h-px" style={{ background: "var(--ns-border)" }} />
            <SummaryBlock icon={<Storefront size={18} />} title="商家" items={form.merchants} />
            <div className="my-4 h-px" style={{ background: "var(--ns-border)" }} />
            <SummaryBlock icon={<ArrowsLeftRight size={18} />} title="匯率" items={form.exchangeRates.map((rate) => `${rate.from} → ${rate.to} = ${rate.rate}`)} />
          </Card>
          <Card title="同步與安全">
            <div className="space-y-3 text-sm" style={{ color: "var(--ns-muted)" }}>
              <StatusRow icon={<Key size={18} />} text="同步開啟前會建立救援金鑰。" />
              <StatusRow icon={<UsersThree size={18} />} text="家庭共享會使用獨立 Household Space Key。" />
              <StatusRow icon={<CheckCircle size={18} />} text="不登入也能完整使用本機帳本。" />
            </div>
          </Card>
          <Card title="備份與還原">
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
          <TextInput type="number" value={rate.rate} onChange={(event) => onChange({ ...rate, rate: Number(event.target.value), updatedAt: new Date().toISOString() })} />
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
}: {
  group: CategoryGroup;
  onChange: (group: CategoryGroup) => void;
  onDelete: () => void;
}) {
  const [childDraft, setChildDraft] = useState("");
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <TextInput value={group.name} onChange={(event) => onChange({ ...group, name: event.target.value })} aria-label="分類名稱" />
        <ActionButton variant="danger" onClick={onDelete}><Trash size={16} /></ActionButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {group.children.map((child) => (
          <span key={child} className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
            {child}
            <button type="button" aria-label={`移除 ${child}`} onClick={() => onChange({ ...group, children: group.children.filter((item) => item !== child) })}>
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
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

  const localeOptions: { value: NameLocalePreference; label: string }[] = [
    { value: "auto", label: "跟隨系統" },
    { value: "zh-Hant", label: "繁體中文" },
    { value: "en", label: "English" },
  ];

  const clockOptions: { value: ClockMode; label: string }[] = [
    { value: "24h", label: "24 小時制" },
    { value: "12h", label: "AM / PM" },
  ];

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
      </div>
    </Card>
  );
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
        rate: Number(rate.rate),
        updatedAt: rate.updatedAt || new Date().toISOString(),
      }))
      .filter((rate) => rate.from && rate.to && Number.isFinite(rate.rate) && rate.rate > 0),
  };
}
