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

// ─────── Categories Tab ───────
export function SettingsCategories({ form, setForm, submit, t, renameCategory }: SettingsTabProps & { renameCategory: (oldName: string, newName: string) => Promise<unknown> }) {
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
    const target = form.categories.find((cat) => cat.name === catName);
    if (target?.children?.includes(next)) { toast.error("子分類已存在"); return; }
    const nextForm = { ...form, categories: form.categories.map((cat) => cat.name === catName ? { ...cat, children: cat.children.map((child: string) => child === oldSub ? next : child) } : cat) };
    submit(nextForm);
    toast.success("已更新子分類");
  }

  function addSubcategory(catName: string, rawName: string) {
    const name = rawName.trim();
    setAddingSubFor(null);
    setNewSubValue('');
    if (!name) return;
    const target = form.categories.find((cat) => cat.name === catName);
    if (target?.children?.includes(name)) { toast.error("子分類已存在"); return; }
    const nextForm = { ...form, categories: form.categories.map((cat) => cat.name === catName ? { ...cat, children: [...(cat.children || []), name] } : cat) };
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
    const nextForm = { ...form, categories: form.categories.filter((c) => c.name !== name) };
    submit(nextForm);
    setConfirmDeleteId(null);
    toast.success("已刪除分類");
  }

  async function saveEdit(oldName: string, patch: Partial<CategoryGroup>) {
    if (patch.name && patch.name !== oldName) {
      await renameCategory(oldName, patch.name);
      // renameCategory already updates settings; merge remaining patch fields
      const nextForm = {
        ...form,
        categories: form.categories.map((c) => c.name === oldName ? { ...c, ...patch } : c),
      };
      submit(nextForm);
    } else {
      const nextForm = {
        ...form,
        categories: form.categories.map((c) => c.name === oldName ? { ...c, ...patch } : c),
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
          <h2 className="text-2xl" style={{ fontFamily: 'var(--ns-font-display)', margin: 0, fontWeight: 600 }}>{t('settings.categories')}</h2>
          <p className="muted text-body" style={{ marginTop: 4, marginBottom: 0 }}>{t('settings.categoriesDesc')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={14} weight="bold" />{t('settings.addCategory')}
        </Button>
      </div>

      {adding && (
        <Card style={{ padding: 18, marginBottom: 14, border: '1.5px solid var(--ns-accent)' }}>
          <div className="text-body" style={{ fontWeight: 500, marginBottom: 12 }}>{t('settings.newCategory')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="text-caption" style={{ color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 5 }}>名稱 *</label>
              <input className="ns-input" value={newCat.name} onChange={e => setNewCat(n=>({...n,name:e.target.value}))} />
            </div>
            <div>
              <label className="text-caption" style={{ color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 5 }}>月預算</label>
              <input className="ns-input" value={newCat.budget} onChange={e => setNewCat(n=>({...n,budget:e.target.value}))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="text-caption" style={{ color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 6 }}>圖示</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Popover>
                <PopoverTrigger className="text-lg" style={{ width:32,height:32,borderRadius:'var(--ns-r-sm)',
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
            <label className="text-caption" style={{ color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 6 }}>顏色</label>
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
        <div className="ns-settings-category-head text-micro" style={{ padding:'10px 20px', borderBottom:'1px solid var(--ns-border)',
          display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
          color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07, textTransform:'uppercase' }}>
          <span>Category</span>
          <span style={{textAlign:'right'}}>{t('settings.spent')}</span>
          <span className="ns-settings-category-budget" style={{textAlign:'right'}}>{t('settings.budget')}</span>
          <span className="ns-settings-category-usage" style={{paddingLeft:8}}>{t('settings.usage')}</span>
          <span />
        </div>
        {form.categories.map((c, i: number) => {
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
                  <div className="text-lg" style={{ width:34,height:34,borderRadius:'var(--ns-r-sm)',
                    background:(c.color||'#868685')+'28',display:'flex',alignItems:'center',justifyContent:'center' }}><Glyph name={c.iconName || 'Tag'} size={18} /></div>
                  <div>
                    <div className="text-body" style={{ fontWeight:500 }}>{c.name}</div>
                    <div className="muted mono text-micro">{c.children?.length||0} {t('settings.subcategories')}</div>
                  </div>
                  {expandId===c.name ? <CaretDown size={12} /> : <CaretRight size={12} />}
                </div>
                <span className={'num text-sm '+(over?'neg':'')} style={{ textAlign:'right',fontWeight:over?600:400 }}>
                  NT$0
                </span>
                <span className="num muted ns-settings-category-budget text-body" style={{ textAlign:'right' }}>
                  {c.budget?'NT$'+c.budget.toLocaleString():'—'}
                </span>
                <div className="ns-settings-category-usage" style={{ paddingLeft:8 }}>
                  {c.budget ? (
                    <>
                      <div style={{ height:7,borderRadius:99,background:'var(--ns-bg-hover)',overflow:'hidden',marginBottom:3 }}>
                        <div style={{ width:(pct*100)+'%',height:'100%',background:over?'var(--ns-neg)':(c.color||'#868685'),borderRadius:99 }} />
                      </div>
                      <div className="mono text-micro" style={{ color:over?'var(--ns-neg)':'var(--ns-fg-dim)' }}>
                        {(pct*100).toFixed(0)}%{over?' · '+t('settings.overBudget'):''}
                      </div>
                    </>
                  ) : <span className="dim text-caption">{t('settings.noLimit')}</span>}
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
                  <EditCatForm cat={c} colors={colorPicker} onSave={(patch) => saveEdit(c.name, patch)} onCancel={() => setEditId(null)} />
                </div>
              )}

              {expandId === c.name && (
                <div style={{ background:'var(--ns-bg)', borderTop:'1px solid var(--ns-border)' }}>
                  {c.children?.map((s: string, si: number) => {
                    const isEditingSub = editingSub?.cat === c.name && editingSub?.sub === s;
                    return (
                      <div key={s} className="text-body" style={{ padding:'9px 20px 9px 66px', display:'flex', alignItems:'center', gap:10,
                        borderTop: si?'1px solid var(--ns-border)':'none' }}>
                        <span className="dim">↳</span>
                        {isEditingSub ? (
                          <input
                            autoFocus
                            className="ns-input text-body"
                            style={{ flex:1, padding:'4px 8px' }}
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
                            const nextForm = { ...form, categories: form.categories.map((cat) => cat.name === c.name ? { ...cat, children: cat.children.filter((x: string) => x !== s) } : cat) };
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
                        className="ns-input text-body"
                        style={{ width:'60%', padding:'4px 8px' }}
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
                      <Button variant="ghost" className="text-xs" style={{ padding: "4px 8px", minHeight: "auto" }} onClick={() => { setAddingSubFor(c.name); setNewSubValue(''); }}><Plus size={12} style={{ marginRight: 4 }} />新增子分類</Button>
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

function EditCatForm({ cat, colors, onSave, onCancel }: { cat: CategoryGroup; colors: string[]; onSave: (patch: Partial<CategoryGroup>) => void; onCancel: () => void }) {
  const [name,   setName]   = useState(cat.name);
  const [icon,   setIcon]   = useState(cat.iconName || 'Tag');
  const [color,  setColor]  = useState(cat.color || '#868685');
  const [budget, setBudget] = useState(cat.budget || '');
  const [rollover, setRollover] = useState(Boolean(cat.rollover));
  // Which entry types this category appears for in the 收入/支出 picker (plan 056).
  // Absent ⇒ "both" so existing categories keep showing for both types.
  const [kind, setKind] = useState<NonNullable<CategoryGroup['kind']>>(cat.kind ?? 'both');
  const currentMonth = new Date().toISOString().slice(0, 7);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <div>
        <label className="text-caption" style={{ color:'var(--ns-fg-muted)',display:'block',marginBottom:4 }}>名稱</label>
        <input className="ns-input text-body"value={name} onChange={e=>setName(e.target.value)}/>
      </div>
      <div>
        <label className="text-caption" style={{ color:'var(--ns-fg-muted)',display:'block',marginBottom:4 }}>月預算 (NTD)</label>
        <input className="ns-input text-body"placeholder="留空 = 不設限" value={budget} onChange={e=>setBudget(e.target.value)}/>
      </div>
      <div>
        <label className="text-caption" style={{ color:'var(--ns-fg-muted)',display:'block',marginBottom:6 }}>圖示</label>
        <div style={{ display:'flex',flexWrap:'wrap',gap:5 }}>
          <Popover>
            <PopoverTrigger className="text-lg" style={{ width:32,height:32,borderRadius:'var(--ns-r-sm)',
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
        <label className="text-caption" style={{ color:'var(--ns-fg-muted)',display:'block',marginBottom:6 }}>顏色</label>
        <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
          {colors.map((c: string)=>(
            <div key={c} onClick={()=>setColor(c)} style={{
              width:20,height:20,borderRadius:99,background:c,cursor:'pointer',
              outline:color===c?'2px solid var(--ns-fg)':'none',outlineOffset:2 }} />
          ))}
        </div>
      </div>
      <div style={{ gridColumn:'1 / -1', padding:'10px 0', borderTop:'1px dashed var(--ns-border)' }}>
        <label className="text-caption" style={{ color:'var(--ns-fg-muted)', display:'block', marginBottom:6 }}>適用類型</label>
        <div style={{ display:'flex', gap:6 }}>
          {([
            { value: 'both', label: '兩者' },
            { value: 'income', label: '收入' },
            { value: 'expense', label: '支出' },
          ] as const).map((opt) => (
            <Button
              key={opt.value}
              variant={kind === opt.value ? 'default' : 'ghost'}
              className="text-xs"
              onClick={() => setKind(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="text-caption" style={{ color:'var(--ns-fg-muted)', marginTop:6 }}>
          決定此分類在記帳時出現於收入、支出或兩者的選單。
        </div>
      </div>
      <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 0', borderTop:'1px dashed var(--ns-border)' }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input type="checkbox" checked={rollover} onChange={e=>setRollover(e.target.checked)} disabled={!budget} />
          <div>
            <div className="text-body" style={{ fontWeight:500 }}>預算結轉（rollover）</div>
            <div className="text-caption" style={{ color:'var(--ns-fg-muted)' }}>沒花完的預算滾入下月；超支則扣除。需設定月預算。</div>
          </div>
        </label>
        {rollover && (
          <Button variant="ghost" className="text-xs" onClick={()=>onSave({ rolloverStart: currentMonth })}>
            清除結轉
          </Button>
        )}
      </div>
      <div style={{ gridColumn:'1 / -1', display:'flex',gap:8 }}>
        <Button variant="ghost" className="text-xs" onClick={onCancel}>取消</Button>
        <Button className="text-xs" onClick={()=>onSave({name,iconName:icon,color,budget:budget?+budget:null,rollover,kind})}>
          <CheckCircle size={14} weight="bold" />儲存
        </Button>
      </div>
    </div>
  );
}

// ─────── Merchants Tab ───────
