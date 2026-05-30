// northstar-recurring.jsx — Cash Flow · 週期規則管理

const recurringData = [
  { id:1,  icon:'💼', name:'玉山薪資',      cat:'薪資', freq:'monthly',  day:25, amt:+72000, acc:'玉山活儲',          status:'active', next:'2026-06-25' },
  { id:2,  icon:'🏠', name:'房租',          cat:'居家', freq:'monthly',  day:5,  amt:-28000, acc:'玉山活儲',          status:'active', next:'2026-06-05' },
  { id:3,  icon:'📺', name:'Netflix',       cat:'訂閱', freq:'monthly',  day:1,  amt:-195,   acc:'Cathay World Card', status:'active', next:'2026-06-01' },
  { id:4,  icon:'🎵', name:'Spotify',       cat:'訂閱', freq:'monthly',  day:15, amt:-149,   acc:'Cathay World Card', status:'active', next:'2026-06-15' },
  { id:5,  icon:'🚇', name:'MRT 月票',      cat:'交通', freq:'monthly',  day:1,  amt:-1280,  acc:'Cathay World Card', status:'active', next:'2026-06-01' },
  { id:6,  icon:'🤖', name:'ChatGPT Plus',  cat:'訂閱', freq:'monthly',  day:20, amt:-638,   acc:'Cathay World Card', status:'active', next:'2026-06-20' },
  { id:7,  icon:'📱', name:'iPhone 分期',   cat:'其他', freq:'monthly',  day:15, amt:-1388,  acc:'Cathay World Card', status:'active', next:'2026-06-15' },
  { id:8,  icon:'⚡', name:'電費',          cat:'居家', freq:'bimonth',  day:10, amt:-2400,  acc:'玉山活儲',          status:'active', next:'2026-06-10' },
  { id:9,  icon:'🚗', name:'汽車保險',      cat:'交通', freq:'yearly',   day:8,  amt:-15800, acc:'玉山活儲',          status:'active', next:'2026-08-08' },
  { id:10, icon:'🏋', name:'健身房年費',    cat:'娛樂', freq:'yearly',   day:1,  amt:-6000,  acc:'Cathay World Card', status:'paused', next:'2027-01-01' },
];

const freqMeta = { monthly:'每月', bimonth:'雙月', weekly:'每週', yearly:'每年', daily:'每日' };
function freqLabel(r) {
  if (r.freq === 'yearly')  return `每年 ${r.next.slice(5,10)}`;
  if (r.freq === 'monthly') return `每月 ${r.day} 日`;
  if (r.freq === 'bimonth') return `雙月 ${r.day} 日`;
  return freqMeta[r.freq] || r.freq;
}

