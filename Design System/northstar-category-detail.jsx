// northstar-category-detail.jsx — Category Detail page (desktop + mobile)

// ─── Shared mock data ───
const catDetailInfo = {
  name: '交通', icon: '🚗', color: 'var(--ns-chart-4)',
  ytd: 9600, txns: 23, pct: 19.7, avgPerMonth: 1920, avgPerTxn: 417,
};

const catMonthly = [
  { month: '12月', total: 7800, txns: 18 },
  { month: '1月',  total: 8200, txns: 20 },
  { month: '2月',  total: 6400, txns: 15 },
  { month: '3月',  total: 9100, txns: 22 },
  { month: '4月',  total: 10200, txns: 25 },
  { month: '5月',  total: 1800,  txns: 5, partial: true },
];

const catSubcats = [
  { name: '計程車',   amt: 5200, pct: 54.2, color: 'var(--ns-chart-4)' },
  { name: '大眾運輸', amt: 3200, pct: 33.3, color: 'var(--ns-chart-1)' },
  { name: '外送',     amt: 800,  pct: 8.3,  color: 'var(--ns-chart-2)' },
  { name: '其他',     amt: 400,  pct: 4.2,  color: 'var(--ns-fg-dim)'  },
];

const catTopMerchants = [
  { mark: 'UB', color: 'var(--ns-chart-4)', name: 'Uber',       amt: 4800, txns: 11 },
  { mark: 'MR', color: 'var(--ns-chart-1)', name: 'MRT 捷運',   amt: 3200, txns: 62 },
  { mark: 'LT', color: 'var(--ns-chart-5)', name: 'LINE TAXI',  amt: 1240, txns: 6  },
  { mark: '大', color: 'var(--ns-chart-2)', name: '台灣大車隊', amt: 360,  txns: 3  },
];

const catDow = [
  { d: '一', v: 4 }, { d: '二', v: 7 }, { d: '三', v: 5 },
  { d: '四', v: 6 }, { d: '五', v: 9 }, { d: '六', v: 4 }, { d: '日', v: 2 },
];

const catTxns = [
  { date: '2026-05-27', name: 'UberX to 台北車站',  sub: '計程車',   acc: 'Cathay World Card', amt: 250 },
  { date: '2026-05-26', name: 'MRT 捷運',            sub: '大眾運輸', acc: '悠遊付',            amt: 28  },
  { date: '2026-05-24', name: 'UberX to 內湖',       sub: '計程車',   acc: 'Cathay World Card', amt: 310 },
  { date: '2026-05-22', name: 'LINE TAXI',            sub: '計程車',   acc: 'Line Pay',          amt: 180 },
  { date: '2026-05-20', name: 'MRT 捷運',            sub: '大眾運輸', acc: '悠遊付',            amt: 24  },
  { date: '2026-05-19', name: 'UberX to 信義',       sub: '計程車',   acc: 'Cathay World Card', amt: 380 },
  { date: '2026-05-15', name: 'Uber Eats · 午餐',    sub: '外送',     acc: 'Cathay World Card', amt: 185 },
  { date: '2026-05-12', name: 'MRT 捷運',            sub: '大眾運輸', acc: '悠遊付',            amt: 32  },
];

