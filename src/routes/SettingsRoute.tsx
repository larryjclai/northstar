import { ArrowsClockwise, CheckCircle, CurrencyCircleDollar, DownloadSimple, Eye, EyeSlash, Globe, Key, PencilSimple, Plus, Storefront, Tag, Trash, UploadSimple, UsersThree, X, CaretDown, CaretRight, Backspace, Gear, Bank, Target } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ActionButton } from "../components/ActionButton";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository, type RepositorySnapshot } from "../data/repositories";
import { COMMON_TIMEZONES, isValidTimezone } from "../domain";

import type { AppSettings, CategoryGroup, DailyFxRate, ExchangeRate } from "../domain";
import { useRefreshFxRates } from "../features/market-data/useMarketRefresh";
import { useUiPreferences, type ClockMode, type NameLocalePreference } from "../state/uiPreferences";
import { getOrCreateDeviceIdentity } from "../state/deviceIdentity";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import EmojiPicker from "emoji-picker-react";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";

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
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%', overflow: 'hidden' }}>
      {/* Settings sidebar */}
      <aside style={{ borderRight: '1px solid var(--ns-border)', padding: '22px 12px', overflowY: 'auto', background: 'var(--ns-surface)' }}>
        <div style={{ padding: '0 8px 16px' }}>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Settings</div>
          <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, margin: 0, fontWeight: 600 }}>{t('settings.title')}</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
      <main style={{ overflow: 'auto', padding: '28px 36px 100px' }}>
        {tab === 'categories' && <SettingsCategories form={form} setForm={setForm} submit={submit} t={t} />}
        {tab === 'merchants'  && <SettingsMerchants form={form} setForm={setForm} submit={submit} t={t} />}
        {tab === 'fx'         && <SettingsFX form={form} setForm={setForm} submit={submit} dailyFxRates={dailyFxRates.data || []} t={t} />}
        {tab === 'general'    && <SettingsGeneral form={form} t={t} />}
      </main>
    </div>
  );
}

