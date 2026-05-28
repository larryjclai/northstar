// northstar-mobile.jsx — Mobile screens (iOS device frames)

function NSMobileShell({ children, active = 'home', dark = true, hideTab = false }) {
  const tabs = [
    { id: 'home',  label: 'Home',     icon: 'home' },
    { id: 'chart', label: 'Holdings', icon: 'chart' },
    { id: 'add',   label: '',         icon: 'plus', primary: true },
    { id: 'coin',  label: 'Cash',     icon: 'coin' },
    { id: 'me',    label: 'Me',       icon: 'settings' },
  ];
  return (
    <div className="ns-board" style={{
      background: 'var(--ns-bg)', height: '100%',
      display: 'flex', flexDirection: 'column', position: 'relative',
      paddingTop: 52,
    }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {!hideTab && (
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '8px 12px 28px', background: 'var(--ns-bg)',
          borderTop: '1px solid var(--ns-border)',
        }}>
          {tabs.map((t) => (
            <div key={t.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              width: 56, color: active === t.id ? 'var(--ns-fg)' : 'var(--ns-fg-dim)',
            }}>
              {t.primary ? (
                <div style={{
                  width: 44, height: 44, borderRadius: 999, background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2,
                  boxShadow: '0 6px 20px color-mix(in srgb, var(--ns-accent) 40%, transparent)',
                }}>
                  <NSIcon name={t.icon} size={20} strokeWidth={2.2}/>
                </div>
              ) : <NSIcon name={t.icon} size={20}/>}
              {!t.primary && <span style={{ fontSize: 10, fontWeight: 500 }}>{t.label}</span>}
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─────── Mobile Dashboard ───────
function NSMobileDashboard() {
  return (
    <NSMobileShell active="home">
      <div style={{ padding: '16px 18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="ns-eyebrow">5/27 (二)</div>
          <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--ns-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>晚安，家瑋</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ns-btn icon"><NSIcon name="search" size={16}/></button>
          <button className="ns-btn icon"><NSIcon name="bell" size={16}/></button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 18px 100px' }}>
        {/* Net worth hero */}
        <div className="ns-card" style={{ padding: 22, marginBottom: 14 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Net worth · NTD</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span className="ns-num-lg">NT$8,452K</span>
            <span className="ns-pill solid-pos">
              <NSIcon name="arrowUp" size={11} strokeWidth={2}/><span className="num">+2.23%</span>
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>+NT$184,210 ↑ 過去 30 天</div>

          <div style={{ marginTop: 14, height: 110, marginLeft: -8, marginRight: -8 }}>
            <NSAreaChart
              data={nsSeries(90, 6_800_000, 0.012, 0.0018)}
              w={360} h={110} padLeft={4} padRight={4} padTop={10} padBot={16}
              yFormat={(v) => (v/1_000_000).toFixed(2) + 'M'}
            />
          </div>
          <div className="ns-seg" style={{ marginTop: 8 }}>
            {['1W','1M','3M','YTD','1Y','ALL'].map((v) => (
              <button key={v} aria-selected={v === '1M'}>{v}</button>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            ['投資', 'NT$5,210K', '+1.82%', true],
            ['現金', 'NT$2,840K', '+0.42%', true],
            ['本月流入', '+NT$48K', '收支 +66.7%', true],
            ['今日損益', '+NT$12,450', '已實現 +4K', true],
          ].map((r) => (
            <div className="ns-card" key={r[0]} style={{ padding: 14 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{r[0]}</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>{r[1]}</div>
              <div className={'mono ' + (r[3] ? 'pos' : 'neg')} style={{ fontSize: 11, marginTop: 3 }}>{r[2]}</div>
            </div>
          ))}
        </div>

        {/* Activity */}
        <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="ns-eyebrow">最近活動</span>
            <a className="muted" style={{ fontSize: 12 }}>全部 →</a>
          </div>
          {[
            { mark: 'TS', color: 'var(--ns-chart-1)', name: '2330.TW 配息', sub: '證券戶', amt: +3500, mono: true },
            { mark: 'UB', color: 'var(--ns-chart-4)', name: 'Uber', sub: '今天 · 09:10', amt: -250 },
            { mark: 'FD', color: 'var(--ns-chart-3)', name: '全家', sub: '今天 · 14:32', amt: -85 },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 18px', borderTop: i ? '1px solid var(--ns-border)' : 'none',
            }}>
              <NSMark label={r.mark} color={r.color} size={32} mono={r.mono}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{r.sub}</div>
              </div>
              <div className={'num ' + (r.amt >= 0 ? 'pos' : '')} style={{ fontSize: 13.5 }}>
                {r.amt >= 0 ? '+' : '−'}NT${Math.abs(r.amt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </NSMobileShell>
  );
}

// ─────── Mobile Holding detail ───────
function NSMobileHoldingDetail() {
  return (
    <NSMobileShell active="chart" hideTab>
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}>
          <NSIcon name="chevRight" size={14} strokeWidth={2}/>
        </button>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>2330.TW</div>
          <div className="muted" style={{ fontSize: 11 }}>台積電 · 證券戶 · 1,000 股</div>
        </div>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="star" size={16}/></button>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="dots" size={16}/></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 24px' }}>
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="ns-num-lg mono">1,042.00</span>
            <span className="dim mono" style={{ fontSize: 12 }}>TWD</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span className="pos num" style={{ fontSize: 14 }}>+18.50 · +1.81%</span>
            <span className="dim mono" style={{ fontSize: 11 }}>今天</span>
          </div>
        </div>

        <div style={{ marginTop: 16, marginLeft: -6, marginRight: -6 }}>
          <NSAreaChart
            data={nsSeries(120, 850, 0.018, 0.004)}
            w={360} h={180} padLeft={4} padRight={4} padTop={14} padBot={20}
            yFormat={(v) => v.toFixed(0)}
            highlightIdx={80}
          />
        </div>

        <div className="ns-seg" style={{ marginTop: 6 }}>
          {['1D','1W','1M','3M','YTD','1Y','ALL'].map((v) => (
            <button key={v} aria-selected={v === '1Y'}>{v}</button>
          ))}
        </div>

        {/* FIFO position */}
        <div className="ns-card" style={{ marginTop: 16, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="ns-eyebrow">Your position · FIFO</span>
            <span className="ns-pill solid-pos"><NSIcon name="arrowUp" size={10} strokeWidth={2.2}/><span className="num">+70.13%</span></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Market value</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT$1,042,000</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Avg cost · FIFO</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT$612.40</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Unrealized P/L</div>
              <div className="num pos" style={{ fontSize: 18, fontWeight: 500 }}>+NT$429,600</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11 }}>Dividends YTD</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT$14,500</div>
            </div>
          </div>
        </div>

        {/* Lots */}
        <div className="ns-card" style={{ marginTop: 12, padding: 0 }}>
          <div style={{ padding: '14px 18px 8px' }}>
            <span className="ns-eyebrow">Open lots · 3</span>
          </div>
          {[
            { date: '2023-03-14', qty: 500, price: 542.00, val: 521000, pct: 92.25 },
            { date: '2023-11-02', qty: 300, price: 612.00, val: 312600, pct: 70.26 },
            { date: '2024-08-21', qty: 200, price: 758.00, val: 208400, pct: 37.47 },
          ].map((l, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 4,
              padding: '10px 18px', borderTop: '1px solid var(--ns-border)', alignItems: 'center',
            }}>
              <div>
                <div className="mono" style={{ fontSize: 12.5 }}>{l.date} · {l.qty} 股 @ <span style={{ color: 'var(--ns-fg-muted)' }}>{l.price.toFixed(2)}</span></div>
                <div className="muted" style={{ fontSize: 11 }}>市值 NT${l.val.toLocaleString()}</div>
              </div>
              <span className="num pos" style={{ fontSize: 13.5 }}>+{l.pct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Buy/Sell sticky bar */}
      <div style={{
        padding: '12px 16px 26px', borderTop: '1px solid var(--ns-border)',
        background: 'var(--ns-bg)', display: 'flex', gap: 10,
      }}>
        <button className="ns-btn" style={{ flex: 1, justifyContent: 'center', padding: '14px 0', borderRadius: 999 }}>賣出</button>
        <button className="ns-btn primary" style={{ flex: 1, justifyContent: 'center', padding: '14px 0', borderRadius: 999 }}>買入</button>
      </div>
    </NSMobileShell>
  );
}

// ─────── Mobile Cash Flow with numpad ───────
function NSMobileQuickAdd() {
  const [amt, setAmt] = React.useState('120');
  const [type, setType] = React.useState('expense');
  const [activecat, setActivecat] = React.useState('食物');
  const [subcat, setSubcat] = React.useState(null);
  const [recurring, setRecurring] = React.useState('none');
  const [counterparty, setCounterparty] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [note, setNote] = React.useState('');

  const catTree = {
    expense: [
      { name: '食物', icon: '🍱', color: 'var(--ns-chart-3)', subs: ['餐廳', '外送', '超市', '早餐', '咖啡', '夜市'] },
      { name: '交通', icon: '🚖', color: 'var(--ns-chart-4)', subs: ['計程車', '捷運', '停車', '油費', '高鐵', 'YouBike'] },
      { name: '娛樂', icon: '🎮', color: 'var(--ns-chart-5)', subs: ['電影', '遊戲', '書籍', '旅遊', '運動', '其他'] },
      { name: '訂閱', icon: '📺', color: 'var(--ns-chart-2)', subs: ['串流', '音樂', '軟體', '新聞', '健身', '其他'] },
      { name: '居家', icon: '🏠', color: 'var(--ns-chart-1)', subs: ['租金', '水電', '網路', '家具', '清潔', '修繕'] },
      { name: '其他', icon: '⋯',  color: 'var(--ns-fg-dim)', subs: ['醫療', '教育', '禮品', '保險', '稅金', '其他'] },
    ],
    income: [
      { name: '薪資', icon: '💼', color: 'var(--ns-pos)',     subs: ['本薪', '加班費', '績效', '年終'] },
      { name: '投資', icon: '📈', color: 'var(--ns-chart-1)', subs: ['股票', '配息', '基金', '利息'] },
      { name: '兼職', icon: '🛠', color: 'var(--ns-chart-4)', subs: ['接案', '打工', '自媒體', '其他'] },
      { name: '租金', icon: '🏠', color: 'var(--ns-chart-2)', subs: ['房租', '車位', '設備', '其他'] },
      { name: '獎金', icon: '🎁', color: 'var(--ns-chart-3)', subs: ['績效', '年終', '比賽', '其他'] },
      { name: '其他', icon: '⋯',  color: 'var(--ns-fg-dim)', subs: ['退稅', '補助', '贈與', '其他'] },
    ],
  };
  const currentCats = type === 'income' ? catTree.income : catTree.expense;
  const parentCat = currentCats.find(c => c.name === activecat);

  const types = [
    { id: 'expense',  label: '支出',    sign: '−', color: 'var(--ns-neg)',     eyebrow: '支出金額 · TWD' },
    { id: 'income',   label: '收入',    sign: '+', color: 'var(--ns-pos)',     eyebrow: '收入金額 · TWD' },
    { id: 'transfer', label: '轉帳',    sign: '',  color: 'var(--ns-accent)',  eyebrow: '轉帳金額 · TWD' },
    { id: 'ar',       label: '應收帳款', sign: '+', color: 'var(--ns-chart-3)', eyebrow: '應收金額 · TWD' },
    { id: 'ap',       label: '應付帳款', sign: '−', color: 'var(--ns-chart-5)', eyebrow: '應付金額 · TWD' },
  ];
  const current = types.find(t => t.id === type);

  const expenseCats = [
    { name: '食物', icon: '🍱', color: 'var(--ns-chart-3)' },
    { name: '交通', icon: '🚖', color: 'var(--ns-chart-4)' },
    { name: '娛樂', icon: '🎮', color: 'var(--ns-chart-5)' },
    { name: '訂閱', icon: '📺', color: 'var(--ns-chart-2)' },
    { name: '居家', icon: '🏠', color: 'var(--ns-chart-1)' },
    { name: '其他', icon: '⋯',  color: 'var(--ns-fg-dim)'  },
  ];
  const incomeCats = [
    { name: '薪資', icon: '💼', color: 'var(--ns-pos)'     },
    { name: '投資', icon: '📈', color: 'var(--ns-chart-1)' },
    { name: '獎金', icon: '🎁', color: 'var(--ns-chart-3)' },
    { name: '租金', icon: '🏠', color: 'var(--ns-chart-2)' },
    { name: '兼職', icon: '🛠', color: 'var(--ns-chart-4)' },
    { name: '其他', icon: '⋯',  color: 'var(--ns-fg-dim)'  },
  ];
  const cats = type === 'income' ? incomeCats : expenseCats;
  const keys = ['7','8','9','+','4','5','6','−','1','2','3','=','.','0','←','✓'];

  const AccountRow = ({ label, name, sub, color, markLabel }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 14px', background: 'var(--ns-bg-elev)',
      border: '1px solid var(--ns-border)', borderRadius: 'var(--ns-r-md)',
    }}>
      {label && <span className="muted" style={{ fontSize: 11, minWidth: 28 }}>{label}</span>}
      <NSMark label={markLabel} color={color} size={26}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
        <div className="muted" style={{ fontSize: 11 }}>{sub}</div>
      </div>
      <NSIcon name="chevRight" size={14}/>
    </div>
  );

  return (
    <NSMobileShell active="add" hideTab>
      {/* Header */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 14, cursor: 'pointer' }}>取消</span>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 16 }}>記一筆</div>
        <span style={{ fontSize: 14, color: 'var(--ns-accent)', fontWeight: 500, cursor: 'pointer' }}>儲存</span>
      </div>

      {/* Type picker — horizontal scroll pills */}
      <div style={{ padding: '4px 18px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
          {types.map(t => (
            <button key={t.id} onClick={() => setType(t.id)} style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
              border: type === t.id ? 'none' : '1px solid var(--ns-border)',
              background: type === t.id ? t.color : 'var(--ns-bg-elev)',
              color: type === t.id ? (t.id === 'ar' || t.id === 'ap' ? '#fff' : 'var(--ns-bg)') : 'var(--ns-fg-dim)',
              cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Amount display */}
      <div style={{ textAlign: 'center', padding: '16px 18px 6px' }}>
        <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{current.eyebrow}</div>
        <div className="mono" style={{ fontSize: 52, fontWeight: 500, letterSpacing: -0.04, color: current.color }}>
          <span style={{ opacity: 0.5 }}>{current.sign}NT$</span>{amt}
        </div>
      </div>

      {/* ── 支出 / 收入: 分類 + 帳戶 + 週期 + 備註 ── */}
      {(type === 'expense' || type === 'income') && (
        <>
          {/* 大分類 grid */}
          <div style={{ padding: '8px 18px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
              {currentCats.map((c) => (
                <button key={c.name} onClick={() => { setActivecat(c.name); setSubcat(null); }}
                        className="ns-surface" style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          padding: '9px 0 7px', borderRadius: 'var(--ns-r-md)',
                          background: activecat === c.name ? c.color : 'var(--ns-bg-elev)',
                          color: activecat === c.name ? 'var(--ns-bg)' : 'var(--ns-fg)',
                          border: activecat === c.name ? 'none' : '1px solid var(--ns-border)',
                          fontFamily: 'inherit', cursor: 'pointer',
                        }}>
                  <span style={{ fontSize: 17 }}>{c.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 500 }}>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 細分類 horizontal scroll */}
          {parentCat && (
            <div style={{ padding: '6px 18px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
              <div style={{ display: 'flex', gap: 6, width: 'max-content', paddingLeft: 2, borderLeft: `2px solid ${parentCat.color}` }}>
                {parentCat.subs.map(s => (
                  <button key={s} onClick={() => setSubcat(s)} style={{
                    padding: '4px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: subcat === s ? parentCat.color : 'var(--ns-bg-elev)',
                    color: subcat === s ? '#fff' : 'var(--ns-fg-muted)',
                    border: subcat === s ? 'none' : '1px solid var(--ns-border)',
                    fontFamily: 'inherit', transition: 'all 0.1s',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '6px 18px 0' }}>
            <AccountRow markLabel="V" color="var(--ns-chart-2)"
              name="Cathay World Card" sub="信用卡 · 餘額 −48,210"/>
          </div>

          {/* 週期記帳 */}
          <div style={{ padding: '6px 18px 0' }}>
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[{id:'none',label:'不重複'},{id:'daily',label:'每日'},{id:'weekly',label:'每週'},{id:'monthly',label:'每月'},{id:'yearly',label:'每年'}].map(r => (
                <button key={r.id} onClick={() => setRecurring(r.id)} style={{
                  padding: '4px 11px', borderRadius: 999, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: recurring === r.id ? 'var(--ns-fg)' : 'var(--ns-bg-elev)',
                  color: recurring === r.id ? 'var(--ns-bg)' : 'var(--ns-fg-muted)',
                  border: recurring === r.id ? 'none' : '1px solid var(--ns-border)',
                  fontFamily: 'inherit', flexShrink: 0,
                }}>{r.label}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: '6px 18px 0' }}>
            <input className="ns-input" value={note} onChange={e => setNote(e.target.value)}
              placeholder="備註（選填）" style={{ fontSize: 13 }}/>
          </div>
        </>
      )}

      {/* ── 轉帳: 從 → 至 + 備註 ── */}
      {type === 'transfer' && (
        <div style={{ padding: '10px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AccountRow label="從" markLabel="V" color="var(--ns-chart-2)"
            name="Cathay World Card" sub="信用卡 · 餘額 −48,210"/>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <NSIcon name="arrowDown" size={16} style={{ opacity: 0.4 }}/>
          </div>
          <AccountRow label="至" markLabel="玉" color="var(--ns-chart-1)"
            name="玉山活存" sub="銀行帳戶 · 餘額 NT$284,000"/>
          <input className="ns-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="備註（選填）" style={{ fontSize: 13 }}/>
        </div>
      )}

      {/* ── 應收帳款 ── */}
      {type === 'ar' && (
        <div style={{ padding: '10px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--ns-r-md)',
            background: 'color-mix(in srgb, var(--ns-chart-3) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--ns-chart-3) 30%, transparent)',
            fontSize: 12, color: 'var(--ns-fg-muted)', lineHeight: 1.5,
          }}>
            應收帳款：對方欠你的錢，尚未入帳。記錄後可追蹤收款狀態。
          </div>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 5 }}>對象（欠款方）</div>
            <input className="ns-input" value={counterparty} onChange={e => setCounterparty(e.target.value)}
              placeholder="例：小明、ABC 公司" style={{ fontSize: 14 }}/>
          </div>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 5 }}>預計收款日</div>
            <input className="ns-input" type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ fontSize: 14, fontFamily: 'var(--ns-font-mono)' }}/>
          </div>
          <input className="ns-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="備註（選填）" style={{ fontSize: 13 }}/>
        </div>
      )}

      {/* ── 應付帳款 ── */}
      {type === 'ap' && (
        <div style={{ padding: '10px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 'var(--ns-r-md)',
            background: 'color-mix(in srgb, var(--ns-chart-5) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--ns-chart-5) 30%, transparent)',
            fontSize: 12, color: 'var(--ns-fg-muted)', lineHeight: 1.5,
          }}>
            應付帳款：你欠別人的錢，尚未付款。記錄後可追蹤付款截止日。
          </div>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 5 }}>對象（收款方）</div>
            <input className="ns-input" value={counterparty} onChange={e => setCounterparty(e.target.value)}
              placeholder="例：房東、供應商" style={{ fontSize: 14 }}/>
          </div>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 5 }}>付款截止日</div>
            <input className="ns-input" type="date" value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ fontSize: 14, fontFamily: 'var(--ns-font-mono)' }}/>
          </div>
          <input className="ns-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="備註（選填）" style={{ fontSize: 13 }}/>
        </div>
      )}

      <div style={{ flex: 1 }}/>

      {/* Numpad */}
      <div style={{
        background: 'var(--ns-bg-elev)', borderTop: '1px solid var(--ns-border)',
        padding: '10px 12px 28px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
          {keys.map((k) => {
            const isOp = ['+','−','=','←'].includes(k);
            const isPrimary = k === '✓';
            return (
              <button key={k} style={{
                fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums',
                fontSize: 22, fontWeight: 500, height: 46, borderRadius: 'var(--ns-r-md)',
                background: isPrimary ? current.color : isOp ? 'var(--ns-bg-card)' : 'var(--ns-bg-card)',
                color: isPrimary ? '#fff' : 'var(--ns-fg)',
                border: isPrimary ? 'none' : '1px solid var(--ns-border)', cursor: 'pointer',
              }}>{k}</button>
            );
          })}
        </div>
      </div>
    </NSMobileShell>
  );
}

// ─────── Mobile Accounts ───────
function NSMobileAccounts() {
  return (
    <NSMobileShell active="coin">
      <div style={{ padding: '16px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="ns-eyebrow">9 accounts · NTD</div>
          <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--ns-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>Accounts</h1>
        </div>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="plus" size={16} strokeWidth={2}/></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 100px' }}>
        <div className="ns-card" style={{ padding: 18, marginBottom: 14 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Total</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 500 }}>NT$8,452,310</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>4 NTD · 1 USD · 1 JPY · 1 BTC · 1 CC</div>
          <div style={{ display: 'flex', height: 8, marginTop: 12, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
            <div style={{ flex: 60, background: 'var(--ns-chart-1)' }}/>
            <div style={{ flex: 31, background: 'var(--ns-chart-2)' }}/>
            <div style={{ flex: 7, background: 'var(--ns-chart-5)' }}/>
            <div style={{ flex: 2, background: 'var(--ns-chart-3)' }}/>
          </div>
        </div>

        {[
          { name: 'Cash & deposits', total: 'NT$2,840K', items: [
            { mark: '玉', color: 'var(--ns-chart-1)', n: '玉山活儲', s: 'NTD', v: 'NT$1,840K' },
            { mark: 'BK', color: 'var(--ns-chart-2)', n: 'BoA 美元活存', s: 'USD · $24.5K', v: 'NT$774K' },
            { mark: 'JP', color: 'var(--ns-chart-3)', n: 'SMBC 円預金', s: 'JPY · ¥895K', v: 'NT$182K' },
          ]},
          { name: 'Investment', total: 'NT$5,210K', items: [
            { mark: '富', color: 'var(--ns-chart-1)', n: '富邦證券', s: 'TPE · 12 holdings', v: 'NT$3,182K' },
            { mark: 'IB', color: 'var(--ns-chart-2)', n: 'Interactive Brokers', s: 'NYSE · 7 holdings', v: 'NT$1,838K' },
            { mark: 'BT', color: 'var(--ns-chart-3)', n: 'BitoPro', s: '0.18 BTC · 4.2 ETH', v: 'NT$381K' },
          ]},
          { name: 'Credit', total: '−NT$48K', items: [
            { mark: 'V', color: 'var(--ns-neg)', n: 'Cathay World Card', s: '6/15 截止', v: '−NT$48K' },
          ]},
        ].map((g) => (
          <div key={g.name} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 6px' }}>
              <span className="ns-eyebrow">{g.name}</span>
              <span className="num muted" style={{ fontSize: 11.5 }}>{g.total}</span>
            </div>
            <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
              {g.items.map((a, i) => (
                <div key={a.n} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderTop: i ? '1px solid var(--ns-border)' : 'none',
                }}>
                  <NSMark label={a.mark} color={a.color} size={32}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.n}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{a.s}</div>
                  </div>
                  <div className="num" style={{ fontSize: 13.5 }}>{a.v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </NSMobileShell>
  );
}

Object.assign(window, {
  NSMobileShell, NSMobileDashboard, NSMobileHoldingDetail, NSMobileQuickAdd, NSMobileAccounts,
});