// ── Edit sheet ──────────────────────────────────────────────
function RuleEditSheet({ rule, onClose }) {
  const [status, setStatus]   = React.useState(rule.status);
  const [confirm, setConfirm] = React.useState(false);
  return (
    <>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(4px)', zIndex:20 }}/>
      <div style={{
        position:'absolute', right:0, top:0, bottom:0, width:460, zIndex:21,
        background:'var(--ns-bg-elev)', borderLeft:'1px solid var(--ns-border)',
        display:'flex', flexDirection:'column', boxShadow:'-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--ns-border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:38, height:38, borderRadius:'var(--ns-r-sm)', fontSize:20,
            background: rule.amt > 0 ? 'var(--ns-pos-soft)' : 'var(--ns-neg-soft)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>{rule.icon}</div>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:0, fontFamily:'var(--ns-font-display)', fontSize:18, fontWeight:600 }}>編輯週期規則</h2>
            <div className="muted" style={{ fontSize:12, marginTop:2 }}>{rule.name} · {rule.cat}</div>
          </div>
          <button className="ns-btn ghost icon" onClick={onClose}>✕</button>
        </div>

        {/* Form */}
        <div style={{ flex:1, overflow:'auto', padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>規則名稱</label>
            <input className="ns-input" defaultValue={rule.name} style={{ fontSize:15 }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>金額 (NT$)</label>
              <input className="ns-input" defaultValue={Math.abs(rule.amt).toLocaleString('zh-TW')}
                style={{ fontFamily:'var(--ns-font-mono)', fontSize:18, fontVariantNumeric:'tabular-nums' }}/>
            </div>
            <div>
              <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>類型</label>
              <select className="ns-input" defaultValue={rule.amt > 0 ? 'income' : 'expense'} style={{ appearance:'none' }}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>週期</label>
              <select className="ns-input" defaultValue={rule.freq} style={{ appearance:'none' }}>
                <option value="daily">每日</option>
                <option value="weekly">每週</option>
                <option value="monthly">每月</option>
                <option value="bimonth">雙月</option>
                <option value="yearly">每年</option>
              </select>
            </div>
            <div>
              <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>觸發日（幾號）</label>
              <input className="ns-input" defaultValue={rule.day}
                style={{ fontFamily:'var(--ns-font-mono)', fontSize:18, fontVariantNumeric:'tabular-nums' }}/>
            </div>
          </div>
          <div>
            <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>帳戶</label>
            <select className="ns-input" defaultValue={rule.acc} style={{ appearance:'none' }}>
              <option>玉山活儲</option><option>Cathay World Card</option>
              <option>富邦證券</option><option>Interactive Brokers</option>
            </select>
          </div>
          <div>
            <label className="ns-eyebrow" style={{ display:'block', marginBottom:6 }}>分類</label>
            <input className="ns-input" defaultValue={rule.cat} style={{ fontSize:14 }}/>
          </div>

          {/* Status toggle */}
          <div style={{ padding:'14px 16px', borderRadius:'var(--ns-r-md)', border:'1px solid var(--ns-border)', background:'var(--ns-bg-card)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:13.5, fontWeight:500 }}>規則狀態</div>
                <div className="muted" style={{ fontSize:11.5, marginTop:2 }}>
                  {status === 'active' ? `啟用中 · 下次觸發 ${rule.next.slice(5)}` : '已暫停 · 不會自動記帳'}
                </div>
              </div>
              <div onClick={() => setStatus(s => s === 'active' ? 'paused' : 'active')} style={{
                width:38, height:22, borderRadius:99, cursor:'pointer', flexShrink:0,
                background: status === 'active' ? 'var(--ns-accent)' : 'var(--ns-bg-hover)',
                border: status === 'active' ? 'none' : '1px solid var(--ns-border)',
                position:'relative', transition:'background 0.2s',
              }}>
                <div style={{
                  width:16, height:16, background:'#fff', borderRadius:99, position:'absolute', top:3,
                  left: status === 'active' ? 19 : 3, transition:'left 0.18s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)',
                }}/>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div style={{
            padding:'14px 16px', borderRadius:'var(--ns-r-md)',
            border:'1px solid color-mix(in srgb, var(--ns-neg) 30%, transparent)',
            background:'color-mix(in srgb, var(--ns-neg) 6%, transparent)',
          }}>
            <div className="ns-eyebrow" style={{ marginBottom:8, color:'var(--ns-neg)' }}>刪除規則</div>
            {!confirm ? (
              <button onClick={() => setConfirm(true)} style={{
                background:'none', border:'1px solid var(--ns-neg)', borderRadius:'var(--ns-r-sm)',
                color:'var(--ns-neg)', padding:'6px 14px', fontSize:13, cursor:'pointer',
                fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:6,
              }}>
                <NSIcon name="backspace" size={13}/>刪除此規則
              </button>
            ) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:12.5, color:'var(--ns-neg)' }}>確定刪除？此動作無法還原。</span>
                <button onClick={() => { setConfirm(false); onClose(); }} style={{
                  background:'var(--ns-neg)', border:'none', borderRadius:'var(--ns-r-sm)',
                  color:'#fff', padding:'6px 12px', fontSize:12.5, cursor:'pointer', fontFamily:'inherit',
                }}>確定刪除</button>
                <button onClick={() => setConfirm(false)} style={{
                  background:'none', border:'1px solid var(--ns-border)', borderRadius:'var(--ns-r-sm)',
                  color:'var(--ns-fg-muted)', padding:'6px 12px', fontSize:12.5, cursor:'pointer', fontFamily:'inherit',
                }}>取消</button>
              </div>
            )}
            <div className="muted" style={{ fontSize:11, marginTop:6 }}>刪除後不影響已記錄的歷史交易。</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px', borderTop:'1px solid var(--ns-border)', display:'flex', gap:8 }}>
          <button className="ns-btn ghost" style={{ flex:'0 0 80px', justifyContent:'center' }} onClick={onClose}>取消</button>
          <button className="ns-btn primary" style={{ flex:1, justifyContent:'center' }}>
            <NSIcon name="check" size={14} strokeWidth={2}/>儲存變更
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main screen ─────────────────────────────────────────────
function NSDesktopRecurringRules({ onNavigate } = {}) {
  const [filter, setFilter]     = React.useState('all');
  const [editRule, setEditRule] = React.useState(null);

  const active = recurringData.filter(r => r.status === 'active');
  const monthlyIn  = active.filter(r => r.amt > 0)
    .reduce((s, r) => s + (r.freq === 'yearly' ? r.amt / 12 : r.freq === 'bimonth' ? r.amt / 2 : r.amt), 0);
  const monthlyOut = active.filter(r => r.amt < 0)
    .reduce((s, r) => s + Math.abs(r.freq === 'yearly' ? r.amt / 12 : r.freq === 'bimonth' ? r.amt / 2 : r.amt), 0);

  const counts = {
    all:     recurringData.length,
    monthly: recurringData.filter(r => r.freq === 'monthly' || r.freq === 'bimonth').length,
    yearly:  recurringData.filter(r => r.freq === 'yearly').length,
    paused:  recurringData.filter(r => r.status === 'paused').length,
  };

  const filtered = recurringData.filter(r => {
    if (filter === 'paused')  return r.status === 'paused';
    if (filter === 'monthly') return r.freq === 'monthly' || r.freq === 'bimonth';
    if (filter === 'yearly')  return r.freq === 'yearly';
    return true;
  });

  const cfTabs = [
    { id:'transactions', label:'Transactions', nav:'cashflow' },
    { id:'categories',   label:'分類',         nav:'cashflow' },
    { id:'merchants',    label:'Merchants',     nav:'cashflow' },
    { id:'recurring',    label:'週期規則',       nav:null,       active:true },
  ];

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      <div style={{ padding:'24px 32px 100px', height:'100%', overflow:'auto' }}>

        {/* Page header */}
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:0 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom:6 }}>Cash Flow</div>
            <h1 style={{ fontFamily:'var(--ns-font-display)', fontSize:28, margin:0, letterSpacing:-0.02, fontWeight:600 }}>週期規則</h1>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="ns-btn"><NSIcon name="download" size={14}/>匯出</button>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新增規則</button>
          </div>
        </div>

        {/* CF page tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--ns-border)', marginTop:20, marginBottom:22 }}>
          {cfTabs.map(tab => (
            <button key={tab.id} onClick={() => tab.nav && onNavigate && onNavigate(tab.nav)} style={{
              padding:'10px 20px', background:'none', border:'none',
              cursor: tab.nav ? 'pointer' : 'default',
              fontFamily:'inherit', fontSize:14, fontWeight: tab.active ? 600 : 400,
              color: tab.active ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
              borderBottom: tab.active ? '2px solid var(--ns-accent)' : '2px solid transparent',
              marginBottom:-1, transition:'color 0.12s',
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Summary strip */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:20 }}>
          {[
            ['月收入（預估）', '+NT$' + Math.round(monthlyIn).toLocaleString('zh-TW'), 'pos'],
            ['月支出（預估）', '−NT$' + Math.round(monthlyOut).toLocaleString('zh-TW'), 'neg'],
            ['月淨現金流',    (monthlyIn - monthlyOut >= 0 ? '+' : '−') + 'NT$' + Math.abs(Math.round(monthlyIn - monthlyOut)).toLocaleString('zh-TW'), monthlyIn >= monthlyOut ? 'pos' : 'neg'],
            ['規則總計',      `${recurringData.length} 筆 · ${counts.paused} 暫停`, null],
          ].map(([l, v, c]) => (
            <div className="ns-card" key={l} style={{ padding:'20px 22px' }}>
              <div className="ns-eyebrow" style={{ marginBottom:10 }}>{l}</div>
              <div className={'ns-num-md ' + (c || '')} style={{ marginBlock:'4px 6px' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="ns-card" style={{ padding:0 }}>

          {/* Filter bar */}
          <div style={{ padding:'13px 22px', borderBottom:'1px solid var(--ns-border)', display:'flex', alignItems:'center', gap:12 }}>
            <div className="ns-seg">
              {[['all','全部'],['monthly','每月'],['yearly','每年'],['paused','暫停']].map(([id, label]) => (
                <button key={id} aria-selected={filter === id} onClick={() => setFilter(id)}>
                  {label}
                  <span className="dim mono" style={{ marginLeft:4, fontSize:10 }}>({counts[id] ?? 0})</span>
                </button>
              ))}
            </div>
            <div style={{ flex:1 }}/>
            <span className="muted" style={{ fontSize:12 }}>
              下一批：6/1 · {recurringData.filter(r => r.next === '2026-06-01' && r.status === 'active').length} 筆觸發
            </span>
          </div>

          {/* Column header */}
          <div style={{
            display:'grid',
            gridTemplateColumns:'2.4fr 0.7fr 1.1fr 1.1fr 1.5fr 0.9fr 88px 44px',
            padding:'8px 22px', borderBottom:'1px solid var(--ns-border)',
            fontSize:11, letterSpacing:0.06, textTransform:'uppercase',
            color:'var(--ns-fg-dim)', fontFamily:'var(--ns-font-mono)',
            background:'var(--ns-bg-elev)',
          }}>
            <span>規則名稱</span>
            <span>分類</span>
            <span style={{ textAlign:'right' }}>週期</span>
            <span style={{ textAlign:'right' }}>金額</span>
            <span>帳戶</span>
            <span>下次觸發</span>
            <span style={{ textAlign:'center' }}>狀態</span>
            <span/>
          </div>

          {/* Rows */}
          {filtered.map(r => (
            <div key={r.id} onClick={() => setEditRule(r)}
              style={{
                display:'grid',
                gridTemplateColumns:'2.4fr 0.7fr 1.1fr 1.1fr 1.5fr 0.9fr 88px 44px',
                alignItems:'center', padding:'14px 22px',
                borderTop:'1px solid var(--ns-border)', cursor:'pointer',
                opacity: r.status === 'paused' ? 0.5 : 1,
                transition:'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{
                  width:34, height:34, borderRadius:'var(--ns-r-sm)', fontSize:16, flexShrink:0,
                  background: r.amt > 0 ? 'var(--ns-pos-soft)' : 'var(--ns-neg-soft)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:500 }}>{r.name}</div>
                </div>
              </div>

              <span className="muted" style={{ fontSize:12.5 }}>{r.cat}</span>

              <span className="num muted" style={{ textAlign:'right', fontSize:12.5 }}>{freqLabel(r)}</span>

              <span className={'num ' + (r.amt > 0 ? 'pos' : '')}
                style={{ textAlign:'right', fontSize:14, fontWeight:500, fontVariantNumeric:'tabular-nums lining-nums' }}>
                {r.amt > 0 ? '+' : '−'}NT${Math.abs(r.amt).toLocaleString('zh-TW')}
              </span>

              <span className="muted" style={{ fontSize:12.5 }}>{r.acc}</span>

              <span className="mono" style={{ fontSize:12.5 }}>{r.next.slice(5)}</span>

              <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6 }}>
                <span style={{
                  width:6, height:6, borderRadius:99, flexShrink:0,
                  background: r.status === 'active' ? 'var(--ns-accent)' : 'var(--ns-fg-dim)',
                }}/>
                <span className="muted" style={{ fontSize:12 }}>
                  {r.status === 'active' ? '啟用' : '暫停'}
                </span>
              </div>

              <span className="dim" style={{ textAlign:'right' }}><NSIcon name="chevRight" size={13}/></span>
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ padding:'40px', textAlign:'center' }}>
              <div className="muted" style={{ fontSize:14 }}>沒有符合的規則</div>
            </div>
          )}
        </div>
      </div>

      {editRule && <RuleEditSheet rule={editRule} onClose={() => setEditRule(null)}/>}
    </NSDesktopShell>
  );
}

Object.assign(window, { NSDesktopRecurringRules });
