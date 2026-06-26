import { ArrowsClockwise, CheckCircle, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, PencilSimple, Plus, Storefront, Tag, Trash, UploadSimple, UsersThree, X, CaretDown, CaretRight, Backspace, Gear, Bank, Target, DeviceMobile, Desktop, Spinner, WifiHigh, CopySimple, QrCode, Warning } from "@phosphor-icons/react";
import { Badge } from "../../components/coss/badge";
import { Button } from "../../components/coss/button";
import { Card } from "../../components/coss/card";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "../../components/ActionButton";
import { AppSelect } from "../../components/AppSelect";
import { useToast } from "../../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../../data/hooks";
import { downloadCsv, exportInvestmentCsv, exportLedgerCsv, exportFxRatesCsv } from "../../data/csv";
import { getFinanceRepository, type RepositorySnapshot } from "../../data/repositories";
import { enterDemoMode, exitDemoMode, clearAllData } from "../../data/demoData";
import { useDemoMode } from "../../state/demoMode";
import { COMMON_TIMEZONES, isValidTimezone } from "../../domain";
import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../../domain";
import type { SyncConflictRecord } from "../../domain/sync";
import { useRefreshFxRates } from "../../features/market-data/useMarketRefresh";
import { useUiPreferences, DEFAULT_BENCHMARK_TICKER, type ClockMode, type NameLocalePreference, type ThemeMode } from "../../state/uiPreferences";
import { TickerSearchField } from "../../components/TickerSearchField";
import { getOrCreateDeviceIdentity } from "../../state/deviceIdentity";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { IconPicker } from "../../components/IconPicker";
import { Glyph } from "../../lib/icons";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import QRCode from "react-qr-code";
import {
  loadSyncAccount, getOrCreateSyncAccount, setSyncAccount, sha256Hex,
  type SyncAccount,
} from "../../features/connect/sync/account";
import {
  generateVaultKey, saveVaultKey, loadVaultKey,
} from "../../features/connect/crypto/vault";
import {
  registerUser, listDevices, revokeDevice, addDevice,
  type DeviceRecord,
} from "../../features/connect/sync/client";
import {
  initiatePairing, joinWithCode, type PairingSession,
} from "../../features/connect/sync/pairing-flow";
import { runSync, forceFullResync } from "../../features/connect/sync/sync-manager";
import { summarizeConflict } from "../../features/connect/sync/conflictSummary";
import { listBackups, restoreBackup, type BackupEntry } from "../../features/connect/sync/backup";
import { useSyncStatus } from "../../state/syncStatus";
import {
  generateRecoveryKit, confirmRecoveryKit, downloadRecoveryKit,
  restoreFromRecoveryKit, loadLocalRecoveryKitStatus, type LocalRecoveryKitStatus,
} from "../../features/connect/crypto/recovery-kit";
import type { SettingsTabProps } from "./shared";

type ExportFormat = "csv" | "json";
type TimeRangeOption = "thisMonth" | "lastMonth" | "ytd" | "lastYear" | "allTime" | "custom";
type AccountScope = "all" | "cash" | "investment" | "credit";

const ACCOUNT_SCOPES: { id: AccountScope; label: string; types: string[] | null }[] = [
  { id: "all", label: "所有帳戶", types: null },
  { id: "cash", label: "現金 & 存款", types: ["cash", "depository"] },
  { id: "investment", label: "投資帳戶", types: ["investment", "alternative"] },
  { id: "credit", label: "信用卡 & 負債", types: ["credit", "loan"] },
];

function computeRange(option: TimeRangeOption, customStart: string, customEnd: string): { start?: string; end?: string } {
  if (option === "allTime") return {};
  if (option === "custom") return { start: customStart || undefined, end: customEnd || undefined };
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (option) {
    case "thisMonth": return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) };
    case "lastMonth": return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
    case "ytd": return { start: `${y}-01-01`, end: iso(now) };
    case "lastYear": return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    default: return {};
  }
}

