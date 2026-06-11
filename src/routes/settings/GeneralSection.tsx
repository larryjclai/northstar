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
import { ConnectStatus, UpdateChecker } from "./ConnectSection";

export function SettingsGeneral({ form, t }: Pick<SettingsTabProps, "form" | "t">) {
  const toast = useToast();
  const [recalculating, setRecalculating] = useState(false);
  const [recalculationSummary, setRecalculationSummary] = useState<string | null>(null);
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  const togglePrivacy = useUiPreferences((state) => state.togglePrivacyMode);
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const setNameLocale = useUiPreferences((state) => state.setNameLocale);
  const theme = useUiPreferences((state) => state.theme);
  const setTheme = useUiPreferences((state) => state.setTheme);
  const timezone = useUiPreferences((state) => state.timezone);
  const setTimezone = useUiPreferences((state) => state.setTimezone);
  const assetLogosEnabled = useUiPreferences((state) => state.assetLogosEnabled);
  const setAssetLogosEnabled = useUiPreferences((state) => state.setAssetLogosEnabled);
  const bankLogosEnabled = useUiPreferences((state) => state.bankLogosEnabled);
  const setBankLogosEnabled = useUiPreferences((state) => state.setBankLogosEnabled);
  const gainLossPalette = useUiPreferences((state) => state.gainLossPalette);
  const setGainLossPalette = useUiPreferences((state) => state.setGainLossPalette);
  const density = useUiPreferences((state) => state.density);
  const setDensity = useUiPreferences((state) => state.setDensity);
  const radius = useUiPreferences((state) => state.radius);
  const setRadius = useUiPreferences((state) => state.setRadius);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // Import restore: stage the chosen file, then confirm inline (window.confirm is
  // a no-op in the Tauri webview, which is why the old import silently did nothing).
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Demo data + reset. window.confirm is a no-op in the Tauri webview, so these
  // use a two-click inline confirm instead.
  const [demoBusy, setDemoBusy] = useState<null | "load" | "clear" | "exit">(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const inDemo = useDemoMode((s) => s.active);
  const setInDemo = useDemoMode((s) => s.set);

  async function handleLoadDemo() {
    setDemoBusy("load");
    try {
      const repository = await getFinanceRepository();
      await enterDemoMode(repository); // non-destructive: stashes real data first
      setInDemo(true);
      await queryClient.invalidateQueries();
      toast.success("已進入示範模式");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "進入示範模式失敗");
    } finally {
      setDemoBusy(null);
    }
  }

  async function handleExitDemo() {
    setDemoBusy("exit");
    try {
      const repository = await getFinanceRepository();
      await exitDemoMode(repository); // restores the stashed real data
      setInDemo(false);
      await queryClient.invalidateQueries();
      toast.success("已結束示範模式，已還原你的資料");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "結束示範模式失敗");
    } finally {
      setDemoBusy(null);
    }
  }

  async function handleClearAll() {
    setDemoBusy("clear");
    try {
      const repository = await getFinanceRepository();
      await clearAllData(repository);
      await queryClient.invalidateQueries();
      toast.success("已清空所有資料");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清空資料失敗");
    } finally {
      setDemoBusy(null);
      setConfirmClear(false);
    }
  }

  async function exportBackup() {
    try {
      const repository = await getFinanceRepository();
      const snapshot = await repository.exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `northstar-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("已匯出");
    } catch (e) {
      toast.error("匯出失敗");
    }
  }

  async function importBackup(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as RepositorySnapshot;
      if (!parsed || !Array.isArray(parsed.accounts)) throw new Error("無效的備份檔（缺少 accounts 欄位）");
      const repository = await getFinanceRepository();
      await repository.importSnapshot(parsed);
      await queryClient.invalidateQueries();
      toast.success("匯入成功，已還原備份資料");
    } catch (e) {
      toast.error(e instanceof Error ? `匯入失敗：${e.message}` : "匯入失敗");
    } finally {
      setImporting(false);
      setPendingImportFile(null);
    }
  }

  async function recalculate() {
    setRecalculating(true);
    try {
      const repository = await getFinanceRepository();
      const report = await repository.recalculateDerivedData();
      await queryClient.invalidateQueries();
      const correctedCount = report.changedAccounts + report.changedAssets;
      const orphanCount = report.orphanLedgerIds.length + report.orphanInvestmentIds.length;
      const summary = `已修正 ${correctedCount} 筆衍生資料。孤兒關聯 ${orphanCount} 筆，不完整轉帳 ${report.incompleteTransferGroupIds.length} 組。${report.missingFxPairs.length ? ` 缺少匯率：${report.missingFxPairs.join("、")}。` : ""}`;
      setRecalculationSummary(summary);
      toast.success(correctedCount ? `已修正 ${correctedCount} 筆資料` : "帳本衍生資料一致");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重新計算失敗");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 style={{fontFamily:'var(--ns-font-display)',fontSize:24,margin:0,fontWeight:600}}>{t('settings.general')}</h2>
        <p className="muted" style={{fontSize:13,marginTop:4,marginBottom:0}}>{t('settings.generalDesc')}</p>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">帳本維護</h3>
        <p className="text-sm muted mb-4">重新依期初餘額、已結算流水與投資紀錄計算衍生資料。這不會新增調整餘額交易。</p>
        <Button onClick={recalculate} disabled={recalculating}>
          <ArrowsClockwise size={14}/>{recalculating ? "重新計算中" : "重新計算帳戶與投資"}
        </Button>
        {recalculationSummary ? <div className="ns-surface mt-3 p-3 text-sm">{recalculationSummary}</div> : null}
      </Card>

      <Card className="p-5">
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Demo</div>
        <h3 className="font-semibold mb-2">示範模式</h3>
        {inDemo ? (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--ns-accent)" }}>
              目前在示範模式。你原本的資料已安全保存，結束後會完整還原。
            </p>
            <Button onClick={handleExitDemo} disabled={demoBusy !== null}>
              <ArrowsClockwise size={14} />{demoBusy === "exit" ? "還原中…" : "結束示範並還原我的資料"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm muted mb-4">載入一組範例帳戶、交易、持股與目標來瀏覽完整畫面或展示。<strong>不會清除你的資料</strong>——進入前會先把你目前的資料安全保存，結束示範時自動還原。</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleLoadDemo} disabled={demoBusy !== null}>
                <Plus size={14} weight="bold" />{demoBusy === "load" ? "進入中…" : "進入示範模式"}
              </Button>
              {confirmClear ? (
                <>
                  <Button variant="outline" style={{ color: "var(--ns-neg)", borderColor: "var(--ns-neg)" }} onClick={handleClearAll} disabled={demoBusy !== null}>
                    {demoBusy === "clear" ? "清空中…" : "確定清空所有資料（無法復原）"}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={demoBusy !== null}>取消</Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setConfirmClear(true)} disabled={demoBusy !== null}>
                  <Trash size={14} />清空所有資料
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-4">{t('settings.privacyMode')}</h3>
        <button
          onClick={togglePrivacy}
          className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition"
          style={{ borderColor: privacyMode ? "var(--ns-accent)" : "var(--ns-border)", background: privacyMode ? "var(--ns-accent-soft)" : "transparent" }}
        >
          {privacyMode ? <EyeSlash size={18} /> : <Eye size={18} />}
          <div>
            <div className="font-medium">{t('settings.privacyMode')} - {privacyMode ? t('settings.privacyModeOn') : t('settings.privacyModeOff')}</div>
            <div className="text-xs muted">{t('settings.privacyModeDesc')}</div>
          </div>
        </button>

        <h3 className="font-semibold mb-4 mt-6">佈景主題</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "system", l: "跟隨系統" },
            { v: "light", l: "淺色" },
            { v: "dark", l: "深色" },
          ].map((option) => (
            <Button
              variant="outline"
              key={option.v}
              onClick={() => setTheme(option.v as ThemeMode)}
              style={{
                borderColor: theme === option.v ? "var(--ns-accent)" : "var(--ns-border)",
                background: theme === option.v ? "var(--ns-accent-soft)" : undefined,
              }}
            >
              {option.l}
            </Button>
          ))}
        </div>
        <p className="text-xs muted mt-2 mb-0">深色和淺色會立即套用；跟隨系統會回到裝置的外觀設定。</p>

        <h3 className="font-semibold mb-4 mt-6">盈虧配色</h3>
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "us", l: "綠漲紅跌", d: "國際慣例" },
            { v: "tw", l: "紅漲綠跌", d: "台股慣例" },
            { v: "neutral", l: "中性色", d: "藍綠／琥珀" },
          ] as const).map((option) => (
            <Button
              variant="outline"
              key={option.v}
              onClick={() => setGainLossPalette(option.v)}
              style={{
                height: "auto", padding: "10px 8px", flexDirection: "column", gap: 4,
                borderColor: gainLossPalette === option.v ? "var(--ns-accent)" : "var(--ns-border)",
                background: gainLossPalette === option.v ? "var(--ns-accent-soft)" : undefined,
              }}
            >
              <span>{option.l}</span>
              <span className="muted" style={{ fontSize: 11 }}>{option.d}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs mt-2 mb-0">
          預覽：<span style={{ color: "var(--ns-gain)", fontWeight: 600 }}>+2.34%</span>
          <span className="muted">（漲）　</span>
          <span style={{ color: "var(--ns-loss)", fontWeight: 600 }}>−1.21%</span>
          <span className="muted">（跌）— 只影響投資損益、報酬率與個股漲跌；現金流收支與成功/錯誤提示維持固定綠/紅。</span>
        </p>

        <h3 className="font-semibold mb-4 mt-6">介面密度</h3>
        <div className="grid grid-cols-4 gap-2">
          {([
            { v: "loose", l: "寬鬆" },
            { v: "default", l: "標準" },
            { v: "medium", l: "適中" },
            { v: "tight", l: "緊湊" },
          ] as const).map((option) => (
            <Button
              variant="outline"
              key={option.v}
              onClick={() => setDensity(option.v)}
              style={{
                borderColor: density === option.v ? "var(--ns-accent)" : "var(--ns-border)",
                background: density === option.v ? "var(--ns-accent-soft)" : undefined,
              }}
            >
              {option.l}
            </Button>
          ))}
        </div>

        <h3 className="font-semibold mb-4 mt-6">圓角</h3>
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "sharp", l: "銳利" },
            { v: "default", l: "標準" },
            { v: "round", l: "圓潤" },
          ] as const).map((option) => (
            <Button
              variant="outline"
              key={option.v}
              onClick={() => setRadius(option.v)}
              style={{
                borderColor: radius === option.v ? "var(--ns-accent)" : "var(--ns-border)",
                background: radius === option.v ? "var(--ns-accent-soft)" : undefined,
              }}
            >
              {option.l}
            </Button>
          ))}
        </div>

        <h3 className="font-semibold mb-4 mt-6">{t('settings.language')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {[{v:'auto',l:'Auto'},{v:'en',l:'English'},{v:'zh-Hant',l:'繁體中文'}].map(o => (
            <Button variant="outline" key={o.v} onClick={()=>setNameLocale(o.v as any)} style={{ borderColor: nameLocale===o.v?'var(--ns-accent)':'var(--ns-border)'}}>
              {o.l}
            </Button>
          ))}
        </div>

        <h3 className="font-semibold mb-4 mt-6">{t('settings.timezone')}</h3>
        <AppSelect
          value={timezone}
          onChange={setTimezone}
          options={COMMON_TIMEZONES.map((tz) => ({ value: tz.id, label: tz.label }))}
          searchPlaceholder="搜尋時區…"
          style={{ width: "100%", height: 40 }}
        />

        <h3 className="font-semibold mb-4 mt-6">投資標的 LOGO</h3>
        <button
          onClick={() => setAssetLogosEnabled(!assetLogosEnabled)}
          className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition"
          style={{ borderColor: assetLogosEnabled ? "var(--ns-accent)" : "var(--ns-border)", background: assetLogosEnabled ? "var(--ns-accent-soft)" : "transparent" }}
        >
          <Globe size={18} />
          <div>
            <div className="font-medium">投資標的品牌 LOGO - {assetLogosEnabled ? "已開啟" : "已關閉"}</div>
            <div className="text-xs muted">開啟後會向第三方服務 (assets.parqet.com) 請求各標的的 LOGO 圖示。<strong style={{ color: "var(--ns-fg)" }}>隱私風險：你持有的股票代號會傳送到該第三方</strong>。關閉時一律顯示本地產生的字母標記，不會發出任何請求。</div>
          </div>
        </button>

        <h3 className="font-semibold mb-4 mt-6">帳戶銀行 LOGO</h3>
        <button
          onClick={() => setBankLogosEnabled(!bankLogosEnabled)}
          className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition"
          style={{ borderColor: bankLogosEnabled ? "var(--ns-accent)" : "var(--ns-border)", background: bankLogosEnabled ? "var(--ns-accent-soft)" : "transparent" }}
        >
          <Bank size={18} />
          <div>
            <div className="font-medium">帳戶銀行 LOGO - {bankLogosEnabled ? "已開啟" : "已關閉"}</div>
            <div className="text-xs muted">開啟後會依帳戶名稱（如「玉山」「國泰」）向 logo 服務 (logo.clearbit.com) 請求銀行 / 券商 LOGO，覆蓋在帳戶圖示上。<strong style={{ color: "var(--ns-fg)" }}>隱私風險：對應的品牌網域會傳送到該第三方</strong>。關閉或無法辨識時顯示你選的圖示。</div>
          </div>
        </button>

        {/* Benchmark 指標已移到「投資 → 分析 → 投資組合 vs 指標」就地切換
            （uiPreferences.benchmarkTicker 同一份設定）。 */}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">{t('settings.backupTitle')}</h3>
        <p className="text-sm muted mb-4">{t('settings.backupDesc')}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportBackup}><DownloadSimple size={14}/>{t('settings.exportJson')}</Button>
          <Button variant="ghost" onClick={()=>fileInputRef.current?.click()} disabled={importing}><UploadSimple size={14}/>{t('settings.importBackup')}</Button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json,application/json" onChange={(e)=>{
            const file = e.target.files?.[0];
            if (file) setPendingImportFile(file);
            e.target.value = '';
          }} />
        </div>
        {pendingImportFile && (
          <div className="ns-surface mt-4 p-3" style={{ border: "1px solid var(--ns-neg)" }}>
            <div className="flex items-start gap-2 mb-3">
              <Warning size={18} style={{ color: "var(--ns-neg)", flexShrink: 0, marginTop: 1 }} />
              <div className="text-sm">
                即將以 <span className="mono font-medium">{pendingImportFile.name}</span> 覆蓋目前<strong>所有</strong>資料，此動作無法復原。建議先按上方「{t('settings.exportJson')}」備份。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" style={{ color: "var(--ns-neg)", borderColor: "var(--ns-neg)" }} disabled={importing} onClick={() => importBackup(pendingImportFile)}>
                <UploadSimple size={14} />{importing ? "匯入中…" : "確定匯入（覆蓋現有資料）"}
              </Button>
              <Button variant="ghost" disabled={importing} onClick={() => setPendingImportFile(null)}>取消</Button>
            </div>
          </div>
        )}
        <p className="text-xs muted mt-3">想要 CSV / 篩選範圍的匯出，請到上方「{t('settings.export')}」分頁。</p>
      </Card>

      <UpdateChecker />
      <ConnectStatus />
    </div>
  );
}

// ─────── Connect Sync ───────

