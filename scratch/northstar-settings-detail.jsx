// northstar-settings-detail.jsx — Settings V2 · Categories / Merchants / FX / Export

// ─────── Categories tab ───────
function SettingsCategories({ cats, setCats }) {
  const [editId, setEditId]     = React.useState(null);
  const [adding, setAdding]     = React.useState(false);
  const [newCat, setNewCat]     = React.useState({ name: '', icon: '📦', color: '#9fe870', budget: '' });
  const [expandId, setExpandId] = React.useState(null);

  const iconPicker = ['🍱','🚖','🎮','📺','🏠','💊','📚','☕','✈️','💪','🛒','🎵','📦','💰','🐾','🌿','🎓','🧴'];
  const colorPicker = ['#f0c050','#6fb3ff','#a99cff','#6ee49a','#ff7d6b','#34c5b0','#f0a050','#9fe870','#d97a9c','#868685'];

  function saveEdit(id, patch) {
    setCats(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
    setEditId(null);
  }

  function addCategory() {
    if (!newCat.name) return;
    setCats(cs => [...cs, { id: Date.now(), ...newCat, budget: newCat.budget ? +newCat.budget : null, spent: 0, txns: 0, sub: [] }]);
    setNewCat({ name: '', icon: '📦', color: '#9fe870', budget: '' });
    setAdding(false);
  }

  function deleteCategory(id) {
    setCats(cs => cs.filter(c => c.id !== id));
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Manage · {cats.length} categories</div>
          <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, margin: 0, fontWeight: 600 }}>分類管理</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 0 }}>每筆交易可歸入一個分類，並設定月預算上限。</p>
        </div>
        <button className="ns-btn primary" onClick={() => setAdding(true)}>
          <NSIcon name="plus" size={14} strokeWidth={2} />新增分類
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        {[
          ['已消費', 'NT$' + cats.reduce((s,c) => s+c.spent,0).toLocaleString(), ''],
          ['預算合計', 'NT$' + cats.filter(c=>c.budget).reduce((s,c) => s+(c.budget||0),0).toLocaleString(), ''],
          ['超支分類', cats.filter(c=>c.budget&&c.spent>c.budget).length + ' 個', cats.filter(c=>c.budget&&c.spent>c.budget).length>0?'neg':''],
        ].map(([l,v,cls]) => (
          <div key={l} className="ns-card" style={{ padding: '14px 16px' }}>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{l}</div>
            <div className={'num ' + cls} style={{ fontSize: 20, fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Add new category form */}
      {adding && (
        <div className="ns-card" style={{ padding: 18, marginBottom: 14, border: '1.5px solid var(--ns-accent)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>新分類</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 5 }}>名稱 *</label>
              <input className="ns-input" placeholder="例：旅行" value={newCat.name} onChange={e => setNewCat(n=>({...n,name:e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 5 }}>月預算（NTD）</label>
              <input className="ns-input" placeholder="不設限" value={newCat.budget} onChange={e => setNewCat(n=>({...n,budget:e.target.value}))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', display: 'block', marginBottom: 6 }}>圖示</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {iconPicker.map(ic => (
                <button key={ic} onClick={() => setNewCat(n=>({...n,icon:ic}))}
                  style={{ width:32,height:32,borderRadius:'var(--ns-r-sm)',fontSize:18,
                    background:newCat.icon===ic?'var(--ns-accent-soft)':'var(--ns-bg-hover)',
                    border:newCat.icon===ic?'1.5px solid var(--ns-accent)':'1px solid transparent',
                    cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>{ic}</button>
              ))}
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
              <NSIcon name="check" size={13} strokeWidth={2} />新增
            </button>
          </div>
        </div>
      )}

      {/* Category list */}
      <div className="ns-card" style={{ padding: 0 }}>
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--ns-border)',
          display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
          fontSize:10.5, color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07, textTransform:'uppercase' }}>
          <span>Category</span>
          <span style={{textAlign:'right'}}>Spent</span>
          <span style={{textAlign:'right'}}>Budget</span>
          <span style={{paddingLeft:8}}>Usage</span>
          <span />
        </div>
        {cats.map((c, i) => {
          const over = c.budget && c.spent > c.budget;
          const pct  = c.budget ? Math.min(c.spent / c.budget, 1) : 0.5;
          const isEdit = editId === c.id;
          return (
            <div key={c.id}>
              {/* Main row */}
              <div style={{
                display:'grid', gridTemplateColumns:'2.2fr 1fr 1fr 1.6fr 80px',
                alignItems:'center', padding:'13px 20px',
                borderTop: i ? '1px solid var(--ns-border)' : 'none',
                background: isEdit ? 'var(--ns-bg-hover)' : 'transparent',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                  onClick={() => setExpandId(expandId===c.id ? null : c.id)}>
                  <div style={{ width:34,height:34,borderRadius:'var(--ns-r-sm)',fontSize:18,
                    background:c.color+'28',display:'flex',alignItems:'center',justifyContent:'center' }}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize:13.5,fontWeight:500 }}>{c.name}</div>
                    <div className="muted mono" style={{ fontSize:10.5 }}>{c.txns} 筆{c.sub.length>0?' · '+c.sub.length+' 子分類':''}</div>
                  </div>
                  <NSIcon name={expandId===c.id?'chevDown':'chevRight'} size={12} />
                </div>
                <span className={'num '+(over?'neg':'')} style={{ textAlign:'right',fontSize:14,fontWeight:over?600:400 }}>
                  NT${c.spent.toLocaleString()}
                </span>
                <span className="num muted" style={{ textAlign:'right',fontSize:13 }}>
                  {c.budget?'NT$'+c.budget.toLocaleString():'—'}
                </span>
                <div style={{ paddingLeft:8 }}>
                  {c.budget ? (
                    <>
                      <div style={{ height:7,borderRadius:99,background:'var(--ns-bg-hover)',overflow:'hidden',marginBottom:3 }}>
                        <div style={{ width:(pct*100)+'%',height:'100%',background:over?'var(--ns-neg)':c.color,borderRadius:99 }} />
                      </div>
                      <div className="mono" style={{ fontSize:10,color:over?'var(--ns-neg)':'var(--ns-fg-dim)' }}>
                        {(c.spent/c.budget*100).toFixed(0)}%{over?' · 超支 NT$'+(c.spent-c.budget).toLocaleString():''}
                      </div>
                    </>
                  ) : <span className="dim" style={{fontSize:11}}>無上限</span>}
                </div>
                <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                  <button className="ns-btn ghost icon" style={{padding:6}} onClick={() => setEditId(isEdit?null:c.id)}>
                    <NSIcon name="settings" size={13} />
                  </button>
                  <button className="ns-btn ghost icon" style={{padding:6,color:'var(--ns-neg)'}}
                    onClick={() => deleteCategory(c.id)}>
                    <NSIcon name="backspace" size={13} />
                  </button>
                </div>
              </div>

              {/* Inline edit panel */}
              {isEdit && (
                <div style={{ padding:'14px 20px 16px', borderTop:'1px dashed var(--ns-border)', background:'var(--ns-bg-hover)' }}>
                  <EditCatForm cat={c} colors={colorPicker} icons={iconPicker} onSave={patch => saveEdit(c.id, patch)} onCancel={() => setEditId(null)} />
                </div>
              )}

              {/* Subcategories expand */}
              {expandId === c.id && c.sub.length > 0 && (
                <div style={{ background:'var(--ns-bg)', borderTop:'1px solid var(--ns-border)' }}>
                  {c.sub.map((s,si) => (
                    <div key={s} style={{ padding:'9px 20px 9px 66px', display:'flex', alignItems:'center', gap:10,
                      borderTop: si?'1px solid var(--ns-border)':'none', fontSize:13 }}>
                      <span className="dim">↳</span>
                      <span style={{ flex:1 }}>{s}</span>
                      <button className="ns-btn ghost" style={{fontSize:11,padding:'3px 10px'}}>編輯</button>
                    </div>
                  ))}
                  <div style={{ padding:'8px 20px 8px 66px', borderTop:'1px solid var(--ns-border)' }}>
                    <button className="ns-btn ghost" style={{fontSize:12,padding:'5px 10px'}}>
                      <NSIcon name="plus" size={12} strokeWidth={2}/>新增子分類
                    </button>
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

function EditCatForm({ cat, colors, icons, onSave, onCancel }) {
  const [name,   setName]   = React.useState(cat.name);
  const [icon,   setIcon]   = React.useState(cat.icon);
  const [color,  setColor]  = React.useState(cat.color);
  const [budget, setBudget] = React.useState(cat.budget || '');
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
          {icons.map(ic=>(
            <button key={ic} onClick={()=>setIcon(ic)} style={{
              width:28,height:28,borderRadius:'var(--ns-r-xs)',fontSize:16,
              background:icon===ic?'var(--ns-accent-soft)':'transparent',
              border:icon===ic?'1px solid var(--ns-accent)':'1px solid transparent',
              cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{ic}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={{ fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:6 }}>顏色</label>
        <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
          {colors.map(c=>(
            <div key={c} onClick={()=>setColor(c)} style={{
              width:20,height:20,borderRadius:99,background:c,cursor:'pointer',
              outline:color===c?'2px solid var(--ns-fg)':'none',outlineOffset:2 }} />
          ))}
        </div>
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <button className="ns-btn ghost" style={{fontSize:12}} onClick={onCancel}>取消</button>
          <button className="ns-btn primary" style={{fontSize:12}} onClick={()=>onSave({name,icon,color,budget:budget?+budget:null})}>
            <NSIcon name="check" size={12} strokeWidth={2}/>儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────── Merchants tab ───────
function SettingsMerchants({ merchants, setMerchants, cats }) {
  const [search, setSearch]     = React.useState('');
  const [editId, setEditId]     = React.useState(null);
  const [newAlias, setNewAlias] = React.useState('');

  const filtered = merchants.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.alias.some(a => a.toLowerCase().includes(search.toLowerCase()))
  );

  function updateCat(id, cat) {
    setMerchants(ms => ms.map(m => m.id === id ? {...m, cat} : m));
  }
  function addAlias(id) {
    if (!newAlias) return;
    setMerchants(ms => ms.map(m => m.id === id ? {...m, alias:[...m.alias, newAlias]} : m));
    setNewAlias('');
  }
  function removeAlias(id, alias) {
    setMerchants(ms => ms.map(m => m.id===id ? {...m, alias: m.alias.filter(a=>a!==alias)} : m));
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div className="ns-eyebrow" style={{marginBottom:4}}>Auto-categorisation · {merchants.length} merchants</div>
          <h2 style={{ fontFamily:'var(--ns-font-display)',fontSize:24,margin:0,fontWeight:600 }}>商家管理</h2>
          <p className="muted" style={{fontSize:13,marginTop:4,marginBottom:0}}>
            Northstar 會自動辨識商家名稱並套用分類。你可以在此修正或新增別名。
          </p>
        </div>
        <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新增商家</button>
      </div>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <span style={{ position:'absolute', left:12, top:11 }}><NSIcon name="search" size={14}/></span>
        <input className="ns-input" style={{paddingLeft:36}} placeholder="搜尋商家名稱或別名…"
          value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <div className="ns-card" style={{padding:0}}>
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--ns-border)',
          display:'grid', gridTemplateColumns:'2fr 1fr 80px 80px 56px',
          fontSize:10.5, color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07, textTransform:'uppercase' }}>
          <span>商家 / 別名</span><span>分類</span>
          <span style={{textAlign:'right'}}>筆數</span>
          <span style={{textAlign:'right'}}>上次</span><span/>
        </div>
        {filtered.map((m, i) => {
          const isEdit = editId === m.id;
          return (
            <div key={m.id}>
              <div style={{
                display:'grid', gridTemplateColumns:'2fr 1fr 80px 80px 56px',
                alignItems:'center', padding:'13px 20px',
                borderTop: i?'1px solid var(--ns-border)':'none',
                background: isEdit?'var(--ns-bg-hover)':'transparent',
              }}>
                <div>
                  <div style={{fontSize:14,fontWeight:500}}>{m.name}</div>
                  {m.alias.length > 0 && (
                    <div style={{display:'flex',gap:5,marginTop:5,flexWrap:'wrap'}}>
                      {m.alias.map(a=>(
                        <span key={a} className="ns-pill" style={{fontSize:10.5,gap:4}}>
                          {a}
                          {isEdit && (
                            <span style={{cursor:'pointer',opacity:0.6}} onClick={()=>removeAlias(m.id,a)}>✕</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  {isEdit ? (
                    <select value={m.cat}
                      onChange={e=>updateCat(m.id, e.target.value)}
                      style={{ fontFamily:'inherit', fontSize:12.5, padding:'5px 8px',
                        borderRadius:'var(--ns-r-xs)', border:'1px solid var(--ns-border)',
                        background:'var(--ns-bg-elev)', color:'var(--ns-fg)', width:'100%' }}>
                      {cats.map(c=><option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                    </select>
                  ) : (
                    <span className="ns-pill">{cats.find(c=>c.name===m.cat)?.icon} {m.cat}</span>
                  )}
                </div>
                <span className="num muted" style={{textAlign:'right',fontSize:13}}>{m.count}</span>
                <span className="num muted" style={{textAlign:'right',fontSize:13}}>NT${m.lastAmt.toLocaleString()}</span>
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button className="ns-btn ghost icon" style={{padding:6}} onClick={()=>setEditId(isEdit?null:m.id)}>
                    <NSIcon name="settings" size={13}/>
                  </button>
                </div>
              </div>
              {isEdit && (
                <div style={{padding:'12px 20px 14px',borderTop:'1px dashed var(--ns-border)',background:'var(--ns-bg-hover)',display:'flex',gap:8,alignItems:'center'}}>
                  <span style={{fontSize:12,color:'var(--ns-fg-muted)',flexShrink:0}}>新增別名：</span>
                  <input className="ns-input" style={{flex:1,fontSize:12.5}}
                    placeholder="例：7-11, 全家, FamilyMart"
                    value={newAlias} onChange={e=>setNewAlias(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addAlias(m.id)} />
                  <button className="ns-btn" style={{fontSize:12}} onClick={()=>addAlias(m.id)}>
                    <NSIcon name="plus" size={12} strokeWidth={2}/>加入
                  </button>
                  <button className="ns-btn ghost" style={{fontSize:12}} onClick={()=>setEditId(null)}>完成</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────── FX / Currencies tab ───────
function SettingsFX() {
  const [base, setBase]     = React.useState('NTD');
  const [source, setSource] = React.useState('yahoo');
  const [rates, setRates]   = React.useState([
    { ccy:'USD', rate:31.62,  change:-0.08,  manual:null, alert:null, used:true },
    { ccy:'JPY', rate:0.2045, change:+0.15,  manual:null, alert:null, used:true },
    { ccy:'EUR', rate:35.18,  change:-0.25,  manual:null, alert:null, used:false },
    { ccy:'GBP', rate:40.12,  change:+0.06,  manual:null, alert:null, used:false },
    { ccy:'HKD', rate:4.05,   change:-0.12,  manual:null, alert:null, used:false },
    { ccy:'CNY', rate:4.36,   change:+0.04,  manual:null, alert:null, used:false },
    { ccy:'AUD', rate:20.84,  change:-0.31,  manual:null, alert:null, used:false },
    { ccy:'SGD', rate:23.61,  change:+0.09,  manual:null, alert:null, used:false },
  ]);
  const [editCcy, setEditCcy] = React.useState(null);

  function setManual(ccy, val) {
    setRates(rs => rs.map(r => r.ccy===ccy ? {...r, manual: val===''?null:parseFloat(val)} : r));
  }

  const bases = ['NTD','USD','EUR'];

  return (
    <div>
      <div style={{ display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:20 }}>
        <div>
          <div className="ns-eyebrow" style={{marginBottom:4}}>Currencies &amp; FX · 8 pairs</div>
          <h2 style={{fontFamily:'var(--ns-font-display)',fontSize:24,margin:0,fontWeight:600}}>匯率設定</h2>
          <p className="muted" style={{fontSize:13,marginTop:4,marginBottom:0}}>
            設定基準幣別與各外幣匯率來源。你可以覆蓋自動匯率，或為特定幣別設定提醒。
          </p>
        </div>
        <button className="ns-btn"><NSIcon name="refresh" size={14}/>立即更新</button>
      </div>

      {/* Base currency + source */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:18}}>
        <div className="ns-card" style={{padding:18}}>
          <div className="ns-eyebrow" style={{marginBottom:8}}>基準幣別</div>
          <p className="muted" style={{fontSize:12,margin:'0 0 12px'}}>所有帳戶餘額換算後以此幣別顯示</p>
          <div style={{display:'flex',gap:8}}>
            {bases.map(b=>(
              <button key={b} onClick={()=>setBase(b)}
                className={'ns-btn '+(base===b?'primary':'')} style={{flex:1,justifyContent:'center',fontSize:13}}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="ns-card" style={{padding:18}}>
          <div className="ns-eyebrow" style={{marginBottom:8}}>匯率來源</div>
          <p className="muted" style={{fontSize:12,margin:'0 0 12px'}}>自動更新頻率：每小時一次</p>
          <div style={{display:'flex',gap:8}}>
            {[
              {id:'yahoo',label:'Yahoo Finance'},
              {id:'manual',label:'全部手動'},
            ].map(s=>(
              <button key={s.id} onClick={()=>setSource(s.id)}
                className={'ns-btn '+(source===s.id?'primary':'')} style={{flex:1,justifyContent:'center',fontSize:12}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Last updated notice */}
      <div className="ns-surface" style={{padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:8,fontSize:12.5}}>
        <NSIcon name="refresh" size={13}/>
        <span className="muted">上次更新：2026-05-27 14:32 · 資料來源 Yahoo Finance</span>
        <span className="ns-pill solid-pos" style={{marginLeft:'auto',fontSize:10.5}}>已同步</span>
      </div>

      {/* Rate table */}
      <div className="ns-card" style={{padding:0}}>
        <div style={{padding:'10px 20px',borderBottom:'1px solid var(--ns-border)',
          display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 1fr 56px',
          fontSize:10.5,color:'var(--ns-fg-dim)',fontFamily:'var(--ns-font-mono)',
          letterSpacing:0.07,textTransform:'uppercase'}}>
          <span>CCY</span>
          <span style={{textAlign:'right'}}>匯率 (/{base})</span>
          <span style={{textAlign:'right'}}>日變動</span>
          <span style={{textAlign:'right'}}>手動覆蓋</span>
          <span style={{textAlign:'right'}}>提醒</span>
          <span/>
        </div>
        {rates.map((r,i)=>{
          const isEdit = editCcy===r.ccy;
          const displayRate = r.manual ?? r.rate;
          return (
            <div key={r.ccy}>
              <div style={{
                display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 1fr 56px',
                alignItems:'center',padding:'14px 20px',
                borderTop:i?'1px solid var(--ns-border)':'none',
                opacity:r.used?1:0.7,
              }}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span className="mono" style={{fontSize:14,fontWeight:600}}>{r.ccy}</span>
                  {r.used&&<span className="ns-pill solid-accent" style={{fontSize:9,padding:'1px 6px'}}>使用中</span>}
                </div>
                <span className="num" style={{textAlign:'right',fontSize:15,fontWeight:500}}>{displayRate.toFixed(r.ccy==='JPY'?4:2)}</span>
                <span className={'num '+(r.change>=0?'pos':'neg')} style={{textAlign:'right',fontSize:13}}>
                  {r.change>=0?'+':''}{r.change.toFixed(2)}%
                </span>
                <div style={{textAlign:'right'}}>
                  {r.manual ? (
                    <span className="ns-pill" style={{fontSize:10.5,cursor:'pointer'}} onClick={()=>setManual(r.ccy,'')}>
                      手動 {r.manual.toFixed(4)} ✕
                    </span>
                  ) : (
                    <span className="dim" style={{fontSize:12}}>— 自動</span>
                  )}
                </div>
                <div style={{textAlign:'right'}}>
                  {r.alert ? (
                    <span className="ns-pill solid-pos" style={{fontSize:10}}>±{r.alert}%</span>
                  ) : (
                    <span className="dim" style={{fontSize:12}}>—</span>
                  )}
                </div>
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button className="ns-btn ghost icon" style={{padding:6}} onClick={()=>setEditCcy(isEdit?null:r.ccy)}>
                    <NSIcon name="settings" size={13}/>
                  </button>
                </div>
              </div>
              {isEdit && (
                <div style={{padding:'12px 20px 14px',borderTop:'1px dashed var(--ns-border)',background:'var(--ns-bg-hover)',display:'flex',gap:12,alignItems:'flex-end'}}>
                  <div style={{flex:1}}>
                    <label style={{fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:4}}>手動匯率 (1 {r.ccy} = ? {base})</label>
                    <input className="ns-input" style={{fontSize:13}} type="number" step="0.0001"
                      placeholder={'自動 ' + r.rate.toFixed(4)}
                      value={r.manual??''} onChange={e=>setManual(r.ccy, e.target.value)} />
                  </div>
                  <div style={{flex:1}}>
                    <label style={{fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:4}}>變動提醒閾值 (%)</label>
                    <input className="ns-input" style={{fontSize:13}} type="number" step="0.1" placeholder="例：2.0"
                      value={r.alert??''}
                      onChange={e=>setRates(rs=>rs.map(x=>x.ccy===r.ccy?{...x,alert:e.target.value===''?null:+e.target.value}:x))} />
                  </div>
                  <button className="ns-btn ghost" style={{fontSize:12}} onClick={()=>setEditCcy(null)}>完成</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────── Export tab ───────
function SettingsExport() {
  const [fmt,       setFmt]      = React.useState('csv');
  const [range,     setRange]    = React.useState('this_month');
  const [accts,     setAccts]    = React.useState(['all']);
  const [includes,  setIncludes] = React.useState({ transfers:true, investments:true, tags:true, notes:true, fxSnapshot:false });
  const [exporting, setExporting] = React.useState(false);
  const [done,      setDone]     = React.useState(false);

  function toggleInclude(k) { setIncludes(i=>({...i,[k]:!i[k]})); }

  function doExport() {
    setExporting(true); setDone(false);
    setTimeout(()=>{ setExporting(false); setDone(true); }, 1600);
  }

  const formats = [
    { id:'csv',   label:'CSV',        sub:'通用格式，支援 Excel / Numbers' },
    { id:'json',  label:'JSON',       sub:'完整資料，適合開發者備份' },
    { id:'xlsx',  label:'Excel',      sub:'含格式化表格與分頁' },
    { id:'ofx',   label:'OFX',        sub:'與記帳軟體互通' },
  ];
  const ranges = [
    { id:'this_month', label:'本月' },
    { id:'last_month', label:'上個月' },
    { id:'ytd',        label:'今年至今' },
    { id:'last_year',  label:'去年' },
    { id:'all',        label:'全部' },
    { id:'custom',     label:'自訂範圍' },
  ];

  const previewRows = { this_month:142, last_month:186, ytd:820, last_year:1204, all:3210, custom:0 };

  return (
    <div>
      <div style={{marginBottom:24}}>
        <div className="ns-eyebrow" style={{marginBottom:4}}>Data export</div>
        <h2 style={{fontFamily:'var(--ns-font-display)',fontSize:24,margin:'0 0 4px',fontWeight:600}}>匯出資料</h2>
        <p className="muted" style={{fontSize:13,margin:0}}>
          選擇格式、時間範圍與帳戶，將你的資料匯出為本機檔案。
        </p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* Left col */}
        <div style={{display:'flex',flexDirection:'column',gap:18}}>

          {/* Format */}
          <div className="ns-card" style={{padding:18}}>
            <div className="ns-eyebrow" style={{marginBottom:10}}>檔案格式</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {formats.map(f=>(
                <div key={f.id} onClick={()=>setFmt(f.id)} style={{
                  padding:'12px 14px',borderRadius:'var(--ns-r-md)',
                  background:fmt===f.id?'var(--ns-accent-soft)':'var(--ns-bg-hover)',
                  border:fmt===f.id?'1.5px solid var(--ns-accent)':'1px solid var(--ns-border)',
                  cursor:'pointer',
                }}>
                  <div style={{fontSize:14,fontWeight:600,fontFamily:'var(--ns-font-mono)'}}>{f.label}</div>
                  <div className="muted" style={{fontSize:11.5,marginTop:3}}>{f.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="ns-card" style={{padding:18}}>
            <div className="ns-eyebrow" style={{marginBottom:10}}>時間範圍</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {ranges.map(r=>(
                <label key={r.id} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'7px 0',borderBottom:'1px solid var(--ns-border)'}}>
                  <div style={{
                    width:16,height:16,borderRadius:99,flexShrink:0,
                    border:'1.5px solid '+(range===r.id?'var(--ns-accent)':'var(--ns-border)'),
                    background:range===r.id?'var(--ns-accent)':'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',
                  }} onClick={()=>setRange(r.id)}>
                    {range===r.id&&<div style={{width:6,height:6,background:'var(--ns-accent-fg)',borderRadius:99}}/>}
                  </div>
                  <span style={{fontSize:13.5,flex:1}}>{r.label}</span>
                  <span className="mono dim" style={{fontSize:11}}>{previewRows[r.id]||'—'} 筆</span>
                </label>
              ))}
            </div>
            {range==='custom' && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
                <div>
                  <label style={{fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:4}}>開始日期</label>
                  <input className="ns-input" style={{fontSize:13}} type="date" defaultValue="2026-01-01"/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'var(--ns-fg-muted)',display:'block',marginBottom:4}}>結束日期</label>
                  <input className="ns-input" style={{fontSize:13}} type="date" defaultValue="2026-05-27"/>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right col */}
        <div style={{display:'flex',flexDirection:'column',gap:18}}>

          {/* Accounts */}
          <div className="ns-card" style={{padding:18}}>
            <div className="ns-eyebrow" style={{marginBottom:10}}>帳戶</div>
            {[
              {id:'all',      label:'所有帳戶',           sub:'9 個帳戶'},
              {id:'cash',     label:'現金 & 存款',         sub:'4 個帳戶'},
              {id:'invest',   label:'投資帳戶',            sub:'3 個帳戶'},
              {id:'credit',   label:'信用卡 & 負債',       sub:'1 個帳戶'},
            ].map(a=>(
              <label key={a.id} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'8px 0',borderBottom:'1px solid var(--ns-border)'}}>
                <div style={{
                  width:16,height:16,borderRadius:3,flexShrink:0,
                  border:'1.5px solid '+(accts.includes(a.id)?'var(--ns-accent)':'var(--ns-border)'),
                  background:accts.includes(a.id)?'var(--ns-accent)':'transparent',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  cursor:'pointer',
                }} onClick={()=>setAccts([a.id])}>
                  {accts.includes(a.id)&&<NSIcon name="check" size={10} strokeWidth={2.5}/>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13.5}}>{a.label}</div>
                  <div className="muted" style={{fontSize:11}}>{a.sub}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Includes */}
          <div className="ns-card" style={{padding:18}}>
            <div className="ns-eyebrow" style={{marginBottom:10}}>包含欄位</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {[
                {k:'transfers',   label:'內部轉帳'},
                {k:'investments', label:'投資交易'},
                {k:'tags',        label:'標籤'},
                {k:'notes',       label:'備註'},
                {k:'fxSnapshot',  label:'FX 快照（匯率時點）'},
              ].map(({k,label})=>(
                <label key={k} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'7px 0',borderBottom:'1px solid var(--ns-border)'}}>
                  <div style={{
                    width:16,height:16,borderRadius:3,flexShrink:0,
                    border:'1.5px solid '+(includes[k]?'var(--ns-accent)':'var(--ns-border)'),
                    background:includes[k]?'var(--ns-accent)':'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
                  }} onClick={()=>toggleInclude(k)}>
                    {includes[k]&&<NSIcon name="check" size={10} strokeWidth={2.5}/>}
                  </div>
                  <span style={{fontSize:13.5,flex:1}}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Export action */}
      <div className="ns-card" style={{marginTop:18,padding:20,display:'flex',alignItems:'center',gap:16}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:500}}>
            預計匯出 <span className="num">{previewRows[range]||0}</span> 筆交易
          </div>
          <div className="muted" style={{fontSize:12,marginTop:3}}>
            格式 {fmt.toUpperCase()} · {ranges.find(r=>r.id===range)?.label} · {accts[0]==='all'?'所有帳戶':'部分帳戶'}
          </div>
        </div>
        {done && (
          <span className="ns-pill solid-pos" style={{fontSize:12}}>
            <NSIcon name="check" size={12} strokeWidth={2}/>已匯出
          </span>
        )}
        <button className="ns-btn primary" onClick={doExport}
          style={{padding:'10px 22px',opacity:exporting?0.7:1}}>
          {exporting
            ? <><NSIcon name="refresh" size={14}/>匯出中…</>
            : <><NSIcon name="download" size={14}/>匯出 {fmt.toUpperCase()}</>}
        </button>
      </div>
    </div>
  );
}

// ─────── Settings shell ───────
function NSDesktopSettingsV2({ onNavigate } = {}) {
  const [tab, setTab] = React.useState('categories');

  const [cats, setCats] = React.useState([
    { id:1, name:'食物', icon:'🍱', color:'#f0c050', budget:8000,  spent:8240,  txns:42, sub:['咖啡','外食','超市'] },
    { id:2, name:'交通', icon:'🚖', color:'#6fb3ff', budget:5000,  spent:4520,  txns:18, sub:[] },
    { id:3, name:'娛樂', icon:'🎮', color:'#a99cff', budget:3000,  spent:3110,  txns:9,  sub:['電影','遊戲'] },
    { id:4, name:'訂閱', icon:'📺', color:'#6ee49a', budget:2500,  spent:2280,  txns:6,  sub:['串流','SaaS'] },
    { id:5, name:'居家', icon:'🏠', color:'#ff7d6b', budget:5000,  spent:2850,  txns:5,  sub:[] },
    { id:6, name:'醫療', icon:'💊', color:'#34c5b0', budget:2000,  spent:680,   txns:2,  sub:[] },
    { id:7, name:'教育', icon:'📚', color:'#f0a050', budget:3000,  spent:1200,  txns:3,  sub:[] },
    { id:8, name:'其他', icon:'⋯',  color:'#868685', budget:null,  spent:3220,  txns:11, sub:[] },
  ]);
  const [merchants, setMerchants] = React.useState([
    { id:1, name:'Uber',      alias:['UberX','Uber Eats'], cat:'交通', count:24, lastAmt:250 },
    { id:2, name:'全家便利商店', alias:['FamilyMart'],    cat:'食物', count:18, lastAmt:85  },
    { id:3, name:'Spotify',   alias:['Spotify AB'],       cat:'訂閱', count:12, lastAmt:149 },
    { id:4, name:'IKEA',      alias:[],                   cat:'居家', count:4,  lastAmt:2480},
    { id:5, name:'Costco',    alias:['好市多'],             cat:'食物', count:6,  lastAmt:3850},
    { id:6, name:'Netflix',   alias:[],                   cat:'訂閱', count:12, lastAmt:390 },
    { id:7, name:'統一超商',   alias:['7-11','7eleven'],   cat:'食物', count:31, lastAmt:68  },
    { id:8, name:'Amazon',    alias:['Amazon.com'],       cat:'購物', count:8,  lastAmt:1280},
  ]);

  const tabs = [
    { id:'categories', label:'分類',        icon:'tag'      },
    { id:'merchants',  label:'商家',        icon:'bank'     },
    { id:'fx',         label:'匯率',        icon:'transfer' },
    { id:'export',     label:'匯出',        icon:'download' },
    null,
    { id:'connect',    label:'連線 & 同步', icon:'refresh'  },
    { id:'household',  label:'家庭帳戶',    icon:'users'    },
    { id:'privacy',    label:'隱私',        icon:'eye'      },
    { id:'recovery',   label:'Recovery Kit',icon:'lock'     },
  ];

  return (
    <NSDesktopShell active="settings" onNavigate={onNavigate}>
      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', height:'100%', overflow:'hidden' }}>

        {/* Settings sidebar */}
        <aside style={{ borderRight:'1px solid var(--ns-border)', padding:'22px 12px', overflowY:'auto' }}>
          <div style={{ padding:'0 8px 16px' }}>
            <div className="ns-eyebrow" style={{marginBottom:4}}>Settings</div>
            <h2 style={{ fontFamily:'var(--ns-font-display)',fontSize:20,margin:0,fontWeight:600 }}>設定</h2>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {tabs.map((t, i) => {
              if (!t) return <div key={'d'+i} className="ns-divider" style={{margin:'8px 6px'}}/>;
              return (
                <div key={t.id} className={'ns-nav-link'+(tab===t.id?' active':'')}
                  onClick={()=>setTab(t.id)}>
                  <NSIcon name={t.icon} size={14}/><span style={{fontSize:13}}>{t.label}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Settings content */}
        <main style={{ overflow:'auto', padding:'28px 36px 100px' }}>
          {tab==='categories' && <SettingsCategories cats={cats} setCats={setCats} />}
          {tab==='merchants'  && <SettingsMerchants merchants={merchants} setMerchants={setMerchants} cats={cats} />}
          {tab==='fx'         && <SettingsFX />}
          {tab==='export'     && <SettingsExport />}
          {['connect','household','privacy','recovery'].includes(tab) && (
            <div style={{textAlign:'center',paddingTop:80}}>
              <div style={{
                width:56,height:56,borderRadius:99,background:'var(--ns-bg-hover)',
                display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',
              }}>
                <NSIcon name={tabs.find(t=>t&&t.id===tab)?.icon||'settings'} size={24}/>
              </div>
              <h3 style={{fontFamily:'var(--ns-font-display)',fontSize:18,margin:'0 0 8px'}}>
                {{connect:'連線 & 同步',household:'家庭帳戶',privacy:'隱私',recovery:'Recovery Kit'}[tab]}
              </h3>
              <p className="muted" style={{fontSize:13,margin:'0 0 20px'}}>
                這些設定已在 Connect &amp; Sync 頁面中設計。
              </p>
              <button className="ns-btn" onClick={()=>onNavigate&&onNavigate('connect')}>
                前往 Connect 頁面 →
              </button>
            </div>
          )}
        </main>
      </div>
    </NSDesktopShell>
  );
}

Object.assign(window, { NSDesktopSettingsV2, SettingsCategories, SettingsMerchants, SettingsFX, SettingsExport });