export function SettingsExport({ t }: Pick<SettingsTabProps, "t">) {
  const toast = useToast();
  const { accounts, assets, investments, ledger, dailyFxRates } = useFinanceData();

  const [format, setFormat] = useState<ExportFormat>("csv");
  const [range, setRange] = useState<TimeRangeOption>("allTime");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [scope, setScope] = useState<AccountScope>("all");
  const [includeTransfers, setIncludeTransfers] = useState(true);
  const [includeInvestments, setIncludeInvestments] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeFx, setIncludeFx] = useState(false);
  const [busy, setBusy] = useState(false);

  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const investmentRows = investments.data ?? [];
  const assetRows = assets.data ?? [];
  const fxRows = dailyFxRates.data ?? [];
  const jsonMode = format === "json";

  const { start, end } = computeRange(range, customStart, customEnd);
  const scopeDef = ACCOUNT_SCOPES.find((s) => s.id === scope)!;
  const accountById = useMemo(() => new Map(accountRows.map((a) => [a.id, a])), [accountRows]);

  const inRange = (date: string) => {
    const d = date.slice(0, 10);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };
  const accountInScope = (id: string) => {
    if (!scopeDef.types) return true;
    const acc = accountById.get(id);
    return acc ? scopeDef.types.includes(acc.type) : false;
  };

  const filteredLedger = useMemo(
    () => ledgerRows.filter((row) =>
      !row.deletedAt && inRange(row.date) && accountInScope(row.accountId) && (includeTransfers || row.entryType !== "transfer")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledgerRows, start, end, scope, includeTransfers],
  );
  const filteredInvestments = useMemo(
    () => investmentRows.filter((rec) => !rec.deletedAt && inRange(rec.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [investmentRows, start, end],
  );
  const filteredFx = useMemo(
    () => fxRows.filter((r) => inRange(r.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fxRows, start, end],
  );

  const estimatedCount = filteredLedger.length + (includeInvestments ? filteredInvestments.length : 0);
  const today = new Date().toISOString().slice(0, 10);

  async function runExport() {
    setBusy(true);
    try {
      if (jsonMode) {
        const repository = await getFinanceRepository();
        const snapshot = await repository.exportSnapshot();
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `northstar-backup-${today}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.success("已匯出完整資料庫 JSON");
        return;
      }
      let files = 0;
      if (filteredLedger.length) {
        const accountName = (id: string) => accountById.get(id)?.name ?? id;
        downloadCsv(`northstar-ledger-${today}.csv`, exportLedgerCsv(filteredLedger, accountName, { includeNotes }));
        files += 1;
      }
      if (includeInvestments && filteredInvestments.length) {
        const assetFor = (id: string) => assetRows.find((a) => a.id === id);
        downloadCsv(`northstar-investments-${today}.csv`, exportInvestmentCsv(filteredInvestments, assetFor));
        files += 1;
      }
      if (includeFx && filteredFx.length) {
        downloadCsv(`northstar-fx-rates-${today}.csv`, exportFxRatesCsv(filteredFx));
        files += 1;
      }
      if (files === 0) { toast.error("選取範圍內沒有可匯出的資料"); return; }
      toast.success(`已匯出 ${files} 個 CSV 檔`);
    } catch (e) {
      toast.error(e instanceof Error ? `匯出失敗：${e.message}` : "匯出失敗");
    } finally {
      setBusy(false);
    }
  }

  const formatCards: { id: ExportFormat; title: string; desc: string }[] = [
    { id: "csv", title: "CSV", desc: "通用格式，支援 Excel / Numbers" },
    { id: "json", title: "JSON", desc: "完整資料庫，適合備份與還原" },
  ];
  const fieldToggles = [
    { key: "transfers", on: includeTransfers, set: setIncludeTransfers, label: t("settings.transfers") },
    { key: "investments", on: includeInvestments, set: setIncludeInvestments, label: t("settings.investments") },
    { key: "notes", on: includeNotes, set: setIncludeNotes, label: t("settings.notes") },
    { key: "fx", on: includeFx, set: setIncludeFx, label: t("settings.fxSnapshot") },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="text-xs" style={{  marginBottom: 4 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>Export</div>
        <h2 style={{ fontFamily: "var(--ns-font-display)", fontSize: 24, margin: 0, fontWeight: 600 }}>{t("settings.dataExport")}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>{t("settings.dataExportDesc")}</p>
      </div>

      <Card className="p-5">
        <div className="text-xs" style={{  marginBottom: 10 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>{t("settings.format")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {formatCards.map((f) => (
            <button key={f.id} type="button" onClick={() => setFormat(f.id)} style={{
              textAlign: "left", padding: 14, borderRadius: "var(--ns-r-md)", cursor: "pointer",
              border: `1.5px solid ${format === f.id ? "var(--ns-accent)" : "var(--ns-border)"}`,
              background: format === f.id ? "var(--ns-accent-soft)" : "transparent", color: "var(--ns-fg)",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{f.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{f.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {jsonMode ? (
        <Card className="p-5">
          <div className="flex items-start gap-2 text-sm muted">
            <Warning size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>JSON 為<strong style={{ color: "var(--ns-fg)" }}>整份資料庫</strong>的完整備份（含帳戶、交易、投資、設定、匯率），不套用下方的時間 / 帳戶 / 欄位篩選。可於「{t("settings.general")}」分頁用此檔還原。</span>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="text-xs" style={{  marginBottom: 10 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>{t("settings.timeRange")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {([
                ["thisMonth", t("settings.thisMonth")],
                ["lastMonth", t("settings.lastMonth")],
                ["ytd", t("settings.ytd")],
                ["lastYear", t("settings.lastYear")],
                ["allTime", t("settings.allTime")],
                ["custom", t("settings.custom")],
              ] as [TimeRangeOption, string][]).map(([id, label]) => (
                <Button key={id} variant="outline" onClick={() => setRange(id)}
                  style={{ borderColor: range === id ? "var(--ns-accent)" : "var(--ns-border)", background: range === id ? "var(--ns-accent-soft)" : "transparent" }}>
                  {label}
                </Button>
              ))}
            </div>
            {range === "custom" && (
              <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                <input type="date" className="ns-input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <span className="muted">→</span>
                <input type="date" className="ns-input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="text-xs" style={{  marginBottom: 10 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>帳戶範圍</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACCOUNT_SCOPES.map((s) => {
                const count = s.types ? accountRows.filter((a) => s.types!.includes(a.type)).length : accountRows.length;
                return (
                  <Button key={s.id} variant="outline" onClick={() => setScope(s.id)}
                    style={{ borderColor: scope === s.id ? "var(--ns-accent)" : "var(--ns-border)", background: scope === s.id ? "var(--ns-accent-soft)" : "transparent" }}>
                    {s.label}<span className="mono muted" style={{ marginLeft: 6, fontSize: 11 }}>{count}</span>
                  </Button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs" style={{  marginBottom: 10 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>{t("settings.includedFields")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {fieldToggles.map((f) => (
                <button key={f.key} type="button" onClick={() => f.set(!f.on)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
                  borderRadius: 99, cursor: "pointer", fontSize: 13, color: "var(--ns-fg)",
                  border: `1px solid ${f.on ? "var(--ns-accent)" : "var(--ns-border)"}`,
                  background: f.on ? "var(--ns-accent-soft)" : "transparent",
                }}>
                  {f.on ? <CheckCircle size={14} weight="bold" /> : <Plus size={14} />}{f.label}
                </button>
              ))}
            </div>
            <p className="text-xs muted mt-3">投資交易與 FX 快照會各自匯出成獨立的 CSV 檔。</p>
          </Card>
        </>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm muted">
            {jsonMode ? "將匯出整份資料庫" : <>預計匯出 <span className="mono font-medium" style={{ color: "var(--ns-fg)" }}>{estimatedCount.toLocaleString()}</span> 筆交易</>}
          </div>
          <Button onClick={runExport} disabled={busy}>
            <DownloadSimple size={14} />{busy ? "匯出中…" : t("settings.export")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─────── General & Export Tab ───────