// ─────── Categories Tab ───────
function SettingsCategories({ form, setForm, submit, t }: any) {
  const toast = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#9fe870', budget: '' });
  const [expandId, setExpandId] = useState<string | null>(null);
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
    const nextCat = { name: newCat.name, children: [], icon: newCat.icon, color: newCat.color, budget: newCat.budget ? +newCat.budget : undefined };
    const nextForm = { ...form, categories: [...form.categories, nextCat] };
    submit(nextForm);
    setNewCat({ name: '', icon: '📦', color: '#9fe870', budget: '' });
    setAdding(false);
    toast.success("已新增分類");
  }

  function deleteCategory(name: string) {
    if (!window.confirm("確定刪除此分類？")) return;
    const nextForm = { ...form, categories: form.categories.filter((c: any) => c.name !== name) };
    submit(nextForm);
    toast.success("已刪除分類");
  }

  function saveEdit(oldName: string, patch: any) {
    const nextForm = { 
      ...form, 
      categories: form.categories.map((c: any) => c.name === oldName ? { ...c, ...patch } : c) 
    };
    submit(nextForm);
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
        <button className="ns-btn primary" onClick={() => setAdding(true)}>
          <Plus size={14} weight="bold" />{t('settings.addCategory')}
        </button>
      </div>

      {adding && (
        <div className="ns-card" style={{ padding: 18, marginBottom: 14, border: '1.5px solid var(--ns-accent)' }}>
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
                  {newCat.icon}
                </PopoverTrigger>
                <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
                  <EmojiPicker 
                    onEmojiClick={(emojiData) => setNewCat(n=>({...n,icon: emojiData.emoji}))} 
                    width={300} 
                    height={400} 
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
            <button className="ns-btn ghost" onClick={() => setAdding(false)}>取消</button>
            <button className="ns-btn primary" onClick={addCategory} style={{ opacity: newCat.name?1:0.5 }}>
              <CheckCircle size={13} weight="bold" />新增
            </button>
          </div>
        </div>
      )}

      <div className="ns-card" style={{ padding: 0 }}>
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--ns-border)',
          display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
          fontSize:10.5, color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07, textTransform:'uppercase' }}>
          <span>Category</span>
          <span style={{textAlign:'right'}}>{t('settings.spent')}</span>
          <span style={{textAlign:'right'}}>{t('settings.budget')}</span>
          <span style={{paddingLeft:8}}>{t('settings.usage')}</span>
          <span />
        </div>
        {form.categories.map((c: any, i: number) => {
          const spent = 0; // Mock spent for now, usually computed from ledger
          const over = c.budget && spent > c.budget;
          const pct  = c.budget ? Math.min(spent / c.budget, 1) : 0;
          const isEdit = editId === c.name;
          return (
            <div key={c.name}>
              <div style={{
                display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
                alignItems:'center', padding:'13px 20px',
                borderTop: i ? '1px solid var(--ns-border)' : 'none',
                background: isEdit ? 'var(--ns-bg-hover)' : 'transparent',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }} onClick={() => setExpandId(expandId===c.name ? null : c.name)}>
                  <div style={{ width:34,height:34,borderRadius:'var(--ns-r-sm)',fontSize:18,
                    background:(c.color||'#868685')+'28',display:'flex',alignItems:'center',justifyContent:'center' }}>{c.icon||'📦'}</div>
                  <div>
                    <div style={{ fontSize:13.5,fontWeight:500 }}>{c.name}</div>
                    <div className="muted mono" style={{ fontSize:10.5 }}>{c.children?.length||0} {t('settings.subcategories')}</div>
                  </div>
                  {expandId===c.name ? <CaretDown size={12} /> : <CaretRight size={12} />}
                </div>
                <span className={'num '+(over?'neg':'')} style={{ textAlign:'right',fontSize:14,fontWeight:over?600:400 }}>
                  NT$0
                </span>
                <span className="num muted" style={{ textAlign:'right',fontSize:13 }}>
                  {c.budget?'NT$'+c.budget.toLocaleString():'—'}
                </span>
                <div style={{ paddingLeft:8 }}>
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
                  <button className="ns-btn ghost icon" style={{padding:6}} onClick={() => setEditId(isEdit?null:c.name)}>
                    <Gear size={14} />
                  </button>
                  <button className="ns-btn ghost icon" style={{padding:6,color:'var(--ns-neg)'}} onClick={() => deleteCategory(c.name)}>
                    <Backspace size={14} />
                  </button>
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
                            <button className="ns-btn ghost icon" style={{padding:'3px 6px'}} onClick={() => { setEditingSub({ cat: c.name, sub: s }); setEditSubValue(s); }}><PencilSimple size={12}/></button>
                          )}
                          <button className="ns-btn ghost icon" style={{color:'var(--ns-neg)', padding:'3px 6px'}} onClick={() => {
                            const nextForm = { ...form, categories: form.categories.map((cat: any) => cat.name === c.name ? { ...cat, children: cat.children.filter((x: string) => x !== s) } : cat) };
                            submit(nextForm);
                          }}><Trash size={12}/></button>
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
                      <button className="ns-btn ghost" style={{ fontSize: 12, padding: "4px 8px", minHeight: "auto" }} onClick={() => { setAddingSubFor(c.name); setNewSubValue(''); }}><Plus size={12} style={{ marginRight: 4 }} />新增子分類</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditCatForm({ cat, colors, onSave, onCancel }: any) {
  const [name,   setName]   = useState(cat.name);
  const [icon,   setIcon]   = useState(cat.icon || '📦');
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
              {icon}
            </PopoverTrigger>
            <PopoverContent className="z-[150] shadow-xl rounded-xl w-auto p-0">
              <EmojiPicker 
                onEmojiClick={(emojiData) => setIcon(emojiData.emoji)} 
                width={300} 
                height={400} 
              />
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
          <button className="ns-btn ghost" style={{fontSize:12}} onClick={onCancel}>取消</button>
          <button className="ns-btn primary" style={{fontSize:12}} onClick={()=>onSave({name,icon,color,budget:budget?+budget:null})}>
            <CheckCircle size={14} weight="bold" />儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────── Merchants Tab ───────
function SettingsMerchants({ form, setForm, submit, t }: any) {
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

  function saveEdit(oldName: string) {
    const next = editValue.trim();
    if (!next) return;
    const nextForm = { ...form, merchants: [...new Set(form.merchants.map((m: string) => m === oldName ? next : m))] };
    submit(nextForm);
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
          <button className="ns-btn primary" onClick={() => { setAdding(true); setNewMerchant(''); }}><Plus size={14}/>{t('settings.addMerchant')}</button>
        </div>
      </div>

      <div style={{ position:'relative', marginBottom:16 }}>
        <input className="ns-input" placeholder="搜尋商家名稱..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <div className="ns-card" style={{padding:0}}>
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
              <button className="ns-btn ghost icon" onClick={addMerchant}><CheckCircle size={16}/></button>
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
                <button className="ns-btn ghost icon" style={{color:'var(--ns-fg-muted)'}} onClick={()=>startEdit(m)}>
                  <PencilSimple size={14}/>
                </button>
              )}
              <button className="ns-btn ghost icon" style={{color:'var(--ns-neg)'}} onClick={()=>deleteMerchant(m)}>
                <Trash size={14}/>
              </button>
            </div>
          </div>
        ))}
      </div>
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
          <button className="ns-btn" onClick={addRate}><Plus size={14}/>新增</button>
          <button className="ns-btn primary" onClick={refreshAll} disabled={refreshFxRates.isPending}><ArrowsClockwise size={14}/>全部更新</button>
        </div>
      </div>

      <div className="ns-card" style={{padding:18, marginBottom:16}}>
        <div className="ns-eyebrow" style={{marginBottom:8}}>{t('settings.baseCurrency')}</div>
        <p className="muted" style={{fontSize:12,margin:'0 0 12px'}}>{t('settings.baseCurrencyDesc')}</p>
        <input className="ns-input max-w-xs" value={form.primaryCurrency} onChange={e => submit({...form, primaryCurrency: e.target.value.toUpperCase()})} />
      </div>

      <div className="ns-card" style={{padding:0}}>
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
              <input className="ns-input" type="number" step="0.01" style={{textAlign:'right'}} value={r.rate} onChange={e=>updateRate(i, { rate: +e.target.value })} />
              <input className="ns-input" style={{textAlign:'right'}} value={r.to || form.primaryCurrency} onChange={e=>updateRate(i, { to: e.target.value.toUpperCase() })} />
              <div className="dim" style={{fontSize: 11, textAlign: 'right'}}>{stat ? `${stat.count} records` : 'No history'}</div>
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button className="ns-btn ghost icon" style={{color:'var(--ns-neg)'}} onClick={()=>deleteRate(i)}><Trash size={14}/></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