// ─────── Desktop: Category Detail ───────
function NSDesktopCategoryDetail({ onNavigate } = {}) {
  const [subFilter, setSubFilter] = React.useState('all');
  const [hoveredBar, setHoveredBar] = React.useState(null);

  const maxBar   = Math.max(...catMonthly.map(m => m.total));
  const maxDow   = Math.max(...catDow.map(d => d.v));
  const peakDay  = catDow.find(d => d.v === maxDow);
  const filtered = subFilter === 'all' ? catTxns : catTxns.filter(t => t.sub === subFilter);

  const { name, icon, color, ytd, txns, pct, avgPerMonth, avgPerTxn } = catDetailInfo;

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      <div style={{ height: '100%', overflow: 'auto', padding: '24px 32px 100px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button className="ns-btn ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => onNavigate && onNavigate('cashflow')}>
            <NSIcon name="chevLeft" size={12}/> Cash Flow
          </button>
          <span className="dim" style={{ fontSize: 12 }}>›</span>
          <span className="muted" style={{ fontSize: 12 }}>分類</span>
          <span className="dim" style={{ fontSize: 12 }}>›</span>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{icon} {name}</span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--ns-r-md)', fontSize: 24,
              background: `color-mix(in srgb, ${color} 18%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{icon}</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontFamily: 'var(--ns-font-display)', fontWeight: 600, letterSpacing: -0.02 }}>
                {name}
              </h1>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {catSubcats.map(s => (
                  <span key={s.name} style={{
                    fontSize: 11.5, padding: '2px 9px', borderRadius: 99,
                    background: `color-mix(in srgb, ${s.color} 15%, transparent)`,
                    color: s.color, fontWeight: 500,
                  }}>{s.name}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn" onClick={() => onNavigate && onNavigate('cat-mgmt')}>
              <NSIcon name="settings" size={14}/>管理分類
            </button>
            <button className="ns-btn"><NSIcon name="download" size={14}/>Export</button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            ['YTD 總支出', `NT$${ytd.toLocaleString()}`, color],
            ['交易筆數', `${txns} 筆`, null],
            ['月均支出', `NT$${avgPerMonth.toLocaleString()}`, null],
            ['佔總支出', `${pct}%`, null],
          ].map(([l, v, c]) => (
            <div className="ns-card" key={l} style={{ padding: '14px 18px' }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{l}</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 600, color: c || 'var(--ns-fg)' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Main grid: 2/3 | 1/3 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Monthly trend */}
            <div className="ns-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Monthly trend</div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 17, fontWeight: 500 }}>近 6 個月支出</h3>
                </div>
                {hoveredBar !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 16, fontWeight: 600 }}>
                      NT${catMonthly[hoveredBar].total.toLocaleString()}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{catMonthly[hoveredBar].txns} 筆 · {catMonthly[hoveredBar].month}</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
                {catMonthly.map((m, i) => {
                  const h = (m.total / maxBar) * 100;
                  const isHovered = hoveredBar === i;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'default' }}
                      onMouseEnter={() => setHoveredBar(i)}
                      onMouseLeave={() => setHoveredBar(null)}>
                      <div style={{
                        width: '100%', height: `${h}%`, borderRadius: '4px 4px 0 0',
                        background: m.partial
                          ? `repeating-linear-gradient(45deg, ${color} 0, ${color} 2px, transparent 2px, transparent 6px)`
                          : isHovered ? color : `color-mix(in srgb, ${color} 55%, transparent)`,
                        minHeight: 4, transition: 'background 0.12s',
                        outline: isHovered ? `2px solid ${color}` : 'none',
                      }}/>
                      <span className="dim" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{m.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sub-category breakdown */}
            <div className="ns-card">
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Sub-category breakdown</div>
              <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--ns-font-display)', fontSize: 17, fontWeight: 500 }}>各子分類佔比</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {catSubcats.map((s, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span className="muted" style={{ fontSize: 12 }}>{s.pct}%</span>
                        <span className="num neg" style={{ fontSize: 13, fontWeight: 500, minWidth: 90, textAlign: 'right' }}>
                          −NT${s.amt.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 7, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${s.pct}%`, borderRadius: 99,
                        background: s.color, transition: 'width 0.4s',
                      }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Stats */}
            <div className="ns-card">
              <div className="ns-eyebrow" style={{ marginBottom: 12 }}>Statistics</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['每筆均消', `NT$${avgPerTxn.toLocaleString()}`],
                  ['最高單月', `NT$10,200 (4月)`],
                  ['YTD vs 去年同期', '↑ +12.4%'],
                  ['使用帳戶數', '3 個帳戶'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--ns-border)' }}>
                    <span className="muted" style={{ fontSize: 13 }}>{l}</span>
                    <span className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Day-of-week */}
            <div className="ns-card">
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Day-of-week pattern</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>高峰：{peakDay.d}曜日</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64 }}>
                {catDow.map((d, i) => {
                  const h = (d.v / maxDow) * 100;
                  const isPeak = d.v === maxDow;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: '100%', height: `${h}%`, minHeight: 4,
                        borderRadius: '3px 3px 0 0',
                        background: isPeak ? color : `color-mix(in srgb, ${color} 35%, transparent)`,
                      }}/>
                      <span className={`dim`} style={{ fontSize: 10, fontWeight: isPeak ? 600 : 400 }}>{d.d}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top merchants in this category */}
            <div className="ns-card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--ns-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 3 }}>Top merchants</div>
                  <h4 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 15, fontWeight: 500 }}>此分類的商家</h4>
                </div>
              </div>
              {catTopMerchants.map((m, i) => (
                <div key={i}
                  onClick={() => onNavigate && onNavigate('merchant')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 18px', borderTop: i > 0 ? '1px solid var(--ns-border)' : 'none',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <NSMark label={m.mark} color={m.color} size={28}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{m.txns} 次</div>
                  </div>
                  <span className="neg num" style={{ fontSize: 13, fontWeight: 500 }}>
                    −NT${m.amt.toLocaleString()}
                  </span>
                  <NSIcon name="chevRight" size={12}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transaction list */}
        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 3 }}>Transactions</div>
              <h4 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 15, fontWeight: 500 }}>
                {filtered.length} 筆 · NT${filtered.reduce((s, t) => s + t.amt, 0).toLocaleString()}
              </h4>
            </div>
            {/* Sub-cat filter pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', ...catSubcats.map(s => s.name)].map(f => (
                <button key={f} onClick={() => setSubFilter(f)} style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 12, fontFamily: 'inherit',
                  border: subFilter === f ? 'none' : '1px solid var(--ns-border)',
                  background: subFilter === f ? color : 'transparent',
                  color: subFilter === f ? '#fff' : 'var(--ns-fg-muted)',
                  cursor: 'pointer', fontWeight: subFilter === f ? 500 : 400,
                  transition: 'all 0.12s',
                }}>{f === 'all' ? '全部' : f}</button>
              ))}
            </div>
          </div>

          {/* Column header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '110px 1fr 100px 1fr 120px',
            padding: '8px 22px', borderBottom: '1px solid var(--ns-border)',
            fontSize: 10.5, letterSpacing: 0.06, textTransform: 'uppercase',
            color: 'var(--ns-fg-dim)', fontFamily: 'var(--ns-font-mono)',
            background: 'var(--ns-bg-elev)',
          }}>
            <span>Date</span><span>名稱</span><span>子分類</span><span>帳戶</span><span style={{ textAlign: 'right' }}>金額</span>
          </div>

          {filtered.map((t, i) => (
            <div key={i} onClick={() => onNavigate && onNavigate('cf-detail')} style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 100px 1fr 120px',
              alignItems: 'center', padding: '11px 22px',
              borderTop: '1px solid var(--ns-border)', cursor: 'pointer', transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span className="mono muted" style={{ fontSize: 12 }}>{t.date.slice(5)}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</span>
              <span style={{
                display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 99,
                background: `color-mix(in srgb, ${color} 15%, transparent)`,
                color: color, fontWeight: 500,
              }}>{t.sub}</span>
              <span className="muted" style={{ fontSize: 12 }}>{t.acc}</span>
              <span className="neg num" style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                −NT${t.amt.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Mobile: Category Detail ───────
function NSMobileCategoryDetail({ onNavigate } = {}) {
  const [subFilter, setSubFilter] = React.useState('all');
  const { name, icon, color, ytd, txns, pct, avgPerMonth } = catDetailInfo;
  const maxBar  = Math.max(...catMonthly.map(m => m.total));
  const maxDow  = Math.max(...catDow.map(d => d.v));
  const filtered = subFilter === 'all' ? catTxns : catTxns.filter(t => t.sub === subFilter);

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--ns-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px 10px',
        borderBottom: '1px solid var(--ns-border)', gap: 10, flexShrink: 0,
        background: 'var(--ns-bg-elev)',
      }}>
        <button className="ns-btn ghost icon" onClick={() => onNavigate && onNavigate('cashflow')} style={{ padding: '6px 8px' }}>
          <NSIcon name="chevLeft" size={16}/>
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{name}</div>
            <div className="muted" style={{ fontSize: 11 }}>分類分析</div>
          </div>
        </div>
        <button className="ns-btn ghost icon" onClick={() => onNavigate && onNavigate('cat-mgmt')}>
          <NSIcon name="settings" size={16}/>
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 80px' }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            ['YTD', `NT$${(ytd/1000).toFixed(1)}K`, color],
            ['筆數', `${txns} 筆`, null],
            ['佔比', `${pct}%`, null],
          ].map(([l, v, c]) => (
            <div key={l} className="ns-card" style={{ padding: '12px 14px' }}>
              <div className="ns-eyebrow" style={{ marginBottom: 4, fontSize: 9.5 }}>{l}</div>
              <div className="num" style={{ fontSize: 16, fontWeight: 600, color: c || 'var(--ns-fg)' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Monthly mini-bars */}
        <div className="ns-card" style={{ marginBottom: 14 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 10 }}>6-month trend</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64 }}>
            {catMonthly.map((m, i) => {
              const h = (m.total / maxBar) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', minHeight: 3, height: `${h}%`, borderRadius: '3px 3px 0 0',
                    background: m.partial
                      ? `repeating-linear-gradient(45deg, ${color} 0, ${color} 2px, transparent 2px, transparent 6px)`
                      : `color-mix(in srgb, ${color} 65%, transparent)`,
                  }}/>
                  <span className="dim" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>{m.month.replace('月', '')}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sub-cat + DoW side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {/* Sub-categories */}
          <div className="ns-card" style={{ padding: '14px 14px' }}>
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>子分類</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {catSubcats.map((s, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span className="muted">{s.pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.pct}%`, borderRadius: 99, background: s.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DoW */}
          <div className="ns-card" style={{ padding: '14px 14px' }}>
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>星期分布</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
              {catDow.map((d, i) => {
                const h = (d.v / maxDow) * 100;
                const isPeak = d.v === maxDow;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: '100%', height: `${h}%`, minHeight: 3, borderRadius: '3px 3px 0 0',
                      background: isPeak ? color : `color-mix(in srgb, ${color} 35%, transparent)`,
                    }}/>
                    <span className="dim" style={{ fontSize: 9, fontWeight: isPeak ? 700 : 400 }}>{d.d}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top merchants */}
        <div className="ns-card" style={{ marginBottom: 14, padding: 0 }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--ns-border)' }}>
            <div className="ns-eyebrow">此分類商家</div>
          </div>
          {catTopMerchants.map((m, i) => (
            <div key={i}
              onClick={() => onNavigate && onNavigate('merchant')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--ns-border)' : 'none',
                cursor: 'pointer',
              }}>
              <NSMark label={m.mark} color={m.color} size={32}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{m.txns} 次</div>
              </div>
              <span className="neg num" style={{ fontSize: 13, fontWeight: 500 }}>−NT${m.amt.toLocaleString()}</span>
              <NSIcon name="chevRight" size={13}/>
            </div>
          ))}
        </div>

        {/* Transaction list */}
        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--ns-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="ns-eyebrow">Transactions · {filtered.length} 筆</div>
          </div>
          {/* Sub-cat pills */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '1px solid var(--ns-border)' }}>
            {['all', ...catSubcats.map(s => s.name)].map(f => (
              <button key={f} onClick={() => setSubFilter(f)} style={{
                flexShrink: 0, padding: '4px 12px', borderRadius: 99, fontSize: 11.5, fontFamily: 'inherit',
                border: subFilter === f ? 'none' : '1px solid var(--ns-border)',
                background: subFilter === f ? color : 'transparent',
                color: subFilter === f ? '#fff' : 'var(--ns-fg-muted)',
                cursor: 'pointer', fontWeight: subFilter === f ? 500 : 400,
              }}>{f === 'all' ? '全部' : f}</button>
            ))}
          </div>
          {filtered.map((t, i) => (
            <div key={i} onClick={() => onNavigate && onNavigate('cf-detail')} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 16px', borderTop: '1px solid var(--ns-border)', cursor: 'pointer',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ns-r-sm)', flexShrink: 0,
                background: `color-mix(in srgb, ${color} 18%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
              }}>{catDetailInfo.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{t.date.slice(5)} · {t.sub}</div>
              </div>
              <span className="neg num" style={{ fontSize: 14, fontWeight: 500, flexShrink: 0 }}>−NT${t.amt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NSDesktopCategoryDetail, NSMobileCategoryDetail });
