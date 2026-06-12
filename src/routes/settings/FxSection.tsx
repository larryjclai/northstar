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

function buildFxStats(rates: DailyFxRate[]): Map<string, {count: number, firstDate: string, lastDate: string}> {
  const map = new Map<string, {count: number, firstDate: string, lastDate: string}>();
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

export function SettingsFX({ form, submit, dailyFxRates, t }: Omit<SettingsTabProps, "setForm"> & { dailyFxRates: DailyFxRate[] }) {
  const refreshFxRates = useRefreshFxRates();
  const toast = useToast();
  
  const fxStats = useMemo(() => buildFxStats(dailyFxRates), [dailyFxRates]);

  async function refreshAll() {
    if (useDemoMode.getState().active) {
      toast.info("示範模式使用內建行情", { description: "已略過線上匯率更新；結束示範模式後即可正常更新。" });
      return;
    }
    const pairs = form.exchangeRates.map((r) => ({ from: r.from, to: r.to || form.primaryCurrency }));
    if (!pairs.length) return;
    try {
      const res = await refreshFxRates.mutateAsync({ pairs, range: "1y" });
      if (res.failed.length) toast.warning("部分失敗");
      else toast.success("更新完成");
    } catch(e) { toast.error("更新失敗"); }
  }

  function addRate() {
    const nextForm = { ...form, exchangeRates: [...form.exchangeRates, { from: "USD", to: form.primaryCurrency, rate: 1, updatedAt: new Date().toISOString() }] };
    submit(nextForm);
  }

  function updateRate(index: number, val: Partial<ExchangeRate>) {
    const nextForm = { ...form, exchangeRates: form.exchangeRates.map((r, i: number) => i === index ? { ...r, ...val, updatedAt: new Date().toISOString() } : r) };
    submit(nextForm);
  }

  function deleteRate(index: number) {
    const nextForm = { ...form, exchangeRates: form.exchangeRates.filter((_, i: number) => i !== index) };
    submit(nextForm);
  }

  return (
    <div className="max-w-4xl">
      <div style={{ display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:20 }}>
        <div>
          <div className="ns-eyebrow" style={{marginBottom:4}}>Currencies &amp; FX</div>
          <h2 style={{fontFamily:'var(--ns-font-display)',fontSize:24,margin:0,fontWeight:600}}>{t('settings.fx')}</h2>
          <p className="muted" style={{fontSize:13,marginTop:4,marginBottom:0}}>
            {t('settings.fxDesc')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={addRate}><Plus size={14}/>新增</Button>
          <Button onClick={refreshAll} disabled={refreshFxRates.isPending}><ArrowsClockwise size={14}/>全部更新</Button>
        </div>
      </div>

      <Card style={{padding:18, marginBottom:16}}>
        <div className="ns-eyebrow" style={{marginBottom:8}}>{t('settings.baseCurrency')}</div>
        <p className="muted" style={{fontSize:12,margin:'0 0 12px'}}>{t('settings.baseCurrencyDesc')}</p>
        <input className="ns-input max-w-xs" value={form.primaryCurrency} onChange={e => submit({...form, primaryCurrency: e.target.value.toUpperCase()})} />
      </Card>

      <Card style={{padding:0}}>
        <div style={{padding:'10px 20px',borderBottom:'1px solid var(--ns-border)',
          display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 56px',
          fontSize:10.5,color:'var(--ns-fg-dim)',fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07,textTransform:'uppercase'}}>
          <span>{t('settings.ccy')}</span>
          <span style={{textAlign:'right'}}>{t('settings.rate')}</span>
          <span style={{textAlign:'right'}}>To</span>
          <span style={{textAlign:'right'}}>Stats</span>
          <span/>
        </div>
        {form.exchangeRates.map((r, i: number) => {
          const stat = fxStats.get(`${r.from}|${r.to || form.primaryCurrency}`);
          return (
            <div key={i} style={{ display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 56px',
              alignItems:'center',padding:'14px 20px', borderTop:i?'1px solid var(--ns-border)':'none' }}>
              <input className="ns-input" value={r.from} onChange={e=>updateRate(i, { from: e.target.value.toUpperCase() })} />
              <input className="ns-input" type="number" step="0.000001" style={{textAlign:'right'}} value={r.rate} onChange={e=>updateRate(i, { rate: Math.round(+e.target.value * 1e6) / 1e6 })} />
              <input className="ns-input" style={{textAlign:'right'}} value={r.to || form.primaryCurrency} onChange={e=>updateRate(i, { to: e.target.value.toUpperCase() })} />
              <div className="dim" style={{fontSize: 11, textAlign: 'right'}}>{stat ? `${stat.count} records` : 'No history'}</div>
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <Button variant="ghost" size="icon-sm" style={{color:'var(--ns-neg)'}} onClick={()=>deleteRate(i)}><Trash size={14}/></Button>
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  );
}

// ─────── Export Tab ───────