// ─────── General & Export Tab ───────
function SettingsGeneral({ form, t }: any) {
  const toast = useToast();
  const privacyMode = useUiPreferences((state) => state.privacyMode);
  const togglePrivacy = useUiPreferences((state) => state.togglePrivacyMode);
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const setNameLocale = useUiPreferences((state) => state.setNameLocale);
  const timezone = useUiPreferences((state) => state.timezone);
  const setTimezone = useUiPreferences((state) => state.setTimezone);
  const assetLogosEnabled = useUiPreferences((state) => state.assetLogosEnabled);
  const setAssetLogosEnabled = useUiPreferences((state) => state.setAssetLogosEnabled);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
    if (!window.confirm("匯入會覆蓋目前所有資料，確定要繼續嗎？")) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as RepositorySnapshot;
      if (!parsed || !Array.isArray(parsed.accounts)) throw new Error("無效檔案");
      
      const repository = await getFinanceRepository();
      await repository.importSnapshot(parsed);
      await queryClient.invalidateQueries();
      toast.success("匯入成功");
    } catch (e) {
      toast.error("匯入失敗");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 style={{fontFamily:'var(--ns-font-display)',fontSize:24,margin:0,fontWeight:600}}>{t('settings.general')}</h2>
        <p className="muted" style={{fontSize:13,marginTop:4,marginBottom:0}}>{t('settings.generalDesc')}</p>
      </div>

      <div className="ns-card p-5">
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

        <h3 className="font-semibold mb-4 mt-6">{t('settings.language')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {[{v:'auto',l:'Auto'},{v:'en',l:'English'},{v:'zh-Hant',l:'繁體中文'}].map(o => (
            <button key={o.v} onClick={()=>setNameLocale(o.v as any)} className="ns-btn" style={{ borderColor: nameLocale===o.v?'var(--ns-accent)':'var(--ns-border)'}}>
              {o.l}
            </button>
          ))}
        </div>

        <h3 className="font-semibold mb-4 mt-6">{t('settings.timezone')}</h3>
        <select value={timezone} onChange={e=>setTimezone(e.target.value)} className="ns-input w-full">
          {COMMON_TIMEZONES.map(tz => <option key={tz.id} value={tz.id}>{tz.label}</option>)}
        </select>

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
      </div>

      <div className="ns-card p-5">
        <h3 className="font-semibold mb-2">{t('settings.backupTitle')}</h3>
        <p className="text-sm muted mb-4">{t('settings.backupDesc')}</p>
        <div className="flex gap-2">
          <button className="ns-btn primary" onClick={exportBackup}><DownloadSimple size={14}/>{t('settings.exportJson')}</button>
          <button className="ns-btn ghost" onClick={()=>fileInputRef.current?.click()}><UploadSimple size={14}/>{t('settings.importBackup')}</button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e)=>{
            const file = e.target.files?.[0];
            if (file) importBackup(file);
            e.target.value = '';
          }} />
        </div>
      </div>

      <UpdateChecker />
      <ConnectStatus />
    </div>
  );
}

