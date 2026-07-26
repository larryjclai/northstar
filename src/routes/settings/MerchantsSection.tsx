import {
  ArrowsClockwise,
  CheckCircle,
  CurrencyCircleDollar,
  DownloadSimple,
  Eye,
  EyeSlash,
  Globe,
  Key,
  PencilSimple,
  Plus,
  Storefront,
  Tag,
  Trash,
  UploadSimple,
  UsersThree,
  X,
  CaretDown,
  CaretRight,
  Backspace,
  Gear,
  Bank,
  Target,
  DeviceMobile,
  Desktop,
  Spinner,
  WifiHigh,
  CopySimple,
  QrCode,
  Warning,
} from "@phosphor-icons/react";
import { Badge } from "../../components/coss/badge";
import { Button } from "../../components/coss/button";
import { Card } from "../../components/coss/card";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "../../components/ActionButton";
import { AppSelect } from "../../components/AppSelect";
import { useToast } from "../../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../../data/hooks";
import {
  downloadCsv,
  exportInvestmentCsv,
  exportLedgerCsv,
  exportFxRatesCsv,
} from "../../data/csv";
import { getFinanceRepository, type RepositorySnapshot } from "../../data/repositories";
import { enterDemoMode, exitDemoMode, clearAllData } from "../../data/demoData";
import { useDemoMode } from "../../state/demoMode";
import { COMMON_TIMEZONES, isValidTimezone } from "../../domain";
import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../../domain";
import type { SyncConflictRecord } from "../../domain/sync";
import { useRefreshFxRates } from "../../features/market-data/useMarketRefresh";
import {
  useUiPreferences,
  DEFAULT_BENCHMARK_TICKER,
  type ClockMode,
  type NameLocalePreference,
  type ThemeMode,
} from "../../state/uiPreferences";
import { TickerSearchField } from "../../components/TickerSearchField";
import { getOrCreateDeviceIdentity } from "../../state/deviceIdentity";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { IconPicker } from "../../components/IconPicker";
import { Glyph } from "../../lib/icons";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import QRCode from "react-qr-code";
import {
  loadSyncAccount,
  getOrCreateSyncAccount,
  setSyncAccount,
  sha256Hex,
  type SyncAccount,
} from "../../features/connect/sync/account";
import { generateVaultKey, saveVaultKey, loadVaultKey } from "../../features/connect/crypto/vault";
import {
  registerUser,
  listDevices,
  revokeDevice,
  addDevice,
  type DeviceRecord,
} from "../../features/connect/sync/client";
import {
  initiatePairing,
  joinWithCode,
  type PairingSession,
} from "../../features/connect/sync/pairing-flow";
import { runSync, forceFullResync } from "../../features/connect/sync/sync-manager";
import { summarizeConflict } from "../../features/connect/sync/conflictSummary";
import { listBackups, restoreBackup, type BackupEntry } from "../../features/connect/sync/backup";
import { useSyncStatus } from "../../state/syncStatus";
import {
  generateRecoveryKit,
  confirmRecoveryKit,
  downloadRecoveryKit,
  restoreFromRecoveryKit,
  loadLocalRecoveryKitStatus,
  type LocalRecoveryKitStatus,
} from "../../features/connect/crypto/recovery-kit";
import type { SettingsTabProps } from "./shared";

