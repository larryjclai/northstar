import { ArrowsClockwise, CheckCircle, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, PencilSimple, Plus, Sparkle, Storefront, Tag, Trash, UploadSimple, UsersThree, X, CaretDown, CaretRight, Backspace, Gear, Bank, Target, DeviceMobile, Desktop, Spinner, WifiHigh, CopySimple, QrCode, Warning } from "@phosphor-icons/react";
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
  generateDeviceSecret, saveDeviceSecret,
  type SyncAccount,
} from "../../features/connect/sync/account";
import {
  generateVaultKey, saveVaultKey, loadVaultKey,
} from "../../features/connect/crypto/vault";
import {
  registerUser, listDevices, revokeDevice, addDevice,
  isSyncWorkerConfigured,
  type DeviceRecord,
} from "../../features/connect/sync/client";
import {
  startJoinSession, completeJoin, inspectJoinRequest, approveJoiningDevice,
  type JoinSession, type PendingJoinApproval,
} from "../../features/connect/sync/pairing-flow";
import { runSync, forceFullResync, forceFullRepush } from "../../features/connect/sync/sync-manager";
import { clearLocalSyncState, unlinkSync } from "../../features/connect/sync/reset";
import { summarizeConflict } from "../../features/connect/sync/conflictSummary";
import { listBackups, restoreBackup, type BackupEntry } from "../../features/connect/sync/backup";
import { updateFailureMessage } from "../../features/updater/errors";
import { useSyncStatus } from "../../state/syncStatus";
import {
  generateRecoveryKit, confirmRecoveryKit, downloadRecoveryKit,
  restoreFromRecoveryKit, loadLocalRecoveryKitStatus, type LocalRecoveryKitStatus,
} from "../../features/connect/crypto/recovery-kit";

function getDevicePlatform(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "windows";
  if (ua.includes("Linux")) return "linux";
  return "macos";
}

function PlatformIcon({ platform }: { platform: string }) {
  return platform === "ios" || platform === "android"
    ? <DeviceMobile size={14} />
    : <Desktop size={14} />;
}

function formatRelativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 10) return "剛剛";
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return new Date(iso).toLocaleDateString("zh-Hant");
}

