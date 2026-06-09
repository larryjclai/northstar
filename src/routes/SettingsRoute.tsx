import { ArrowsClockwise, CheckCircle, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, PencilSimple, Plus, Storefront, Tag, Trash, UploadSimple, UsersThree, X, CaretDown, CaretRight, Backspace, Gear, Bank, Target, DeviceMobile, Desktop, Spinner, WifiHigh, CopySimple, QrCode, Warning } from "@phosphor-icons/react";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "../components/ActionButton";
import { AppSelect } from "../components/AppSelect";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { downloadCsv, exportInvestmentCsv, exportLedgerCsv, exportFxRatesCsv } from "../data/csv";
import { getFinanceRepository, type RepositorySnapshot } from "../data/repositories";
import { enterDemoMode, exitDemoMode, clearAllData } from "../data/demoData";
import { useDemoMode } from "../state/demoMode";
import { COMMON_TIMEZONES, isValidTimezone } from "../domain";
import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../domain";
import type { SyncConflictRecord } from "../domain/sync";
import { useRefreshFxRates } from "../features/market-data/useMarketRefresh";
import { useUiPreferences, DEFAULT_BENCHMARK_TICKER, type ClockMode, type NameLocalePreference, type ThemeMode } from "../state/uiPreferences";
import { TickerSearchField } from "../components/TickerSearchField";
import { getOrCreateDeviceIdentity } from "../state/deviceIdentity";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { IconPicker } from "../components/IconPicker";
import { Glyph } from "../lib/icons";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import QRCode from "react-qr-code";
import {
  loadSyncAccount, getOrCreateSyncAccount, setSyncAccount, sha256Hex,
  type SyncAccount,
} from "../features/connect/sync/account";
import {
  generateVaultKey, saveVaultKey, loadVaultKey,
} from "../features/connect/crypto/vault";
import {
  registerUser, listDevices, revokeDevice, addDevice,
  type DeviceRecord,
} from "../features/connect/sync/client";
import {
  initiatePairing, joinWithCode, type PairingSession,
} from "../features/connect/sync/pairing-flow";
import { runSync, forceFullResync } from "../features/connect/sync/sync-manager";
import { summarizeConflict } from "../features/connect/sync/conflictSummary";
import { listBackups, restoreBackup, type BackupEntry } from "../features/connect/sync/backup";
import { useSyncStatus } from "../state/syncStatus";
import {
  generateRecoveryKit, confirmRecoveryKit, downloadRecoveryKit,
  loadLocalRecoveryKitStatus, type LocalRecoveryKitStatus,
} from "../features/connect/crypto/recovery-kit";

const emptySettings: AppSettings = {
  primaryCurrency: "TWD",
  categories: [],
  merchants: [],
  exchangeRates: [],
};

// ─────── FX Stats Helper ───────
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