// Connect Sync — preparation status. No cloud push yet; surfaces the local
// device identity and how many local changes are pending a future sync.
function ConnectStatus() {
  const [identity] = useState(() => getOrCreateDeviceIdentity());
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const repository = await getFinanceRepository();
        const result = await repository.collectPendingChanges(identity.lastSyncCursor);
        if (active) setPending(result.count);
      } catch {
        if (active) setPending(null);
      }
    })();
    return () => { active = false; };
  }, [identity.lastSyncCursor]);

  return (
    <div className="ns-card p-5">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <h3 className="font-semibold">Connect 同步</h3>
        <span className="ns-pill" style={{ fontSize: 10.5 }}>準備中</span>
      </div>
      <p className="text-sm muted mb-4">多裝置加密同步即將推出。以下為本機的同步基礎資訊。</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
        <Stat label="裝置 ID" value={identity.deviceId.slice(0, 8)} mono />
        <Stat label="建立時間" value={identity.createdAt.slice(0, 10)} mono />
        <Stat label="待同步變更" value={pending === null ? "—" : `${pending} 筆`} />
        <Stat label="上次同步" value={identity.lastSyncCursor ? identity.lastSyncCursor.slice(0, 10) : "尚未同步"} mono />
      </div>
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
            ? "尚未發布正式版本，目前無可用更新。"
            : `無法檢查更新：${detail}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ns-card p-5">
      <h3 className="font-semibold mb-2">應用程式更新</h3>
      <p className="text-sm muted mb-4">檢查並安裝 Northstar 的最新桌面版本。所有更新都經過簽章驗證。</p>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="ns-btn primary" onClick={checkForUpdates} disabled={busy}>
          <ArrowsClockwise size={14} />{busy ? "檢查中…" : "檢查更新"}
        </button>
        {message ? <span className="text-sm muted">{message}</span> : null}
      </div>
    </div>
  );
}