/** Live "X 秒前" label that re-renders every 10s while mounted. */
function RelativeTime({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  return <>{formatRelativeTime(iso, now)}</>;
}

export function ConnectStatus() {
  const toast = useToast();
  const syncWorkerConfigured = isSyncWorkerConfigured();
  const [identity] = useState(() => getOrCreateDeviceIdentity());
  const [account, setAccount] = useState<SyncAccount | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadSyncAccount().then(acc => {
      setAccount(acc);
      setIsReady(true);
    });
  }, []);

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Dialog: add device
  const [showDialog, setShowDialog] = useState(false);

  // Recovery Kit
  const [kitStatus, setKitStatus] = useState<LocalRecoveryKitStatus | null>(() => loadLocalRecoveryKitStatus());
  const [kitCode, setKitCode] = useState<string | null>(null);
  const [kitLoading, setKitLoading] = useState(false);

  // Recovery Kit restore (all-devices-lost path): enter the saved code to
  // bring the original vault key back onto this device.
  const [showRestore, setShowRestore] = useState(false);
  const [restoreCode, setRestoreCode] = useState("");
  const [restoreLoading, setRestoreLoading] = useState(false);

  async function handleRestoreKit() {
    setRestoreLoading(true);
    try {
      await restoreFromRecoveryKit(restoreCode);
      setKitStatus(loadLocalRecoveryKitStatus());
      setShowRestore(false);
      setRestoreCode("");
      toast.success("加密金鑰已還原。接著「啟用同步」即可沿用原金鑰繼續使用。");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "備援碼還原失敗");
    } finally {
      setRestoreLoading(false);
    }
  }

  // Sync status + backups
  const syncStatus = useSyncStatus();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [showBackups, setShowBackups] = useState(false);
  const queryClient = useQueryClient();

  // Device removal: inline two-click confirm (window.confirm is unsupported in
  // the Tauri webview, so the original confirm()-gated handler did nothing).
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  // Force-full-resync inline confirm (window.confirm is a no-op in Tauri webview).
  const [confirmFullResync, setConfirmFullResync] = useState(false);
  const [confirmFullRepush, setConfirmFullRepush] = useState(false);

  // Unlink sync (keeps data) — two-click confirm, no data loss.
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Full data reset (unlink + wipe data) inline confirm (window.confirm is a
  // no-op in Tauri webview). Requires typing "delete" before the wipe can run.
  const [confirmDeviceReset, setConfirmDeviceReset] = useState(false);
  const [deviceResetText, setDeviceResetText] = useState("");
  const deviceResetConfirmed = deviceResetText.trim().toLowerCase() === "delete";

  function closeDeviceReset() {
    setConfirmDeviceReset(false);
    setDeviceResetText("");
  }

  // Load backups list when panel opens
  useEffect(() => {
    if (!showBackups) return;
    listBackups().then(setBackups).catch(() => setBackups([]));
  }, [showBackups]);

  // Joining device (B): publish this device's public key, show the code, and
  // poll until the existing device wraps the vault key to us.
  const [session, setSession] = useState<JoinSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [joinWaiting, setJoinWaiting] = useState(false);

  // Approving device (A): enter B's code, confirm the device, wrap the vault key.
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingJoinApproval | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [joinDeviceName, setJoinDeviceName] = useState(() => `My ${getDevicePlatform() === "windows" ? "PC" : "Mac"}`);

  // Load pending changes count
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const repo = await getFinanceRepository();
        const [result, conflicts] = await Promise.all([
          repo.collectPendingChanges(identity.localPushCursor),
          repo.listSyncConflicts(),
        ]);
        if (active) {
          setPending(result.count);
          setConflicts(conflicts.filter((conflict) => conflict.resolvedAt === null));
        }
      } catch {
        if (active) {
          setPending(null);
          setConflicts(null);
        }
      }
    })();
    return () => { active = false; };
  }, [identity.localPushCursor, syncStatus.lastSyncAt]);

  async function resolveConflict(id: string, strategy: "keepLocal" | "useIncoming") {
    try {
      const repo = await getFinanceRepository();
      await repo.resolveSyncConflict(id, strategy);
      setConflicts((current) => current?.filter((conflict) => conflict.id !== id) ?? []);
      await queryClient.invalidateQueries();
      toast.success(strategy === "keepLocal" ? "已保留本機版本，將於下次同步推送" : "已採用遠端版本");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "處理同步衝突失敗");
    }
  }

  async function resolveAllConflicts(strategy: "keepLocal" | "useIncoming") {
    const pending = conflicts ?? [];
    if (pending.length === 0) return;
    try {
      const repo = await getFinanceRepository();
      // Resolve sequentially — the SQLite repo serialises writes, and conflicts
      // are rare now that routine divergences auto-resolve on pull.
      for (const conflict of pending) {
        await repo.resolveSyncConflict(conflict.id, strategy);
      }
      setConflicts([]);
      await queryClient.invalidateQueries();
      toast.success(strategy === "keepLocal" ? `已全部保留本機（${pending.length} 筆）` : `已全部採用遠端（${pending.length} 筆）`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批次處理同步衝突失敗");
      // Refresh so the list reflects whatever did resolve before the error.
      try {
        const repo = await getFinanceRepository();
        setConflicts((await repo.listSyncConflicts()).filter((c) => c.resolvedAt === null));
      } catch { /* leave list as-is */ }
    }
  }

  // Load device list when account is active
  useEffect(() => {
    if (!account) return;
    listDevices(account.apiSecret).then(setDevices).catch(() => {});
  }, [account]);

  // Countdown timer for pairing session
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setSession(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  // Joining device (B): poll the relay until the existing device (A) approves
  // this device and deposits the wrapped vault key + account secret.
  useEffect(() => {
    if (!session) { setJoinWaiting(false); return; }
    let active = true;
    setJoinWaiting(true);
    const poll = async () => {
      try {
        const result = await completeJoin(session);
        if (!active || !result) return; // A hasn't approved yet — keep polling.
        clearInterval(id);
        setJoinWaiting(false);
        const joined = await loadSyncAccount();
        if (joined) setAccount(joined);
        setKitStatus(loadLocalRecoveryKitStatus());
        setShowDialog(false);
        setSession(null);
        toast.success("裝置已加入，正在下載資料…");
        try {
          syncStatus.setPhase("pulling");
          const repo = await getFinanceRepository();
          const r = await forceFullResync(repo);
          syncStatus.setSyncDone(r.pushed, r.pulled, r.applied);
          await queryClient.invalidateQueries();
          toast.success(r.applied > 0 ? `已下載並套用 ${r.applied} 筆資料` : "已加入同步（伺服器目前沒有可下載的資料）");
        } catch (pullErr) {
          const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);
          console.error("[sync] post-join resync failed:", pullErr);
          syncStatus.setError(msg);
          toast.error("已加入同步，但自動下載失敗，請稍後在設定按「完整重新下載」。");
        }
      } catch (e) {
        console.error("[pairing] poll failed:", e);
      }
    };
    const id = setInterval(poll, 2000);
    void poll();
    return () => { active = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── First-time setup ──
  async function handleSetup() {
    if (!syncWorkerConfigured) {
      toast.error("這個 build 未設定同步服務 endpoint，無法啟用 Connect 同步。");
      return;
    }
    setLoading(true);
    try {
      // Reuse an existing vault key (e.g. just restored from a Recovery Kit)
      // so re-enabling sync keeps previously-encrypted data decryptable.
      const vaultKey = (await loadVaultKey()) ?? (await generateVaultKey());
      await saveVaultKey(vaultKey);

      const newAccount = await getOrCreateSyncAccount();
      const hash = await sha256Hex(newAccount.apiSecret);
      // Mint this first device's own relay credential (Plan 132). Only the hash
      // is registered; the secret is persisted locally after /users succeeds.
      const deviceSecret = generateDeviceSecret();
      const deviceSecretHash = await sha256Hex(deviceSecret);
      await registerUser({
        userId: newAccount.userId,
        apiSecretHash: hash,
        device: {
          id: identity.deviceId,
          name: joinDeviceName,
          platform: getDevicePlatform(),
          secretHash: deviceSecretHash,
        },
      });
      await saveDeviceSecret(deviceSecret);
      setAccount(newAccount);
      const devs = await listDevices(newAccount.apiSecret);
      setDevices(devs);
      toast.success("同步已啟用");
    } catch (e) {
      toast.error("啟用失敗，請稍後再試");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Joining device (B): publish this device's public key + show the code ──
  async function handleStartJoin() {
    if (!syncWorkerConfigured) {
      toast.error("這個 build 未設定同步服務 endpoint，無法產生配對碼。");
      return;
    }
    if (!joinDeviceName.trim()) return;
    setSessionLoading(true);
    try {
      const s = await startJoinSession(joinDeviceName.trim(), getDevicePlatform());
      setSession(s); // triggers the polling effect
    } catch (e) {
      toast.error("無法產生配對碼，請確認網路連線");
      console.error(e);
    } finally {
      setSessionLoading(false);
    }
  }

  // ── Approving device (A), step 1: claim B's public key + show the fingerprint ──
  async function handleInspect() {
    if (!syncWorkerConfigured) {
      setJoinError("這個 build 未設定同步服務 endpoint，無法配對。");
      return;
    }
    setJoinError(null);
    setJoinLoading(true);
    try {
      const approval = await inspectJoinRequest(joinCode);
      setPendingApproval(approval); // shows the confirm-device step
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "找不到這組配對碼，請確認是否正確或已過期。");
    } finally {
      setJoinLoading(false);
    }
  }

  // ── Approving device (A), step 2: after the user confirms, wrap the vault key ──
  async function handleApprove() {
    if (!account || !pendingApproval) return;
    setApproveLoading(true);
    try {
      await approveJoiningDevice(pendingApproval);
      const devs = await listDevices(account.apiSecret);
      setDevices(devs);
      setShowDialog(false);
      setPendingApproval(null);
      setJoinCode("");
      toast.success(`已授權新裝置「${pendingApproval.name}」，對方將自動完成加入。`);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "授權裝置失敗，請稍後再試。");
      console.error(e);
    } finally {
      setApproveLoading(false);
    }
  }

  function handleCancelApprove() {
    setPendingApproval(null);
    setJoinError(null);
  }

  // ── Revoke device ──
  async function handleRevoke(deviceId: string) {
    if (!account) return;
    try {
      await revokeDevice(account.apiSecret, deviceId);
      setDevices(d => d.filter(dev => dev.id !== deviceId));
      setConfirmRevokeId(null);
      toast.success("裝置已移除");
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "移除失敗";
      console.error("[connect] revoke device failed:", e);
      toast.error("移除失敗：" + msg);
    }
  }

  // ── Recovery Kit ──
  async function handleGenerateKit() {
    if (!account) return;
    setKitLoading(true);
    try {
      const code = await generateRecoveryKit();
      setKitCode(code);
      setKitStatus(loadLocalRecoveryKitStatus());
    } catch (e) {
      toast.error("無法產生備援碼");
    } finally {
      setKitLoading(false);
    }
  }

  function handleDownloadKit() {
    if (!kitCode || !account) return;
    downloadRecoveryKit(kitCode, account.userId);
  }

  function handleConfirmKit() {
    confirmRecoveryKit();
    setKitStatus(loadLocalRecoveryKitStatus());
    setKitCode(null);
    toast.success("備援碼已確認儲存");
  }

  // ── Manual sync ──
  async function handleManualSync() {
    if (syncStatus.phase === "pushing" || syncStatus.phase === "pulling") return;
    if (!syncWorkerConfigured) {
      syncStatus.setError("這個 build 未設定同步服務 endpoint，無法同步。");
      return;
    }
    if (!kitStatus?.confirmedAt) {
      toast.error("請先備份並確認 Recovery Kit 才能開始同步");
      return;
    }
    syncStatus.setPhase("pushing");
    try {
      const repo = await getFinanceRepository();
      syncStatus.setPhase("pulling");
      const result = await runSync(repo);
      syncStatus.setSyncDone(result.pushed, result.pulled, result.applied);
      await queryClient.invalidateQueries();
      if (result.skipped > 0) {
        toast.error(`同步完成，但有 ${result.skipped} 筆資料無法解密／格式不符而略過。若資料仍不完整，請試「完整重新下載」。`);
      }
    } catch (e) {
      // Tauri plugin errors can be plain strings, not Error instances
      const msg = e instanceof Error ? e.message
        : typeof e === "string" ? e
        : (e as { message?: string })?.message ?? JSON.stringify(e) ?? "同步失敗";
      console.error("[sync] manual sync failed:", e);
      syncStatus.setError(msg);
    }
  }

  // ── Force full re-download (recovery for a wiped/reinstalled device) ──
  // Two-click inline confirm because window.confirm is a no-op in the Tauri webview.
  async function handleForceFullResync() {
    if (syncStatus.phase === "pushing" || syncStatus.phase === "pulling") return;
    setConfirmFullResync(false);
    syncStatus.setPhase("pulling");
    try {
      const repo = await getFinanceRepository();
      const result = await forceFullResync(repo);
      syncStatus.setSyncDone(result.pushed, result.pulled, result.applied);
      await queryClient.invalidateQueries();
      if (result.applied > 0) {
        toast.success(
          `已從伺服器完整重新下載，套用 ${result.applied} 筆` +
            (result.skipped > 0 ? `（略過 ${result.skipped} 筆無法解密／格式不符）` : ""),
        );
      } else if (result.reason === "empty-relay") {
        toast.error("伺服器沒有可下載的資料。請確認這台裝置已配對到正確的同步帳號（設定 → 新增裝置 / 我有配對碼）。");
      } else {
        toast.success(`已是最新狀態，沒有需要套用的變更（伺服器 ${result.pulled} 筆都已存在）。`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message
        : typeof e === "string" ? e
        : (e as { message?: string })?.message ?? JSON.stringify(e) ?? "重新下載失敗";
      console.error("[sync] force full resync failed:", e);
      syncStatus.setError(msg);
    }
  }

  // ── Force full re-upload (recovery when the SERVER is missing records this
  //    device has — e.g. accounts that were never re-pushed after a re-pair) ──
  async function handleForceFullRepush() {
    if (syncStatus.phase === "pushing" || syncStatus.phase === "pulling") return;
    setConfirmFullRepush(false);
    syncStatus.setPhase("pushing");
    try {
      const repo = await getFinanceRepository();
      const result = await forceFullRepush(repo);
      syncStatus.setSyncDone(result.pushed, result.pulled, result.applied);
      await queryClient.invalidateQueries();
      toast.success(`已重新上傳本機資料（${result.pushed} 筆）到伺服器，其他裝置同步後即可取得。`);
    } catch (e) {
      const msg = e instanceof Error ? e.message
        : typeof e === "string" ? e
        : (e as { message?: string })?.message ?? JSON.stringify(e) ?? "重新上傳失敗";
      console.error("[sync] force full repush failed:", e);
      syncStatus.setError(msg);
    }
  }

  // ── Unlink sync (keeps financial data) ──
  async function handleUnlinkSync() {
    setConfirmUnlink(false);
    try {
      const repo = await getFinanceRepository();
      await unlinkSync(repo);
      await queryClient.invalidateQueries();
      // Drop back to "sync not set up" in the UI; financial data stays.
      setAccount(null);
      setDevices([]);
      setKitStatus(null);
      toast.success("已解除同步。資料保留在本機，可隨時重新「啟用同步」。");
    } catch (e) {
      toast.error("解除同步失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ── Full data reset (unlink + wipe data) ──
  async function handleDeviceReset() {
    if (!deviceResetConfirmed) return;
    closeDeviceReset();
    try {
      const repo = await getFinanceRepository();
      await clearLocalSyncState(repo);
      await queryClient.invalidateQueries();
      // Drop back to first-run state in the UI.
      setAccount(null);
      setDevices([]);
      setKitStatus(null);
      toast.success("已完整重設此裝置。可重新「啟用同步」或用配對碼／備援碼還原。");
    } catch (e) {
      toast.error("重設失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ── Restore backup ──
  // Two-click confirm via confirmRestoreTs — window.confirm is a no-op in
  // the Tauri webview, so the old guard silently blocked every restore.
  const [confirmRestoreTs, setConfirmRestoreTs] = useState<string | null>(null);

  async function handleRestore(timestamp: string) {
    setConfirmRestoreTs(null);
    try {
      const repo = await getFinanceRepository();
      await restoreBackup(timestamp, repo);
      await queryClient.invalidateQueries();
      toast.success("已還原備份");
      setShowBackups(false);
    } catch (e) {
      toast.error("還原失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // mode "show"    → joining device (B): show this device's code and wait.
  // mode "approve" → existing device (A): enter the joiner's code and confirm it.
  function openDialog(mode: "show" | "approve") {
    setSession(null);
    setJoinCode("");
    setJoinError(null);
    setPendingApproval(null);
    setShowDialog(true);
    if (mode === "show") void handleStartJoin();
  }

  const codeDisplay = session
    ? session.code.slice(0, 4) + " – " + session.code.slice(5)
    : "——";

  if (!isReady) {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[200px]">
        <Spinner size={24} className="animate-spin" style={{ color: "var(--ns-fg-muted)" }} />
      </Card>
    );
  }

  // ── Not yet set up ──
  if (!account) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="font-semibold">Connect 同步</h3>
        </div>
        <p className="text-sm muted mb-4">
          啟用後，你的財務資料會以端對端加密的方式同步到你的其他裝置。資料加密後才離開裝置，伺服器看不到任何明文。
        </p>
        {!syncWorkerConfigured && (
          <div className="text-xs flex items-start gap-2 mb-3.5" style={{ padding: "10px 12px", borderRadius: "var(--ns-r-sm)",
            background: "var(--ns-warn-soft, var(--ns-bg-hover))", color: "var(--ns-warn, #b45309)" }}>
            <Warning size={15} weight="fill" className="shrink-0" style={{ marginTop: 1 }} />
            <span>這個 build 未設定同步服務 endpoint；Connect 同步目前停用。本機記帳與匯出功能不受影響。</span>
          </div>
        )}
        <div className="mb-3.5">
          <label className="text-caption block" style={{ color: "var(--ns-fg-muted)", marginBottom: 5 }}>這台裝置的名稱</label>
          <input
            className="ns-input"
            style={{ maxWidth: 260 }}
            value={joinDeviceName}
            onChange={e => setJoinDeviceName(e.target.value)}
            placeholder="My Mac"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSetup} disabled={loading || !joinDeviceName.trim() || !syncWorkerConfigured}>
            {loading ? <Spinner size={14} className="animate-spin" /> : <WifiHigh size={14} />}
            {loading ? "啟用中…" : "啟用同步"}
          </Button>
          <Button variant="ghost" onClick={() => openDialog("show")} disabled={!syncWorkerConfigured || !joinDeviceName.trim()}>
            以配對碼加入現有裝置
          </Button>
          <Button variant="ghost" onClick={() => setShowRestore(!showRestore)}>
            <Key size={14} />用備援碼還原
          </Button>
        </div>

        {/* Recovery Kit restore — for when every paired device is gone but the
            user still has the printed/downloaded Recovery Kit code. */}
        {showRestore && (
          <div className="mt-3.5" style={{ padding: "12px 14px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)" }}>
            <p className="text-xs muted mb-2">
              輸入當初儲存的備援碼（8 組、每組 8 個字元）即可還原加密金鑰。還原後再按「啟用同步」，新帳號會沿用原金鑰，舊的加密備份仍可解密。
            </p>
            <input
              className="ns-input mono text-xs w-full mb-2"
              style={{ letterSpacing: 0.5 }}
              value={restoreCode}
              onChange={(e) => setRestoreCode(e.target.value)}
              placeholder="XXXXXXXX-XXXXXXXX-…（可含連字號或空白）"
              autoComplete="off"
              spellCheck={false}
            />
            <Button onClick={handleRestoreKit} disabled={restoreLoading || !restoreCode.trim()}>
              {restoreLoading ? <Spinner size={14} className="animate-spin" /> : <Key size={14} />}
              {restoreLoading ? "還原中…" : "還原金鑰"}
            </Button>
          </div>
        )}

        {/* Joining device (B): show this device's code and wait for approval. */}
        {showDialog && (
          <AddDeviceDialog
            mode="show"
            onClose={() => { setShowDialog(false); setSession(null); }}
            session={session}
            sessionLoading={sessionLoading}
            secondsLeft={secondsLeft}
            codeDisplay={codeDisplay}
            joinWaiting={joinWaiting}
            onRegenerate={handleStartJoin}
            joinCode={joinCode}
            onJoinCodeChange={setJoinCode}
            joinLoading={joinLoading}
            joinError={joinError}
            onInspect={handleInspect}
            pendingApproval={pendingApproval}
            approveLoading={approveLoading}
            onApprove={handleApprove}
            onCancelApprove={handleCancelApprove}
          />
        )}
      </Card>
    );
  }

  // ── Active ──
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Connect 同步</h3>
          {!syncWorkerConfigured && (
            <Badge variant="outline" className="rounded-full text-micro" style={{background: "var(--ns-warn-soft, var(--ns-bg-hover))", color: "var(--ns-warn, #b45309)" }}>未設定服務</Badge>
          )}
          {kitStatus?.confirmedAt ? (
            <Badge variant="outline" className="rounded-full text-micro" style={{background: "var(--ns-pos-soft)", color: "var(--ns-pos)" }}>已啟用</Badge>
          ) : (
            <Badge variant="outline" className="rounded-full text-micro" style={{background: "var(--ns-warn-soft, var(--ns-bg-hover))", color: "var(--ns-warn, #b45309)" }}>待備份備援碼</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="text-xs"
            onClick={handleManualSync}
            title={!kitStatus?.confirmedAt ? "請先備份並確認 Recovery Kit" : undefined}
            disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling" || !kitStatus?.confirmedAt || !syncWorkerConfigured}>
            <ArrowsClockwise size={13} style={{ animation: (syncStatus.phase === "pushing" || syncStatus.phase === "pulling") ? "spin 1s linear infinite" : undefined }} />
            {syncStatus.phase === "pushing" ? "上傳中…" : syncStatus.phase === "pulling" ? "下載中…" : "立即同步"}
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => openDialog("approve")} disabled={!syncWorkerConfigured}>
            <Plus size={13} />新增裝置
          </Button>
        </div>
      </div>

      {/* Recovery Kit gate — sync is blocked until the kit is confirmed */}
      {!kitStatus?.confirmedAt && (
        <div className="text-xs flex items-start gap-2 mb-2.5" style={{ padding: "10px 12px", borderRadius: "var(--ns-r-sm)",
          background: "var(--ns-warn-soft, var(--ns-bg-hover))", color: "var(--ns-warn, #b45309)" }}>
          <Warning size={15} weight="fill" className="shrink-0" style={{ marginTop: 1 }} />
          <span>同步尚未啟動。請先在下方「Recovery Kit 備援碼」產生並確認備份 —— 這是萬一所有裝置遺失時還原加密資料的唯一方法，確認後才會開始自動同步。</span>
        </div>
      )}

      {/* Sync status bar */}
      {(syncStatus.phase !== "idle" || syncStatus.lastSyncAt) && (
        <div className="text-caption flex items-center gap-1.5 mb-2.5" style={{ padding: "7px 10px", borderRadius: "var(--ns-r-sm)",
          background: syncStatus.phase === "error" ? "var(--ns-neg-soft)" : "var(--ns-bg-hover)",
          color: syncStatus.phase === "error" ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
          {syncStatus.phase === "pushing" || syncStatus.phase === "pulling" ? (
            <><Spinner size={13} className="animate-spin shrink-0" /><span>{syncStatus.phase === "pushing" ? "上傳變更中…" : "下載並套用中…"}</span></>
          ) : syncStatus.phase === "error" ? (
            <><Warning size={13} weight="fill" className="shrink-0" /><span>{syncStatus.error}</span></>
          ) : syncStatus.phase === "done" ? (
            <><CheckCircle size={13} weight="fill" className="shrink-0" style={{ color: "var(--ns-pos)" }} /><span>{`已同步：上傳 ${syncStatus.lastPushed} 筆，下載並套用 ${syncStatus.lastApplied} 筆`}</span></>
          ) : syncStatus.lastSyncAt ? (
            <span>上次同步：<RelativeTime iso={syncStatus.lastSyncAt} /></span>
          ) : null}
        </div>
      )}

      {/* Stats */}
      <div className="text-body gap-3 mb-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        <Stat label="待同步" value={pending === null ? "—" : `${pending} 筆`} />
        <Stat label="待檢查衝突" value={conflicts === null ? "—" : `${conflicts.length} 筆`} />
        <Stat label="上次同步" value={syncStatus.lastSyncAt ? syncStatus.lastSyncAt.slice(0, 10) : "尚未同步"} mono />
        <Stat label="裝置 ID" value={identity.deviceId.slice(0, 8) + "…"} mono />
      </div>

      {conflicts?.length ? (
        <div className="mb-4 rounded-md border p-3" style={{ borderColor: "var(--ns-neg)", background: "var(--ns-neg-soft)" }}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">同步衝突中心 · {conflicts.length} 筆</span>
            <span className="flex gap-1">
              <Button variant="ghost" className="text-caption" onClick={() => resolveAllConflicts("keepLocal")}>全部保留本機</Button>
              <Button variant="ghost" className="text-caption" onClick={() => resolveAllConflicts("useIncoming")}>全部採用遠端</Button>
            </span>
          </div>
          <div className="mb-2 text-xs" style={{ color: "var(--ns-fg-muted)" }}>
            兩台裝置在同一時間改了同一筆資料，無法自動判斷。請逐筆或批次選擇要保留哪一版。
          </div>
          <div className="space-y-2">
            {conflicts.map((conflict) => {
              const summary = summarizeConflict(conflict);
              return (
                <div key={conflict.id} className="rounded-md border p-2.5 text-xs" style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg-card)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="rounded-full text-micro shrink-0">{summary.entityLabel}</Badge>
                      <span className="font-semibold truncate" title={summary.title}>{summary.title}</span>
                      <span className="shrink-0" style={{ color: "var(--ns-fg-muted)" }}>
                        {summary.newer === "tie" ? "兩版同時間" : summary.newer === "local" ? "本機較新" : "遠端較新"}
                      </span>
                    </span>
                    <span className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" className="text-caption" onClick={() => resolveConflict(conflict.id, "keepLocal")}>保留本機</Button>
                      <Button variant="ghost" className="text-caption" onClick={() => resolveConflict(conflict.id, "useIncoming")}>採用遠端</Button>
                    </span>
                  </div>
                  {summary.diffs.length > 0 ? (
                    <div className="mt-2 space-y-0.5" style={{ color: "var(--ns-fg-muted)" }}>
                      {summary.diffs.slice(0, 5).map((diff) => (
                        <div key={diff.key} className="flex flex-wrap items-baseline gap-1.5">
                          <span style={{ minWidth: 56 }}>{diff.label}</span>
                          <span className="mono">本機 {diff.local}</span>
                          <CaretRight size={10} />
                          <span className="mono">遠端 {diff.incoming}</span>
                        </div>
                      ))}
                      {summary.diffs.length > 5 ? <div>…還有 {summary.diffs.length - 5} 個欄位不同</div> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 mb-6">
        {/* Recovery: re-download */}
        <Card className="flex flex-col p-4 bg-[var(--ns-bg-hover)] border-[var(--ns-border)]">
          <div className="flex items-center gap-2 mb-2 font-medium">
            <ArrowsClockwise size={16} /> 完整重新下載
          </div>
          <p className="text-caption text-[var(--ns-fg-muted)] mb-4 flex-1">
            資料遺失或換新裝置？從伺服器完整重新下載所有資料（只下載、不會覆蓋伺服器）。
          </p>
          <div className="flex justify-end">
            {confirmFullResync ? (
              <div className="flex gap-2 items-center">
                <Button variant="ghost" className="text-xs" onClick={() => setConfirmFullResync(false)}>取消</Button>
                <Button variant="outline" className="text-xs" onClick={handleForceFullResync} disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling"}>確認重新下載</Button>
              </div>
            ) : (
              <Button variant="outline" className="text-xs w-full justify-center" onClick={() => setConfirmFullResync(true)} disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling"}>
                <ArrowsClockwise size={13} />完整重新下載
              </Button>
            )}
          </div>
        </Card>

        {/* Recovery: re-upload */}
        <Card className="flex flex-col p-4 bg-[var(--ns-bg-hover)] border-[var(--ns-border)]">
          <div className="flex items-center gap-2 mb-2 font-medium">
            <UploadSimple size={16} /> 重新上傳本機資料
          </div>
          <p className="text-caption text-[var(--ns-fg-muted)] mb-4 flex-1">
            把這台裝置的全部資料重新上傳到伺服器，其他裝置再「完整重新下載」即可補齊。
          </p>
          <div className="flex justify-end">
            {confirmFullRepush ? (
              <div className="flex gap-2 items-center">
                <Button variant="ghost" className="text-xs" onClick={() => setConfirmFullRepush(false)}>取消</Button>
                <Button variant="outline" className="text-xs" onClick={handleForceFullRepush} disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling"}>確認重新上傳</Button>
              </div>
            ) : (
              <Button variant="outline" className="text-xs w-full justify-center" onClick={() => setConfirmFullRepush(true)} disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling"}>
                <UploadSimple size={13} />重新上傳本機資料
              </Button>
            )}
          </div>
        </Card>

        {/* Unlink sync */}
        <Card className="flex flex-col p-4 bg-[var(--ns-bg-hover)] border-[var(--ns-border)]">
          <div className="flex items-center gap-2 mb-2 font-medium" style={{ color: "var(--ns-warn)" }}>
            <WifiHigh size={16} /> 解除同步
          </div>
          <p className="text-caption text-[var(--ns-fg-muted)] mb-4 flex-1">
            將這台裝置從同步帳號移除，<strong>保留本機財務資料</strong>。伺服器資料不受影響。
          </p>
          <div className="flex justify-end">
            {confirmUnlink ? (
              <div className="flex gap-2 items-center">
                <Button variant="ghost" className="text-xs" onClick={() => setConfirmUnlink(false)}>取消</Button>
                <Button variant="outline" className="text-xs" style={{ color: "var(--ns-warn)", borderColor: "var(--ns-warn)" }} onClick={handleUnlinkSync}>確認解除</Button>
              </div>
            ) : (
              <Button variant="outline" className="text-xs w-full justify-center" style={{ color: "var(--ns-warn)", borderColor: "var(--ns-warn)" }} onClick={() => setConfirmUnlink(true)}>
                <WifiHigh size={13} />解除同步
              </Button>
            )}
          </div>
        </Card>

        {/* Full data reset */}
        <Card className="flex flex-col p-4" style={{ background: "var(--ns-neg-soft)", border: "1px solid var(--ns-neg)" }}>
          <div className="flex items-center gap-2 mb-2 font-medium" style={{ color: "var(--ns-neg)" }}>
            <Trash size={16} /> 完整重設資料
          </div>
          <p className="text-caption text-[var(--ns-fg-muted)] mb-4 flex-1">
            清除本機<strong>所有財務資料</strong>與同步設定。伺服器資料不受影響。此動作無法復原。
          </p>
          <div>
            {confirmDeviceReset ? (
              <div className="flex flex-col gap-2">
                <input
                  className="ns-input text-xs w-full text-center"
                  value={deviceResetText}
                  onChange={(e) => setDeviceResetText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && deviceResetConfirmed) handleDeviceReset(); if (e.key === "Escape") closeDeviceReset(); }}
                  placeholder="輸入 delete 確認"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="ghost" className="text-xs flex-1" onClick={closeDeviceReset}>取消</Button>
                  <Button variant="outline" className="text-xs flex-1" style={{ color: "var(--ns-neg)", borderColor: "var(--ns-neg)", opacity: deviceResetConfirmed ? 1 : 0.5 }} disabled={!deviceResetConfirmed} onClick={handleDeviceReset}>
                    <Trash size={13} />確認重設
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="text-xs w-full justify-center" style={{ color: "var(--ns-neg)", borderColor: "var(--ns-neg)" }} onClick={() => setConfirmDeviceReset(true)}>
                <Trash size={13} />完整重設資料
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Device list */}
      <div className="text-caption uppercase mb-2" style={{ color: "var(--ns-fg-dim)", letterSpacing: 0.06, fontFamily: "var(--ns-font-mono)" }}>
        已信任裝置 · {devices.length}
      </div>
      <div className="flex flex-col gap-1.5">
        {devices.map(dev => (
          <div key={dev.id} className="flex items-center gap-2.5" style={{
            padding: "10px 14px", borderRadius: "var(--ns-r-md)",
            background: dev.id === identity.deviceId ? "var(--ns-accent-soft)" : "var(--ns-bg-hover)",
            border: dev.id === identity.deviceId ? "1px solid var(--ns-accent)" : "1px solid transparent",
          }}>
            <PlatformIcon platform={dev.platform} />
            <div className="flex-1">
              <div className="text-body font-medium">{dev.name}</div>
              <div className="mono muted text-micro">{dev.id.slice(0, 8)}… · {dev.platform}</div>
            </div>
            {dev.id === identity.deviceId
              ? <span className="text-caption" style={{ color: "var(--ns-fg-muted)" }}>本機</span>
              : confirmRevokeId === dev.id
                ? <div className="flex gap-1.5 items-center">
                    <Button variant="ghost" className="text-caption" style={{ padding: "4px 8px" }} onClick={() => setConfirmRevokeId(null)}>取消</Button>
                    <Button variant="outline" className="text-caption" style={{ padding: "4px 8px", color: "var(--ns-neg)", borderColor: "var(--ns-neg)" }} onClick={() => handleRevoke(dev.id)}>確認移除</Button>
                  </div>
                : <Button variant="ghost" size="icon-sm" aria-label="移除裝置" style={{ color: "var(--ns-neg)", padding: "4px 6px" }} onClick={() => setConfirmRevokeId(dev.id)}>
                    <Trash size={13} />
                  </Button>
            }
          </div>
        ))}
      </div>

      {/* Recovery Kit */}
      <div className="mt-5" style={{ paddingTop: 18, borderTop: "1px solid var(--ns-border)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className="text-body font-semibold">備援碼</div>
            {kitStatus?.confirmedAt
              ? <Badge variant="outline" className="rounded-full text-micro" style={{background: "var(--ns-pos-soft)", color: "var(--ns-pos)" }}>已儲存</Badge>
              : <Badge variant="outline" className="rounded-full text-micro" style={{background: "var(--ns-warn-soft, #fef3c7)", color: "var(--ns-warn, #b45309)" }}>尚未設定</Badge>
            }
          </div>
          {!kitCode && (
            <Button variant="ghost" className="text-xs" onClick={handleGenerateKit} disabled={kitLoading}>
              <Key size={13} />{kitStatus?.confirmedAt ? "重新產生" : "產生備援碼"}
            </Button>
          )}
        </div>
        <p className="text-sm muted" style={{ marginBottom: kitCode ? 14 : 0 }}>
          {kitStatus?.confirmedAt
            ? `已於 ${kitStatus.confirmedAt.slice(0, 10)} 儲存。如所有裝置遺失可用此碼還原。`
            : "產生並安全儲存備援碼，萬一所有裝置遺失時可用來還原加密金鑰。"}
        </p>

        {kitCode && (
          <div className="mt-2.5" style={{ background: "var(--ns-bg-hover)", borderRadius: "var(--ns-r-md)", padding: "14px 16px" }}>
            <div className="text-body font-semibold mb-3" style={{
              fontFamily: "var(--ns-font-mono)",
              letterSpacing: 1, wordBreak: "break-all", lineHeight: 1.7,
              color: "var(--ns-fg)",
            }}>
              {kitCode.split("-").reduce<string[]>((acc, g, i) => {
                acc.push(g);
                if (i % 2 === 1 && i < 7) acc.push("\n");
                return acc;
              }, []).join("-").split("\n-").join("\n")}
            </div>
            <p className="text-caption flex items-center gap-1.5 mb-3" style={{ color: "var(--ns-warn, #b45309)" }}>
              <Warning size={13} weight="fill" className="shrink-0" />請將此碼列印或抄寫到安全的地方。關閉後無法再次檢視。
            </p>
            <div className="flex gap-2">
              <Button onClick={handleDownloadKit}>
                <DownloadSimple size={13} />下載備援碼
              </Button>
              <Button variant="ghost" onClick={handleConfirmKit}>
                <CheckCircle size={13} weight="bold" />我已安全儲存
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sync snapshots / restore points */}
      <div className="mt-4" style={{ paddingTop: 16, borderTop: "1px solid var(--ns-border)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-body font-semibold">同步前快照</div>
          <Button variant="ghost" className="text-caption" onClick={() => {
            setShowBackups(!showBackups);
          }}>
            {showBackups ? "收起" : `查看備份`}
          </Button>
        </div>
        <p className="text-sm muted" style={{ marginBottom: showBackups ? 10 : 0 }}>
          每次同步前自動儲存，最多保留 3 份。若同步後資料異常可還原。
        </p>
        {showBackups && (
          <div className="flex flex-col gap-1.5">
            {backups.length === 0
              ? <div className="muted text-xs">尚無快照（執行一次同步後會自動建立）</div>
              : backups.map((b) => (
                <div key={b.timestamp} className="flex items-center justify-between" style={{
                  padding: "9px 12px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)",
                }}>
                  <div>
                    <div className="text-xs font-medium">{b.label}</div>
                    <div className="mono muted text-micro">{b.timestamp.slice(0, 19).replace("T", " ")}</div>
                  </div>
                  {confirmRestoreTs === b.timestamp ? (
                    <span className="flex items-center gap-1">
                      <span className="muted text-caption">目前資料將被覆蓋</span>
                      <Button variant="ghost" className="text-caption" style={{ color: "var(--ns-neg)" }} onClick={() => handleRestore(b.timestamp)}>確定還原</Button>
                      <Button variant="ghost" className="text-caption" onClick={() => setConfirmRestoreTs(null)}>取消</Button>
                    </span>
                  ) : (
                    <Button variant="ghost" className="text-caption" style={{ color: "var(--ns-warn, #b45309)" }}
                      onClick={() => setConfirmRestoreTs(b.timestamp)}>
                      還原
                    </Button>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Approving device (A): enter the joiner's code and confirm the device. */}
      {showDialog && (
        <AddDeviceDialog
          mode="approve"
          onClose={() => { setShowDialog(false); setPendingApproval(null); }}
          session={session}
          sessionLoading={sessionLoading}
          secondsLeft={secondsLeft}
          codeDisplay={codeDisplay}
          joinWaiting={joinWaiting}
          onRegenerate={handleStartJoin}
          joinCode={joinCode}
          onJoinCodeChange={setJoinCode}
          joinLoading={joinLoading}
          joinError={joinError}
          onInspect={handleInspect}
          pendingApproval={pendingApproval}
          approveLoading={approveLoading}
          onApprove={handleApprove}
          onCancelApprove={handleCancelApprove}
        />
      )}
    </Card>
  );
}

// ─────── Add Device Dialog ───────

interface AddDeviceDialogProps {
  mode: "show" | "approve";
  onClose: () => void;
  // show mode — the joining device (B)
  session: JoinSession | null;
  sessionLoading: boolean;
  secondsLeft: number;
  codeDisplay: string;
  joinWaiting: boolean;
  onRegenerate: () => void;
  // approve mode — the existing device (A)
  joinCode: string;
  onJoinCodeChange: (v: string) => void;
  joinLoading: boolean;
  joinError: string | null;
  onInspect: () => void;
  pendingApproval: PendingJoinApproval | null;
  approveLoading: boolean;
  onApprove: () => void;
  onCancelApprove: () => void;
}

function AddDeviceDialog({
  mode, onClose,
  session, sessionLoading, secondsLeft, codeDisplay, joinWaiting, onRegenerate,
  joinCode, onJoinCodeChange, joinLoading, joinError, onInspect,
  pendingApproval, approveLoading, onApprove, onCancelApprove,
}: AddDeviceDialogProps) {
  const toast = useToast();

  function handleCopyCode() {
    if (!session) return;
    navigator.clipboard.writeText(session.code);
    toast.success("配對碼已複製");
  }

  // Format code input automatically as XXXX-XXXX
  function handleCodeInput(raw: string) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const formatted = clean.length > 4 ? clean.slice(0, 4) + "-" + clean.slice(4) : clean;
    onJoinCodeChange(formatted);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{
      zIndex: 200,
      background: "var(--ns-scrim)",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card style={{ width: 480, padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "18px 22px 0" }}>
          <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--ns-font-display)", margin: 0 }}>
            {mode === "show" ? "加入現有裝置" : "新增裝置"}
          </h3>
          <Button variant="ghost" size="icon-sm" aria-label="關閉" onClick={onClose}><X size={16} /></Button>
        </div>

        <div style={{ padding: "24px 22px 22px" }}>
          {/* ── Joining device (B): show this device's code, wait for approval ── */}
          {mode === "show" && (
            <div>
              <p className="text-sm muted mb-5">
                在已有資料的裝置上開啟 Northstar，點「設定 → 新增裝置」，輸入下方的配對碼或掃描 QR Code，並確認本裝置。
              </p>

              {sessionLoading && (
                <div className="text-body text-center" style={{ padding: "32px 0", color: "var(--ns-fg-muted)" }}>
                  <Spinner size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                  產生配對碼中…
                </div>
              )}

              {session && (
                <>
                  {/* Code */}
                  <div className="text-[38px] text-center" style={{
                    padding: "20px 0 16px",
                    fontFamily: "var(--ns-font-mono)", fontWeight: 700,
                    letterSpacing: 6, color: "var(--ns-fg)",
                  }}>
                    {codeDisplay}
                  </div>

                  {/* Timer */}
                  <div className="text-xs text-center mb-5" style={{ color: secondsLeft < 60 ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
                    {secondsLeft > 0 ? `${mins}:${secs} 後失效` : "配對碼已失效"}
                  </div>

                  {/* QR */}
                  <div className="flex justify-center mb-5">
                    <div className="inline-block" style={{ padding: 14, background: "#fff", borderRadius: "var(--ns-r-md)" }}>
                      <QRCode value={session.qrPayload} size={160} />
                    </div>
                  </div>

                  {/* Waiting-for-approval status */}
                  {joinWaiting && secondsLeft > 0 && (
                    <div className="text-caption flex items-center justify-center gap-1.5 mb-4" style={{ color: "var(--ns-fg-muted)" }}>
                      <Spinner size={13} className="animate-spin" />
                      等待另一台裝置確認中…
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-center gap-2">
                    <Button variant="ghost" onClick={handleCopyCode}>
                      <CopySimple size={13} />複製配對碼
                    </Button>
                    {secondsLeft === 0 && (
                      <Button variant="outline" onClick={onRegenerate}>
                        <ArrowsClockwise size={13} />重新產生
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Existing device (A): enter B's code, then confirm the device ── */}
          {mode === "approve" && !pendingApproval && (
            <div>
              <p className="text-sm muted mb-5">
                在新裝置上點「以配對碼加入現有裝置」取得配對碼，然後在這裡輸入，或掃描它顯示的 QR Code。
              </p>

              <div className="mb-5">
                <label className="text-caption block" style={{ color: "var(--ns-fg-muted)", marginBottom: 5 }}>配對碼</label>
                <input
                  className="ns-input text-stat w-full text-center"
                  style={{ fontFamily: "var(--ns-font-mono)", letterSpacing: 4 }}
                  placeholder="XXXX-XXXX"
                  value={joinCode}
                  maxLength={9}
                  onChange={e => handleCodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && joinCode.length === 9) onInspect(); }}
                  autoFocus
                />
              </div>

              {joinError && (
                <div className="text-xs mb-3.5" style={{ color: "var(--ns-neg)", padding: "10px 12px", background: "var(--ns-neg-soft)", borderRadius: "var(--ns-r-sm)" }}>
                  {joinError}
                </div>
              )}

              <Button
                className="w-full"
                disabled={joinCode.length !== 9 || joinLoading}
                onClick={onInspect}
              >
                {joinLoading ? <Spinner size={14} className="animate-spin" /> : <CheckCircle size={14} weight="bold" />}
                {joinLoading ? "查詢中…" : "查詢裝置"}
              </Button>
            </div>
          )}

          {/* ── Existing device (A): confirm the joining device before wrapping keys ── */}
          {mode === "approve" && pendingApproval && (
            <div>
              <p className="text-sm muted mb-4">
                確認這是你要加入的裝置。核對裝置名稱與指紋無誤後再授權——授權後才會把加密金鑰傳給對方。
              </p>

              <div className="mb-4" style={{ padding: "14px 16px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <PlatformIcon platform={pendingApproval.platform} />
                  <span className="font-semibold">確認新裝置：{pendingApproval.name}</span>
                </div>
                <div className="text-caption" style={{ color: "var(--ns-fg-muted)" }}>金鑰指紋</div>
                <div className="mono text-body" style={{ letterSpacing: 2, fontWeight: 600 }}>{pendingApproval.fingerprint}</div>
              </div>

              {joinError && (
                <div className="text-xs mb-3.5" style={{ color: "var(--ns-neg)", padding: "10px 12px", background: "var(--ns-neg-soft)", borderRadius: "var(--ns-r-sm)" }}>
                  {joinError}
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" disabled={approveLoading} onClick={onApprove}>
                  {approveLoading ? <Spinner size={14} className="animate-spin" /> : <CheckCircle size={14} weight="bold" />}
                  {approveLoading ? "授權中…" : "確認並授權"}
                </Button>
                <Button variant="outline" disabled={approveLoading} onClick={onCancelApprove}>
                  取消
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium" style={{  marginBottom: 3 , color: "var(--ns-fg-muted)" }}>{label}</div>
      <div className={(mono ? "mono " : "") + "font-medium"}>{value}</div>
    </div>
  );
}

// Built-in "check for updates" via the Tauri updater plugin. The plugin module
// is dynamically imported so the web/dev build (no Tauri runtime) stays happy;
// outside a desktop build the button reports that updates aren't available.
interface FoundUpdate {
  version: string;
  body?: string;
  date?: string;
  downloadAndInstall: (onEvent?: (event: unknown) => void) => Promise<void>;
}

export function UpdateChecker() {
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  // A found-but-not-yet-installed update. We hold the handle so the actual
  // download only starts after the user explicitly confirms — checking must
  // never auto-download (the previous behaviour).
  const [found, setFound] = useState<FoundUpdate | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Load the current app version from Tauri on mount (desktop only).
  useEffect(() => {
    if (!isDesktop) return;
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setCurrentVersion).catch(() => {})
    );
  }, [isDesktop]);

  async function checkForUpdates() {
    setBusy(true);
    setMessage("正在檢查更新…");
    setFound(null);
    setShowNotes(false);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) { setMessage("已是最新版本。"); return; }
      // Stop here — surface the version + release notes and wait for confirmation.
      setFound(update as unknown as FoundUpdate);
      setMessage("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const noRelease = /fetch|not found|404|valid release/i.test(detail);
      setMessage(
        !isDesktop
          ? "檢查更新僅在桌面版可用。"
          : noRelease
            ? "已是最新版本。"
            : updateFailureMessage(detail),
      );
    } finally {
      setBusy(false);
    }
  }

  async function installUpdate() {
    if (!found) return;
    setInstalling(true);
    setMessage(`下載並安裝 v${found.version} 中…`);
    try {
      await found.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      setMessage("更新完成，正在重新啟動…");
      await relaunch();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(updateFailureMessage(detail));
      setInstalling(false);
    }
  }

  const notes = found?.body?.trim();

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-semibold">應用程式更新</h3>
        {currentVersion && (
          <span className="mono muted text-caption">v{currentVersion}</span>
        )}
      </div>
      <p className="text-sm muted mb-4">檢查並安裝 Northstar 的最新桌面版本。所有更新都經過簽章驗證。</p>

      {!found ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={checkForUpdates} loading={busy} disabled={busy}>
            <ArrowsClockwise size={14} />{busy ? "檢查中…" : "檢查更新"}
          </Button>
          {message ? <span className="text-sm muted">{message}</span> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>新版本</Badge>
            <span className="text-sm font-semibold">v{found.version}</span>
            {currentVersion ? <span className="text-xs muted">目前 v{currentVersion}</span> : null}
          </div>
          <p className="text-sm muted">已找到新版本，確認後才會開始下載並安裝。下載完成會自動重新啟動。</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={installUpdate} loading={installing} disabled={installing}>
              <DownloadSimple size={14} />{installing ? "下載安裝中…" : "下載並安裝"}
            </Button>
            {notes ? (
              <Button variant="outline" onClick={() => setShowNotes((v) => !v)} disabled={installing}>
                <Sparkle size={14} />{showNotes ? "隱藏更新內容" : "更新內容"}
              </Button>
            ) : null}
            {!installing ? (
              <Button variant="ghost" onClick={() => { setFound(null); setMessage(""); setShowNotes(false); }}>稍後</Button>
            ) : null}
          </div>
          {showNotes && notes ? (
            <div className="ns-surface text-sm overflow-y-auto whitespace-pre-wrap" style={{ padding: "12px 14px", borderRadius: "var(--ns-r-md)", maxHeight: 240, lineHeight: 1.6 }}>
              {notes}
            </div>
          ) : null}
          {message ? <span className="text-sm muted">{message}</span> : null}
        </div>
      )}
    </Card>
  );
}