export function SettingsMerchants({
  form,
  setForm,
  submit,
  t,
  renameMerchant,
}: SettingsTabProps & { renameMerchant: (oldName: string, newName: string) => Promise<unknown> }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newMerchant, setNewMerchant] = useState("");
  // Suppresses the unmount-triggered onBlur from re-firing saveEdit after an
  // Enter/Escape already resolved the edit (otherwise every save runs twice).
  const skipBlurRef = useRef(false);

  const filtered = form.merchants.filter((m: string) =>
    m.toLowerCase().includes(search.toLowerCase()),
  );

  function addMerchant() {
    const next = newMerchant.trim();
    setAdding(false);
    setNewMerchant("");
    if (!next) return;
    if (form.merchants.includes(next)) {
      toast.error("商家已存在");
      return;
    }
    const nextForm = { ...form, merchants: [...new Set([...form.merchants, next])] };
    submit(nextForm);
    toast.success("已新增商家");
  }

  function deleteMerchant(name: string) {
    const nextForm = { ...form, merchants: form.merchants.filter((m: string) => m !== name) };
    submit(nextForm);
  }

  function startEdit(name: string) {
    skipBlurRef.current = false;
    setEditingMerchant(name);
    setEditValue(name);
  }

  function cancelEdit() {
    skipBlurRef.current = true;
    setEditingMerchant(null);
  }

  async function saveEdit(oldName: string) {
    const next = editValue.trim();
    // Close the editor first; the unmount fires onBlur, which the ref guard
    // swallows so the rename only runs once.
    skipBlurRef.current = true;
    setEditingMerchant(null);
    if (!next || next === oldName) return;
    if (form.merchants.includes(next)) {
      toast.error("商家已存在");
      return;
    }
    await renameMerchant(oldName, next);
    // The settings query is seeded into local `form` only once, so mirror the
    // rename into `form` here — otherwise the list keeps showing the old name.
    setForm({ ...form, merchants: form.merchants.map((m: string) => (m === oldName ? next : m)) });
    toast.success("已更新商家");
  }

  return (
    <div className="max-w-4xl">
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div
            className="text-xs"
            style={{ marginBottom: 4, color: "var(--ns-fg-muted)", fontWeight: 500 }}
          >
            Auto-categorisation · {form.merchants.length} merchants
          </div>
          <h2
            style={{
              fontFamily: "var(--ns-font-display)",
              fontSize: 24,
              margin: 0,
              fontWeight: 600,
            }}
          >
            {t("settings.merchants")}
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {t("settings.merchantsDesc")}
          </p>
        </div>
        <div>
          <Button
            onClick={() => {
              setAdding(true);
              setNewMerchant("");
            }}
          >
            <Plus size={14} />
            {t("settings.addMerchant")}
          </Button>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <input
          className="ns-input"
          placeholder="搜尋商家名稱..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card style={{ padding: 0 }}>
        <div
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid var(--ns-border)",
            display: "grid",
            gridTemplateColumns: "1fr 80px",
            fontSize: 10.5,
            color: "var(--ns-fg-dim)",
            fontFamily: "var(--ns-font-mono)",
            letterSpacing: 0.07,
            textTransform: "uppercase",
          }}
        >
          <span>{t("settings.merchantName")}</span>
          <span />
        </div>
        {adding && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px",
              alignItems: "center",
              padding: "13px 20px",
              borderTop: "1px solid var(--ns-border)",
              background: "var(--ns-bg-hover)",
            }}
          >
            <input
              autoFocus
              className="ns-input"
              style={{ padding: "4px 8px", fontSize: 14 }}
              placeholder="輸入新商家名稱…"
              value={newMerchant}
              onChange={(e) => setNewMerchant(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addMerchant();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewMerchant("");
                }
              }}
              onBlur={addMerchant}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="ghost" size="icon-sm" aria-label="新增商家" onClick={addMerchant}>
                <CheckCircle size={16} />
              </Button>
            </div>
          </div>
        )}
        {filtered.map((m: string, i: number) => (
          <div
            key={m}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px",
              alignItems: "center",
              padding: "13px 20px",
              borderTop: i ? "1px solid var(--ns-border)" : "none",
            }}
          >
            {editingMerchant === m ? (
              <input
                autoFocus
                className="ns-input"
                style={{ padding: "4px 8px", fontSize: 14 }}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(m);
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={() => {
                  if (skipBlurRef.current) {
                    skipBlurRef.current = false;
                    return;
                  }
                  saveEdit(m);
                }}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
              {editingMerchant !== m && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="編輯"
                  style={{ color: "var(--ns-fg-muted)" }}
                  onClick={() => startEdit(m)}
                >
                  <PencilSimple size={14} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="刪除"
                style={{ color: "var(--ns-neg)" }}
                onClick={() => deleteMerchant(m)}
              >
                <Trash size={14} />
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────── FX Tab ───────