// ─────── Main Route ───────
export function SettingsRoute() {
  const { t } = useTranslation();
  const { settings, dailyFxRates } = useFinanceData();
  const [form, setForm] = useState(emptySettings);
  const seededRef = useRef(false);
  const updateSettings = useRepositoryMutation((repository, input: AppSettings) => repository.updateAppSettings(input), ["settings"]);
  const renameCategoryMutation = useRepositoryMutation((repository, input: { oldName: string; newName: string }) => repository.renameCategory(input.oldName, input.newName), ["settings", "ledger"]);
  const renameMerchantMutation = useRepositoryMutation((repository, input: { oldName: string; newName: string }) => repository.renameMerchant(input.oldName, input.newName), ["settings", "ledger"]);

  useEffect(() => {
    if (!settings.data) return;
    if (seededRef.current) return;
    setForm(settings.data);
    seededRef.current = true;
  }, [settings.data]);

  const [tab, setTab] = useState('categories');

  const tabs = [
    { id: 'categories', label: t('settings.categories'), icon: <Tag size={14} /> },
    { id: 'merchants',  label: t('settings.merchants'), icon: <Bank size={14} /> },
    { id: 'fx',         label: t('settings.fx'), icon: <CurrencyCircleDollar size={14} /> },
    { id: 'export',     label: t('settings.export'), icon: <DownloadSimple size={14} /> },
    { id: 'general',    label: t('settings.general'), icon: <Gear size={14} /> },
  ];

  async function submit(nextForm: AppSettings) {
    try {
      await updateSettings.mutateAsync(nextForm);
      setForm(nextForm);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="ns-settings-layout">
      {/* Settings sidebar */}
      <aside className="ns-settings-sidebar">
        <div style={{ padding: '0 8px 16px' }}>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Settings</div>
          <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, margin: 0, fontWeight: 600 }}>{t('settings.title')}</h2>
        </div>
        <div className="ns-settings-tabs">
          {tabs.map((tItem) => (
            <div key={tItem.id} 
              className={`ns-nav-link ${tab === tItem.id ? 'active' : ''}`}
              onClick={() => setTab(tItem.id)}>
              {tItem.icon}
              <span style={{ fontSize: 13 }}>{tItem.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Settings content */}
      <main className="ns-settings-content">
        {tab === 'categories' && <SettingsCategories form={form} setForm={setForm} submit={submit} t={t} renameCategory={(o: string, n: string) => renameCategoryMutation.mutateAsync({ oldName: o, newName: n })} />}
        {tab === 'merchants'  && <SettingsMerchants form={form} setForm={setForm} submit={submit} t={t} renameMerchant={(o: string, n: string) => renameMerchantMutation.mutateAsync({ oldName: o, newName: n })} />}
        {tab === 'fx'         && <SettingsFX form={form} setForm={setForm} submit={submit} dailyFxRates={dailyFxRates.data || []} t={t} />}
        {tab === 'export'     && <SettingsExport form={form} t={t} />}
        {tab === 'general'    && <SettingsGeneral form={form} t={t} />}
      </main>
    </div>
  );
}

// ─────── Categories Tab ───────
function SettingsCategories({ form, setForm, submit, t, renameCategory }: any) {
  const toast = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', iconName: 'Tag', color: '#9fe870', budget: '' });
  const [expandId, setExpandId] = useState<string | null>(null);
  // Inline two-click delete confirm (window.confirm is a no-op in the Tauri webview).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Inline subcategory editing (prompt() is unsupported in the Tauri webview).
  const [editingSub, setEditingSub] = useState<{ cat: string; sub: string } | null>(null);
  const [editSubValue, setEditSubValue] = useState('');
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubValue, setNewSubValue] = useState('');

  function renameSubcategory(catName: string, oldSub: string, rawNext: string) {
    const next = rawNext.trim();
    setEditingSub(null);
    if (!next || next === oldSub) return;
    const target = form.categories.find((cat: any) => cat.name === catName);
    if (target?.children?.includes(next)) { toast.error("子分類已存在"); return; }
    const nextForm = { ...form, categories: form.categories.map((cat: any) => cat.name === catName ? { ...cat, children: cat.children.map((child: string) => child === oldSub ? next : child) } : cat) };
    submit(nextForm);
    toast.success("已更新子分類");
  }

  function addSubcategory(catName: string, rawName: string) {
    const name = rawName.trim();
    setAddingSubFor(null);
    setNewSubValue('');
    if (!name) return;
    const target = form.categories.find((cat: any) => cat.name === catName);
    if (target?.children?.includes(name)) { toast.error("子分類已存在"); return; }
    const nextForm = { ...form, categories: form.categories.map((cat: any) => cat.name === catName ? { ...cat, children: [...(cat.children || []), name] } : cat) };
    submit(nextForm);
    toast.success("已新增子分類");
  }
  
  const colorPicker = ['#f0c050','#6fb3ff','#a99cff','#6ee49a','#ff7d6b','#34c5b0','#f0a050','#9fe870','#d97a9c','#868685'];

  function addCategory() {
    if (!newCat.name) return;
    const nextCat = { name: newCat.name, children: [], iconName: newCat.iconName, color: newCat.color, budget: newCat.budget ? +newCat.budget : undefined };
    const nextForm = { ...form, categories: [...form.categories, nextCat] };
    submit(nextForm);
    setNewCat({ name: '', iconName: 'Tag', color: '#9fe870', budget: '' });
    setAdding(false);
    toast.success("已新增分類");
  }

  function deleteCategory(name: string) {
    const nextForm = { ...form, categories: form.categories.filter((c: any) => c.name !== name) };
    submit(nextForm);
    setConfirmDeleteId(null);
    toast.success("已刪除分類");
  }

  async function saveEdit(oldName: string, patch: any) {
    if (patch.name && patch.name !== oldName) {
      await renameCategory(oldName, patch.name);
      // renameCategory already updates settings; merge remaining patch fields
      const nextForm = {
        ...form,
        categories: form.categories.map((c: any) => c.name === oldName ? { ...c, ...patch } : c),
      };
      submit(nextForm);
    } else {
      const nextForm = {
        ...form,
        categories: form.categories.map((c: any) => c.name === oldName ? { ...c, ...patch } : c),
      };
      submit(nextForm);
    }
    setEditId(null);
  }

  return (
    <div className="max-w-4xl">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Manage · {form.categories.length} categories</div>
          <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, margin: 0, fontWeight: 600 }}>{t('settings.categories')}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>{t('settings.categoriesDesc')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={14} weight="bold" />{t('settings.addCategory')}
        </Button>
      </div>

      {adding && (
        <Card style={{ padding: 18, marginBottom: 14, border: '1.5px solid var(--ns-accent)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{t('settings.newCategory')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 5 }}>名稱 *</label>
              <input className="ns-input" value={newCat.name} onChange={e => setNewCat(n=>({...n,name:e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 5 }}>月預算</label>
              <input className="ns-input" value={newCat.budget} onChange={e => setNewCat(n=>({...n,budget:e.target.value}))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 6 }}>圖示</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Popover>
                <PopoverTrigger style={{ width:32,height:32,borderRadius:'var(--ns-r-sm)',fontSize:18,
                  background:'var(--ns-bg-hover)',
                  border:'1px solid var(--ns-border)',
                  cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <Glyph name={newCat.iconName} size={18} />
                </PopoverTrigger>
                <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
                  <IconPicker
                    value={newCat.iconName}
                    onSelect={(name) => setNewCat(n=>({...n,iconName: name}))}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 6 }}>顏色</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {colorPicker.map(c => (
                <div key={c} onClick={() => setNewCat(n=>({...n,color:c}))} style={{
                  width:22,height:22,borderRadius:99,background:c,cursor:'pointer',
                  outline:newCat.color===c?'2px solid var(--ns-fg)':'none',outlineOffset:2 }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => setAdding(false)}>取消</Button>
            <Button onClick={addCategory} style={{ opacity: newCat.name?1:0.5 }}>
              <CheckCircle size={13} weight="bold" />新增
            </Button>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <div className="ns-settings-category-head" style={{ padding:'10px 20px', borderBottom:'1px solid var(--ns-border)',
          display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
          fontSize:10.5, color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07, textTransform:'uppercase' }}>
          <span>Category</span>
          <span style={{textAlign:'right'}}>{t('settings.spent')}</span>
          <span className="ns-settings-category-budget" style={{textAlign:'right'}}>{t('settings.budget')}</span>
          <span className="ns-settings-category-usage" style={{paddingLeft:8}}>{t('settings.usage')}</span>
          <span />
        </div>
        {form.categories.map((c: any, i: number) => {
          const spent = 0; // Mock spent for now, usually computed from ledger
          const over = c.budget && spent > c.budget;
          const pct  = c.budget ? Math.min(spent / c.budget, 1) : 0;
          const isEdit = editId === c.name;
          return (
            <div key={c.name}>
              <div className="ns-settings-category-row" style={{
                display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
                alignItems:'center', padding:'13px 20px',
                borderTop: i ? '1px solid var(--ns-border)' : 'none',
                background: isEdit ? 'var(--ns-bg-hover)' : 'transparent',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => setExpandId(expandId===c.name ? null : c.name)}>
                  <div style={{ width:34,height:34,borderRadius:'var(--ns-r-sm)',fontSize:18,
                    background:(c.color||'#868685')+'28',display:'flex',alignItems:'center',justifyContent:'center' }}><Glyph name={c.iconName || 'Tag'} size={18} /></div>
                  <div>
                    <div style={{ fontSize:13.5,fontWeight:500 }}>{c.name}</div>
                    <div className="muted mono" style={{ fontSize:10.5 }}>{c.children?.length||0} {t('settings.subcategories')}</div>
                  </div>
                  {expandId===c.name ? <CaretDown size={12} /> : <CaretRight size={12} />}
                </div>
                <span className={'num '+(over?'neg':'')} style={{ textAlign:'right',fontSize:14,fontWeight:over?600:400 }}>
                  NT$0
                </span>
                <span className="num muted ns-settings-category-budget" style={{ textAlign:'right',fontSize:13 }}>
                  {c.budget?'NT$'+c.budget.toLocaleString():'—'}
                </span>
                <div className="ns-settings-category-usage" style={{ paddingLeft:8 }}>
                  {c.budget ? (
                    <>
                      <div style={{ height:7,borderRadius:99,background:'var(--ns-bg-hover)',overflow:'hidden',marginBottom:3 }}>
                        <div style={{ width:(pct*100)+'%',height:'100%',background:over?'var(--ns-neg)':(c.color||'#868685'),borderRadius:99 }} />
                      </div>
                      <div className="mono" style={{ fontSize:10,color:over?'var(--ns-neg)':'var(--ns-fg-dim)' }}>
                        {(pct*100).toFixed(0)}%{over?' · '+t('settings.overBudget'):''}
                      </div>
                    </>
                  ) : <span className="dim" style={{fontSize:11}}>{t('settings.noLimit')}</span>}
                </div>
                <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                  <Button variant="ghost" size="icon-sm" style={{padding:6}} onClick={() => setEditId(isEdit?null:c.name)}>
                    <Gear size={14} />
                  </Button>
                  {confirmDeleteId === c.name ? (
                    <>
                      <Button variant="ghost" size="icon-sm" style={{padding:6,color:'var(--ns-neg)'}} title="確定刪除" onClick={() => deleteCategory(c.name)}>
                        <CheckCircle size={14} weight="bold" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" style={{padding:6}} title="取消" onClick={() => setConfirmDeleteId(null)}>
                        <X size={14} />
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon-sm" style={{padding:6,color:'var(--ns-neg)'}} onClick={() => setConfirmDeleteId(c.name)}>
                      <Backspace size={14} />
                    </Button>
                  )}
                </div>
              </div>

              {isEdit && (
                <div style={{ padding:'14px 20px 16px', borderTop:'1px dashed var(--ns-border)', background:'var(--ns-bg-hover)' }}>
                  <EditCatForm cat={c} colors={colorPicker} onSave={(patch: any) => saveEdit(c.name, patch)} onCancel={() => setEditId(null)} />
                </div>
              )}

              {expandId === c.name && (
                <div style={{ background:'var(--ns-bg)', borderTop:'1px solid var(--ns-border)' }}>
                  {c.children?.map((s: string, si: number) => {
                    const isEditingSub = editingSub?.cat === c.name && editingSub?.sub === s;
                    return (
                      <div key={s} style={{ padding:'9px 20px 9px 66px', display:'flex', alignItems:'center', gap:10,
                        borderTop: si?'1px solid var(--ns-border)':'none', fontSize:13 }}>
                        <span className="dim">↳</span>
                        {isEditingSub ? (
                          <input
                            autoFocus
                            className="ns-input"
                            style={{ flex:1, padding:'4px 8px', fontSize:13 }}
                            value={editSubValue}
                            onChange={e => setEditSubValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') renameSubcategory(c.name, s, editSubValue);
                              if (e.key === 'Escape') setEditingSub(null);
                            }}
                            onBlur={() => renameSubcategory(c.name, s, editSubValue)}
                          />
                        ) : (
                          <span style={{ flex:1 }}>{s}</span>
                        )}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!isEditingSub && (
                            <Button variant="ghost" size="icon-sm" style={{padding:'3px 6px'}} onClick={() => { setEditingSub({ cat: c.name, sub: s }); setEditSubValue(s); }}><PencilSimple size={12}/></Button>
                          )}
                          <Button variant="ghost" size="icon-sm" style={{color:'var(--ns-neg)', padding:'3px 6px'}} onClick={() => {
                            const nextForm = { ...form, categories: form.categories.map((cat: any) => cat.name === c.name ? { ...cat, children: cat.children.filter((x: string) => x !== s) } : cat) };
                            submit(nextForm);
                          }}><Trash size={12}/></Button>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ padding:'9px 20px 9px 66px', borderTop: c.children?.length ? '1px solid var(--ns-border)' : 'none' }}>
                    {addingSubFor === c.name ? (
                      <input
                        autoFocus
                        className="ns-input"
                        style={{ width:'60%', padding:'4px 8px', fontSize:13 }}
                        placeholder="子分類名稱…"
                        value={newSubValue}
                        onChange={e => setNewSubValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addSubcategory(c.name, newSubValue);
                          if (e.key === 'Escape') { setAddingSubFor(null); setNewSubValue(''); }
                        }}
                        onBlur={() => addSubcategory(c.name, newSubValue)}
                      />
                    ) : (
                      <Button variant="ghost" style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto" }} onClick={() => { setAddingSubFor(c.name); setNewSubValue(''); }}><Plus size={12} style={{ marginRight: 4 }} />新增子分類</Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function EditCatForm({ cat, colors, onSave, onCancel }: any) {
  const [name,   setName]   = useState(cat.name);
  const [icon,   setIcon]   = useState(cat.iconName || 'Tag');
  const [color,  setColor]  = useState(cat.color || '#868685');
  const [budget, setBudget] = useState(cat.budget || '');
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <div>
        <label style={{ fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:4 }}>名稱</label>
        <input className="ns-input" style={{fontSize:13}} value={name} onChange={e=>setName(e.target.value)}/>
      </div>
      <div>
        <label style={{ fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:4 }}>月預算 (NTD)</label>
        <input className="ns-input" style={{fontSize:13}} placeholder="留空 = 不設限" value={budget} onChange={e=>setBudget(e.target.value)}/>
      </div>
      <div>
        <label style={{ fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:6 }}>圖示</label>
        <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
          <Popover>
            <PopoverTrigger style={{ width:32,height:32,borderRadius:'var(--ns-r-sm)',fontSize:18,
              background:'var(--ns-bg-hover)',
              border:'1px solid var(--ns-border)',
              cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Glyph name={icon} size={18} />
            </PopoverTrigger>
            <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
              <IconPicker value={icon} onSelect={(name) => setIcon(name)} />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div>
        <label style={{ fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:6 }}>顏色</label>
        <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
          {colors.map((c: string)=>(
            <div key={c} onClick={()=>setColor(c)} style={{
              width:20,height:20,borderRadius:99,background:c,cursor:'pointer',
              outline:color===c?'2px solid var(--ns-fg)':'none',outlineOffset:2 }} />
          ))}
        </div>
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <Button variant="ghost" style={{fontSize:12}} onClick={onCancel}>取消</Button>
          <Button style={{fontSize:12}} onClick={()=>onSave({name,iconName:icon,color,budget:budget?+budget:null})}>
            <CheckCircle size={14} weight="bold" />儲存
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────── Merchants Tab ───────
function SettingsMerchants({ form, setForm, submit, t, renameMerchant }: any) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [newMerchant, setNewMerchant] = useState('');

  const filtered = form.merchants.filter((m: string) => m.toLowerCase().includes(search.toLowerCase()));

  function addMerchant() {
    const next = newMerchant.trim();
    setAdding(false);
    setNewMerchant('');
    if (!next) return;
    if (form.merchants.includes(next)) { toast.error("商家已存在"); return; }
    const nextForm = { ...form, merchants: [...new Set([...form.merchants, next])] };
    submit(nextForm);
    toast.success("已新增商家");
  }

  function deleteMerchant(name: string) {
    const nextForm = { ...form, merchants: form.merchants.filter((m: string) => m !== name) };
    submit(nextForm);
  }

  function startEdit(name: string) {
    setEditingMerchant(name);
    setEditValue(name);
  }

  async function saveEdit(oldName: string) {
    const next = editValue.trim();
    if (!next || next === oldName) { setEditingMerchant(null); return; }
    await renameMerchant(oldName, next);
    setEditingMerchant(null);
    toast.success("已更新商家");
  }

  return (
    <div className="max-w-4xl">
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div className="ns-eyebrow" style={{marginBottom:4}}>Auto-categorisation · {form.merchants.length} merchants</div>
          <h2 style={{ fontFamily:'var(--ns-font-display)',fontSize:24,margin:0,fontWeight:600 }}>{t('settings.merchants')}</h2>
          <p className="muted" style={{fontSize:13,marginTop:4,marginBottom:0}}>
            {t('settings.merchantsDesc')}
          </p>
        </div>
        <div>
          <Button onClick={() => { setAdding(true); setNewMerchant(''); }}><Plus size={14}/>{t('settings.addMerchant')}</Button>
        </div>
      </div>

      <div style={{ position:'relative', marginBottom:16 }}>
        <input className="ns-input" placeholder="搜尋商家名稱..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <Card style={{padding:0}}>
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--ns-border)',
          display:'grid', gridTemplateColumns:'1fr 80px',
          fontSize:10.5, color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07, textTransform:'uppercase' }}>
          <span>{t('settings.merchantName')}</span><span/>
        </div>
        {adding && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', alignItems:'center', padding:'13px 20px', borderTop:'1px solid var(--ns-border)', background:'var(--ns-bg-hover)' }}>
            <input
              autoFocus
              className="ns-input"
              style={{ padding:'4px 8px', fontSize:14 }}
              placeholder="輸入新商家名稱…"
              value={newMerchant}
              onChange={e => setNewMerchant(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addMerchant();
                if (e.key === 'Escape') { setAdding(false); setNewMerchant(''); }
              }}
              onBlur={addMerchant}
            />
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <Button variant="ghost" size="icon-sm" onClick={addMerchant}><CheckCircle size={16}/></Button>
            </div>
          </div>
        )}
        {filtered.map((m: string, i: number) => (
          <div key={m} style={{
            display:'grid', gridTemplateColumns:'1fr 80px',
            alignItems:'center', padding:'13px 20px',
            borderTop: i?'1px solid var(--ns-border)':'none',
          }}>
            {editingMerchant === m ? (
              <input
                autoFocus
                className="ns-input"
                style={{ padding: "4px 8px", fontSize: 14 }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit(m);
                  if (e.key === 'Escape') setEditingMerchant(null);
                }}
                onBlur={() => saveEdit(m)}
              />
            ) : (
              <div style={{fontSize:14,fontWeight:500}}>{m}</div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end', gap:4}}>
              {editingMerchant !== m && (
                <Button variant="ghost" size="icon-sm" style={{color:'var(--ns-fg-muted)'}} onClick={()=>startEdit(m)}>
                  <PencilSimple size={14}/>
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" style={{color:'var(--ns-neg)'}} onClick={()=>deleteMerchant(m)}>
                <Trash size={14}/>
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────── FX Tab ───────
function SettingsFX({ form, submit, dailyFxRates, t }: any) {
  const refreshFxRates = useRefreshFxRates();
  const toast = useToast();
  
  const fxStats = useMemo(() => buildFxStats(dailyFxRates), [dailyFxRates]);

  async function refreshAll() {
    const pairs = form.exchangeRates.map((r: any) => ({ from: r.from, to: r.to || form.primaryCurrency }));
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
    const nextForm = { ...form, exchangeRates: form.exchangeRates.map((r: any, i: number) => i === index ? { ...r, ...val, updatedAt: new Date().toISOString() } : r) };
    submit(nextForm);
  }

  function deleteRate(index: number) {
    const nextForm = { ...form, exchangeRates: form.exchangeRates.filter((_: any, i: number) => i !== index) };
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
        {form.exchangeRates.map((r: any, i: number) => {
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

function SettingsExport({ t }: any) {
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
  const accountById = useMemo(() => new Map(accountRows.map((a: any) => [a.id, a])), [accountRows]);

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
    () => ledgerRows.filter((row: any) =>
      !row.deletedAt && inRange(row.date) && accountInScope(row.accountId) && (includeTransfers || row.entryType !== "transfer")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledgerRows, start, end, scope, includeTransfers],
  );
  const filteredInvestments = useMemo(
    () => investmentRows.filter((rec: any) => !rec.deletedAt && inRange(rec.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [investmentRows, start, end],
  );
  const filteredFx = useMemo(
    () => fxRows.filter((r: any) => inRange(r.date)),
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
        const assetFor = (id: string) => assetRows.find((a: any) => a.id === id);
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
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Export</div>
        <h2 style={{ fontFamily: "var(--ns-font-display)", fontSize: 24, margin: 0, fontWeight: 600 }}>{t("settings.dataExport")}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>{t("settings.dataExportDesc")}</p>
      </div>

      <Card className="p-5">
        <div className="ns-eyebrow" style={{ marginBottom: 10 }}>{t("settings.format")}</div>
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
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>{t("settings.timeRange")}</div>
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
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>帳戶範圍</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACCOUNT_SCOPES.map((s) => {
                const count = s.types ? accountRows.filter((a: any) => s.types!.includes(a.type)).length : accountRows.length;
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
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>{t("settings.includedFields")}</div>
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
function SettingsGeneral({ form, t }: any) {
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
  const benchmarkTicker = useUiPreferences((state) => state.benchmarkTicker);
  const setBenchmarkTicker = useUiPreferences((state) => state.setBenchmarkTicker);
  const [benchmarkDraft, setBenchmarkDraft] = useState(benchmarkTicker);

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

        <h3 className="font-semibold mb-2 mt-6">投資 Benchmark 指標</h3>
        <p className="text-xs muted mb-3">「投資 → 分析」與總覽的「投資組合 vs Benchmark」會用這個標的當比較基準。預設 {DEFAULT_BENCHMARK_TICKER}（元大台灣50）。首次開啟分析時會自動回補它的歷史股價。</p>
        <TickerSearchField
          value={benchmarkDraft}
          onChange={(v) => { setBenchmarkDraft(v); if (v.trim()) setBenchmarkTicker(v); }}
          onSelect={(result) => { setBenchmarkDraft(result.symbol); setBenchmarkTicker(result.symbol); }}
          placeholder={DEFAULT_BENCHMARK_TICKER}
        />
        <div className="mt-2 flex items-center gap-3 text-xs muted">
          <span>目前基準：<span className="mono" style={{ color: "var(--ns-fg)" }}>{benchmarkTicker}</span></span>
          {benchmarkTicker !== DEFAULT_BENCHMARK_TICKER ? (
            <button
              type="button"
              className="underline"
              style={{ color: "var(--ns-accent)" }}
              onClick={() => { setBenchmarkTicker(DEFAULT_BENCHMARK_TICKER); setBenchmarkDraft(DEFAULT_BENCHMARK_TICKER); }}
            >
              還原預設
            </button>
          ) : null}
        </div>
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

function ConnectStatus() {
  const toast = useToast();
  const [identity] = useState(() => getOrCreateDeviceIdentity());
  const [account, setAccount] = useState<SyncAccount | null>(() => loadSyncAccount());
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Dialog: add device
  const [showDialog, setShowDialog] = useState(false);
  const [dialogTab, setDialogTab] = useState<"show" | "join">("show");

  // Recovery Kit
  const [kitStatus, setKitStatus] = useState<LocalRecoveryKitStatus | null>(() => loadLocalRecoveryKitStatus());
  const [kitCode, setKitCode] = useState<string | null>(null);
  const [kitLoading, setKitLoading] = useState(false);

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

  // Load backups list when panel opens
  useEffect(() => {
    if (!showBackups) return;
    listBackups().then(setBackups).catch(() => setBackups([]));
  }, [showBackups]);

  // Device A: show pairing code
  const [session, setSession] = useState<PairingSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Device B: join with code
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
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

  // ── First-time setup ──
  async function handleSetup() {
    setLoading(true);
    try {
      const vaultKey = await generateVaultKey();
      await saveVaultKey(vaultKey);

      const newAccount = getOrCreateSyncAccount();
      const hash = await sha256Hex(newAccount.apiSecret);
      await registerUser({
        userId: newAccount.userId,
        apiSecretHash: hash,
        device: {
          id: identity.deviceId,
          name: joinDeviceName,
          platform: getDevicePlatform(),
        },
      });
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

  // ── Generate pairing code (Device A) ──
  async function handleGenerateCode() {
    if (!account) return;
    setSessionLoading(true);
    try {
      const s = await initiatePairing();
      setSession(s);
    } catch (e) {
      toast.error("無法產生配對碼，請確認網路連線");
    } finally {
      setSessionLoading(false);
    }
  }

  // ── Join with code (Device B) ──
  async function handleJoin() {
    setJoinError(null);
    setJoinLoading(true);
    try {
      await joinWithCode(joinCode, joinDeviceName, getDevicePlatform());
      const joined = loadSyncAccount()!;
      setAccount(joined);
      const devs = await listDevices(joined.apiSecret);
      setDevices(devs);
      setShowDialog(false);
      setJoinCode("");
      toast.success("裝置已成功加入同步");
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "配對失敗，請確認配對碼是否正確");
    } finally {
      setJoinLoading(false);
    }
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
      toast.success(`已從伺服器完整重新下載，套用 ${result.applied} 筆`);
    } catch (e) {
      const msg = e instanceof Error ? e.message
        : typeof e === "string" ? e
        : (e as { message?: string })?.message ?? JSON.stringify(e) ?? "重新下載失敗";
      console.error("[sync] force full resync failed:", e);
      syncStatus.setError(msg);
    }
  }

  // ── Restore backup ──
  async function handleRestore(timestamp: string) {
    if (!window.confirm("確定要還原到此備份？目前的資料將被覆蓋。")) return;
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

  function openDialog(tab: "show" | "join") {
    setDialogTab(tab);
    setSession(null);
    setJoinCode("");
    setJoinError(null);
    setShowDialog(true);
    if (tab === "show") handleGenerateCode();
  }

  const codeDisplay = session
    ? session.code.slice(0, 4) + " – " + session.code.slice(5)
    : "——";

  // ── Not yet set up ──
  if (!account) {
    return (
      <Card className="p-5">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <h3 className="font-semibold">Connect 同步</h3>
        </div>
        <p className="text-sm muted mb-4">
          啟用後，你的財務資料會以端對端加密的方式同步到你的其他裝置。資料加密後才離開裝置，伺服器看不到任何明文。
        </p>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, color: "var(--ns-fg-muted)", display: "block", marginBottom: 5 }}>這台裝置的名稱</label>
          <input
            className="ns-input"
            style={{ maxWidth: 260 }}
            value={joinDeviceName}
            onChange={e => setJoinDeviceName(e.target.value)}
            placeholder="My Mac"
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={handleSetup} disabled={loading || !joinDeviceName.trim()}>
            {loading ? <Spinner size={14} className="animate-spin" /> : <WifiHigh size={14} />}
            {loading ? "啟用中…" : "啟用同步"}
          </Button>
          <Button variant="ghost" onClick={() => openDialog("join")}>
            我有配對碼
          </Button>
        </div>

        {/* Join dialog (for device B before account exists) */}
        {showDialog && (
          <AddDeviceDialog
            tab={dialogTab}
            onTabChange={setDialogTab}
            onClose={() => setShowDialog(false)}
            session={session}
            sessionLoading={sessionLoading}
            secondsLeft={secondsLeft}
            codeDisplay={codeDisplay}
            onGenerateCode={handleGenerateCode}
            joinCode={joinCode}
            onJoinCodeChange={setJoinCode}
            joinDeviceName={joinDeviceName}
            onJoinDeviceNameChange={setJoinDeviceName}
            joinLoading={joinLoading}
            joinError={joinError}
            onJoin={handleJoin}
            hideShowTab
          />
        )}
      </Card>
    );
  }

  // ── Active ──
  return (
    <Card className="p-5">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 className="font-semibold">Connect 同步</h3>
          {kitStatus?.confirmedAt ? (
            <Badge variant="outline" className="rounded-full" style={{ fontSize: 10.5, background: "var(--ns-pos-soft)", color: "var(--ns-pos)" }}>已啟用</Badge>
          ) : (
            <Badge variant="outline" className="rounded-full" style={{ fontSize: 10.5, background: "var(--ns-warn-soft, var(--ns-bg-hover))", color: "var(--ns-warn, #b45309)" }}>待備份備援碼</Badge>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" style={{ fontSize: 12 }}
            onClick={handleManualSync}
            title={!kitStatus?.confirmedAt ? "請先備份並確認 Recovery Kit" : undefined}
            disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling" || !kitStatus?.confirmedAt}>
            <ArrowsClockwise size={13} style={{ animation: (syncStatus.phase === "pushing" || syncStatus.phase === "pulling") ? "spin 1s linear infinite" : undefined }} />
            {syncStatus.phase === "pushing" ? "上傳中…" : syncStatus.phase === "pulling" ? "下載中…" : "立即同步"}
          </Button>
          <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => openDialog("show")}>
            <Plus size={13} />新增裝置
          </Button>
        </div>
      </div>

      {/* Recovery Kit gate — sync is blocked until the kit is confirmed */}
      {!kitStatus?.confirmedAt && (
        <div style={{ fontSize: 12, marginBottom: 10, padding: "10px 12px", borderRadius: "var(--ns-r-sm)",
          background: "var(--ns-warn-soft, var(--ns-bg-hover))", color: "var(--ns-warn, #b45309)",
          display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Warning size={15} weight="fill" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>同步尚未啟動。請先在下方「Recovery Kit 備援碼」產生並確認備份 —— 這是萬一所有裝置遺失時還原加密資料的唯一方法，確認後才會開始自動同步。</span>
        </div>
      )}

      {/* Sync status bar */}
      {(syncStatus.phase !== "idle" || syncStatus.lastSyncAt) && (
        <div style={{ fontSize: 11.5, marginBottom: 10, padding: "7px 10px", borderRadius: "var(--ns-r-sm)",
          display: "flex", alignItems: "center", gap: 6,
          background: syncStatus.phase === "error" ? "var(--ns-neg-soft)" : "var(--ns-bg-hover)",
          color: syncStatus.phase === "error" ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
          {syncStatus.phase === "pushing" || syncStatus.phase === "pulling" ? (
            <><Spinner size={13} className="animate-spin" style={{ flexShrink: 0 }} /><span>{syncStatus.phase === "pushing" ? "上傳變更中…" : "下載並套用中…"}</span></>
          ) : syncStatus.phase === "error" ? (
            <><Warning size={13} weight="fill" style={{ flexShrink: 0 }} /><span>{syncStatus.error}</span></>
          ) : syncStatus.phase === "done" ? (
            <><CheckCircle size={13} weight="fill" style={{ flexShrink: 0, color: "var(--ns-pos)" }} /><span>{`已同步：上傳 ${syncStatus.lastPushed} 筆，下載並套用 ${syncStatus.lastApplied} 筆`}</span></>
          ) : syncStatus.lastSyncAt ? (
            <span>上次同步：<RelativeTime iso={syncStatus.lastSyncAt} /></span>
          ) : null}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, fontSize: 13, marginBottom: 16 }}>
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
              <Button variant="ghost" style={{ fontSize: 11 }} onClick={() => resolveAllConflicts("keepLocal")}>全部保留本機</Button>
              <Button variant="ghost" style={{ fontSize: 11 }} onClick={() => resolveAllConflicts("useIncoming")}>全部採用遠端</Button>
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
                      <Badge variant="outline" className="rounded-full" style={{ fontSize: 10, flexShrink: 0 }}>{summary.entityLabel}</Badge>
                      <span className="font-semibold truncate" title={summary.title}>{summary.title}</span>
                      <span style={{ color: "var(--ns-fg-muted)", flexShrink: 0 }}>
                        {summary.newer === "tie" ? "兩版同時間" : summary.newer === "local" ? "本機較新" : "遠端較新"}
                      </span>
                    </span>
                    <span className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" style={{ fontSize: 11 }} onClick={() => resolveConflict(conflict.id, "keepLocal")}>保留本機</Button>
                      <Button variant="ghost" style={{ fontSize: 11 }} onClick={() => resolveConflict(conflict.id, "useIncoming")}>採用遠端</Button>
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

      {/* Recovery: re-download everything from the server. For a device whose
          local data was wiped/reinstalled — a normal sync won't restore it
          because the saved cursor makes the device think it's already current. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "10px 12px", marginBottom: 16, borderRadius: "var(--ns-r-md)",
        background: "var(--ns-bg-hover)", border: "1px solid var(--ns-border)" }}>
        <div style={{ fontSize: 11.5, color: "var(--ns-fg-muted)", lineHeight: 1.5 }}>
          資料遺失或換新裝置？從伺服器完整重新下載所有資料（只下載、不會覆蓋伺服器）。
        </div>
        {confirmFullResync
          ? <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
              <Button variant="ghost" style={{ fontSize: 12 }} onClick={() => setConfirmFullResync(false)}>取消</Button>
              <Button variant="outline" style={{ fontSize: 12 }}
                onClick={handleForceFullResync}
                disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling"}>
                確認重新下載
              </Button>
            </div>
          : <Button variant="ghost" style={{ fontSize: 12, flexShrink: 0 }}
              onClick={() => setConfirmFullResync(true)}
              disabled={syncStatus.phase === "pushing" || syncStatus.phase === "pulling"}>
              <ArrowsClockwise size={13} />完整重新下載
            </Button>
        }
      </div>

      {/* Device list */}
      <div style={{ fontSize: 11.5, color: "var(--ns-fg-dim)", textTransform: "uppercase", letterSpacing: 0.06, fontFamily: "var(--ns-font-mono)", marginBottom: 8 }}>
        已信任裝置 · {devices.length}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {devices.map(dev => (
          <div key={dev.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderRadius: "var(--ns-r-md)",
            background: dev.id === identity.deviceId ? "var(--ns-accent-soft)" : "var(--ns-bg-hover)",
            border: dev.id === identity.deviceId ? "1px solid var(--ns-accent)" : "1px solid transparent",
          }}>
            <PlatformIcon platform={dev.platform} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{dev.name}</div>
              <div className="mono muted" style={{ fontSize: 10.5 }}>{dev.id.slice(0, 8)}… · {dev.platform}</div>
            </div>
            {dev.id === identity.deviceId
              ? <span style={{ fontSize: 11, color: "var(--ns-fg-muted)" }}>本機</span>
              : confirmRevokeId === dev.id
                ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Button variant="ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setConfirmRevokeId(null)}>取消</Button>
                    <Button variant="outline" style={{ fontSize: 11, padding: "4px 8px", color: "var(--ns-neg)", borderColor: "var(--ns-neg)" }} onClick={() => handleRevoke(dev.id)}>確認移除</Button>
                  </div>
                : <Button variant="ghost" size="icon-sm" style={{ color: "var(--ns-neg)", padding: "4px 6px" }} onClick={() => setConfirmRevokeId(dev.id)}>
                    <Trash size={13} />
                  </Button>
            }
          </div>
        ))}
      </div>

      {/* Recovery Kit */}
      <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--ns-border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>備援碼</div>
            {kitStatus?.confirmedAt
              ? <Badge variant="outline" className="rounded-full" style={{ fontSize: 10.5, background: "var(--ns-pos-soft)", color: "var(--ns-pos)" }}>已儲存</Badge>
              : <Badge variant="outline" className="rounded-full" style={{ fontSize: 10.5, background: "var(--ns-warn-soft, #fef3c7)", color: "var(--ns-warn, #b45309)" }}>尚未設定</Badge>
            }
          </div>
          {!kitCode && (
            <Button variant="ghost" style={{ fontSize: 12 }} onClick={handleGenerateKit} disabled={kitLoading}>
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
          <div style={{ background: "var(--ns-bg-hover)", borderRadius: "var(--ns-r-md)", padding: "14px 16px", marginTop: 10 }}>
            <div style={{
              fontFamily: "var(--ns-font-mono)", fontSize: 13.5, fontWeight: 600,
              letterSpacing: 1, wordBreak: "break-all", lineHeight: 1.7,
              color: "var(--ns-fg)", marginBottom: 12,
            }}>
              {kitCode.split("-").reduce<string[]>((acc, g, i) => {
                acc.push(g);
                if (i % 2 === 1 && i < 7) acc.push("\n");
                return acc;
              }, []).join("-").split("\n-").join("\n")}
            </div>
            <p className="text-sm" style={{ color: "var(--ns-warn, #b45309)", marginBottom: 12, fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
              <Warning size={13} weight="fill" style={{ flexShrink: 0 }} />請將此碼列印或抄寫到安全的地方。關閉後無法再次檢視。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
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
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--ns-border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>同步前快照</div>
          <Button variant="ghost" style={{ fontSize: 11.5 }} onClick={() => {
            setShowBackups(!showBackups);
          }}>
            {showBackups ? "收起" : `查看備份`}
          </Button>
        </div>
        <p className="text-sm muted" style={{ marginBottom: showBackups ? 10 : 0 }}>
          每次同步前自動儲存，最多保留 3 份。若同步後資料異常可還原。
        </p>
        {showBackups && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {backups.length === 0
              ? <div className="muted" style={{ fontSize: 12 }}>尚無快照（執行一次同步後會自動建立）</div>
              : backups.map((b) => (
                <div key={b.timestamp} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 12px", borderRadius: "var(--ns-r-sm)", background: "var(--ns-bg-hover)",
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{b.label}</div>
                    <div className="mono muted" style={{ fontSize: 10.5 }}>{b.timestamp.slice(0, 19).replace("T", " ")}</div>
                  </div>
                  <Button variant="ghost" style={{ fontSize: 11.5, color: "var(--ns-warn, #b45309)" }}
                    onClick={() => handleRestore(b.timestamp)}>
                    還原
                  </Button>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Add device dialog */}
      {showDialog && (
        <AddDeviceDialog
          tab={dialogTab}
          onTabChange={tab => {
            setDialogTab(tab);
            if (tab === "show" && !session) handleGenerateCode();
          }}
          onClose={() => setShowDialog(false)}
          session={session}
          sessionLoading={sessionLoading}
          secondsLeft={secondsLeft}
          codeDisplay={codeDisplay}
          onGenerateCode={handleGenerateCode}
          joinCode={joinCode}
          onJoinCodeChange={setJoinCode}
          joinDeviceName={joinDeviceName}
          onJoinDeviceNameChange={setJoinDeviceName}
          joinLoading={joinLoading}
          joinError={joinError}
          onJoin={handleJoin}
        />
      )}
    </Card>
  );
}

// ─────── Add Device Dialog ───────

interface AddDeviceDialogProps {
  tab: "show" | "join";
  onTabChange: (t: "show" | "join") => void;
  onClose: () => void;
  session: PairingSession | null;
  sessionLoading: boolean;
  secondsLeft: number;
  codeDisplay: string;
  onGenerateCode: () => void;
  joinCode: string;
  onJoinCodeChange: (v: string) => void;
  joinDeviceName: string;
  onJoinDeviceNameChange: (v: string) => void;
  joinLoading: boolean;
  joinError: string | null;
  onJoin: () => void;
  hideShowTab?: boolean;
}

function AddDeviceDialog({
  tab, onTabChange, onClose,
  session, sessionLoading, secondsLeft, codeDisplay, onGenerateCode,
  joinCode, onJoinCodeChange, joinDeviceName, onJoinDeviceNameChange,
  joinLoading, joinError, onJoin,
  hideShowTab,
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
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card style={{ width: 480, padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 0" }}>
          <h3 style={{ fontFamily: "var(--ns-font-display)", fontSize: 17, fontWeight: 600, margin: 0 }}>新增裝置</h3>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X size={16} /></Button>
        </div>

        {/* Tabs */}
        {!hideShowTab && (
          <div style={{ display: "flex", gap: 0, padding: "14px 22px 0", borderBottom: "1px solid var(--ns-border)" }}>
            {(["show", "join"] as const).map(t => (
              <button key={t} onClick={() => onTabChange(t)} style={{
                fontSize: 13, fontWeight: 500, padding: "8px 16px",
                borderBottom: tab === t ? "2px solid var(--ns-accent)" : "2px solid transparent",
                color: tab === t ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                background: "none", border: "none", borderRadius: 0, cursor: "pointer",
              }}>
                {t === "show" ? "顯示配對碼" : "輸入配對碼"}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: "24px 22px 22px" }}>
          {/* ── Show pairing code (Device A) ── */}
          {tab === "show" && (
            <div>
              <p className="text-sm muted" style={{ marginBottom: 20 }}>
                在新裝置上開啟 Northstar，選擇「我有配對碼」，輸入下方的配對碼，或掃描 QR Code。
              </p>

              {sessionLoading && (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ns-fg-muted)", fontSize: 13 }}>
                  <Spinner size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                  產生配對碼中…
                </div>
              )}

              {session && (
                <>
                  {/* Code */}
                  <div style={{
                    textAlign: "center", padding: "20px 0 16px",
                    fontFamily: "var(--ns-font-mono)", fontSize: 38, fontWeight: 700,
                    letterSpacing: 6, color: "var(--ns-fg)",
                  }}>
                    {codeDisplay}
                  </div>

                  {/* Timer */}
                  <div style={{ textAlign: "center", fontSize: 12, color: secondsLeft < 60 ? "var(--ns-neg)" : "var(--ns-fg-muted)", marginBottom: 20 }}>
                    {secondsLeft > 0 ? `${mins}:${secs} 後失效` : "配對碼已失效"}
                  </div>

                  {/* QR */}
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                    <div style={{ padding: 14, background: "#fff", borderRadius: "var(--ns-r-md)", display: "inline-block" }}>
                      <QRCode value={session.qrPayload} size={160} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <Button variant="ghost" onClick={handleCopyCode}>
                      <CopySimple size={13} />複製配對碼
                    </Button>
                    {secondsLeft === 0 && (
                      <Button variant="outline" onClick={onGenerateCode}>
                        <ArrowsClockwise size={13} />重新產生
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Enter pairing code (Device B) ── */}
          {tab === "join" && (
            <div>
              <p className="text-sm muted" style={{ marginBottom: 20 }}>
                在已有資料的裝置上點「新增裝置 → 顯示配對碼」，然後在這裡輸入配對碼，或掃描 QR Code。
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11.5, color: "var(--ns-fg-muted)", display: "block", marginBottom: 5 }}>配對碼</label>
                <input
                  className="ns-input"
                  style={{ fontFamily: "var(--ns-font-mono)", fontSize: 22, letterSpacing: 4, textAlign: "center", width: "100%" }}
                  placeholder="XXXX-XXXX"
                  value={joinCode}
                  maxLength={9}
                  onChange={e => handleCodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && joinCode.length === 9) onJoin(); }}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11.5, color: "var(--ns-fg-muted)", display: "block", marginBottom: 5 }}>這台裝置的名稱</label>
                <input
                  className="ns-input"
                  style={{ width: "100%" }}
                  placeholder="My Mac"
                  value={joinDeviceName}
                  onChange={e => onJoinDeviceNameChange(e.target.value)}
                />
              </div>

              {joinError && (
                <div style={{ fontSize: 12, color: "var(--ns-neg)", marginBottom: 14, padding: "10px 12px", background: "var(--ns-neg-soft)", borderRadius: "var(--ns-r-sm)" }}>
                  {joinError}
                </div>
              )}

              <Button
                style={{ width: "100%" }}
                disabled={joinCode.length !== 9 || !joinDeviceName.trim() || joinLoading}
                onClick={onJoin}
              >
                {joinLoading ? <Spinner size={14} className="animate-spin" /> : <CheckCircle size={14} weight="bold" />}
                {joinLoading ? "配對中…" : "加入同步"}
              </Button>
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
      <div className="ns-eyebrow" style={{ fontSize: 10.5, marginBottom: 3 }}>{label}</div>
      <div className={mono ? "mono" : ""} style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// Built-in "check for updates" via the Tauri updater plugin. The plugin module
// is dynamically imported so the web/dev build (no Tauri runtime) stays happy;
// outside a desktop build the button reports that updates aren't available.
function UpdateChecker() {
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

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
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) { setMessage("已是最新版本。"); return; }
      setMessage(`發現新版本 v${update.version}，下載並安裝中…`);
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      setMessage("更新完成，正在重新啟動…");
      await relaunch();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const noRelease = /fetch|not found|404|valid release/i.test(detail);
      setMessage(
        !isDesktop
          ? "檢查更新僅在桌面版可用。"
          : noRelease
            ? "已是最新版本。"
            : `無法檢查更新：${detail}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 className="font-semibold">應用程式更新</h3>
        {currentVersion && (
          <span className="mono muted" style={{ fontSize: 11.5 }}>v{currentVersion}</span>
        )}
      </div>
      <p className="text-sm muted mb-4">檢查並安裝 Northstar 的最新桌面版本。所有更新都經過簽章驗證。</p>
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={checkForUpdates} disabled={busy}>
          <ArrowsClockwise size={14} />{busy ? "檢查中…" : "檢查更新"}
        </Button>
        {message ? <span className="text-sm muted">{message}</span> : null}
      </div>
    </Card>
  );
}
