// northstar-dashboard2.jsx — Dashboard V2 · complete overview

function NSDesktopDashboardV2({ onNavigate } = {}) {
  const [period, setPeriod] = React.useState('1M');
  const [alertDismissed, setAlertDismissed] = React.useState(false);

  const series    = nsSeries(180, 6_800_000, 0.012, 0.0018);
  const benchmark = nsSeries(180, 6_800_000, 0.008, 0.0012);
  const labels    = Array.from({ length: 180 }, (_, i) => {
    const d = new Date(2026, 0, 1); d.setDate(d.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const budgetCats = [
    { name: '食物', icon: '🍱', color: '#f0c050', budget: 8000,  spent: 8240  },
    { name: '交通', icon: '🚖', color: '#6fb3ff', budget: 5000,  spent: 4520  },
    { name: '娛樂', icon: '🎮', color: '#a99cff', budget: 3000,  spent: 3110  },
    { name: '訂閱', icon: '📺', color: '#6ee49a', budget: 2500,  spent: 2280  },
    { name: '居家', icon: '🏠', color: '#ff7d6b', budget: 5000,  spent: 2850  },
  ];

  const upcomingBills = [
    { icon: 'SP', color: 'var(--ns-chart-2)', name: 'Spotify',     cat: '訂閱',  amt: 149,   date: '5/30' },
    { icon: 'NF', color: 'var(--ns-chart-5)', name: 'Netflix',     cat: '訂閱',  amt: 390,   date: '6/2'  },
    { icon: '房',  color: 'var(--ns-chart-3)', name: '房租',        cat: '居家',  amt: 22000, date: '6/5'  },
    { icon: 'CC', color: 'var(--ns-neg)',      name: '信用卡 應繳', cat: '信用卡', amt: 48210, date: '6/15' },
  ];

  const goals = [
    { name: 'FIRE 財務獨立',  pct: 24.1, color: 'var(--ns-chart-1)', curr: 'NT$8.45M', target: 'NT$35M', eta: '2042' },
    { name: '緊急預備金',     pct: 100,  color: 'var(--ns-pos)',     curr: 'NT$360K',  target: 'NT$360K', eta: '已達成' },
    { name: '頭期款 · 信義區', pct: 35.7, color: 'var(--ns-chart-4)', curr: 'NT$2.14M', target: 'NT$6M', eta: '2030' },
  ];

  const fxData = [
    { pair: 'USD/NTD', rate: '31.62',  pct: -0.08 },
    { pair: 'JPY/NTD', rate: '0.2045', pct: +0.15 },
    { pair: 'EUR/NTD', rate: '35.18',  pct: -0.25 },
  ];

  const indices = [
    { name: 'TAIEX',   val: '22,841', pct: +1.24 },
    { name: 'S&P 500', val: '5,312',  pct: -0.18 },
    { name: 'NASDAQ',  val: '16,782', pct: -0.31 },
  ];

  const recentTxns = [
    { mark: 'TS', color: 'var(--ns-chart-1)', name: '台積電配息',    sub: '證券戶 · 配息入帳',     amt: +3500   },
    { mark: 'UB', color: 'var(--ns-chart-4)', name: 'Uber',          sub: '14:32 · 信用卡 · 交通', amt: -250    },
    { mark: 'FX', color: 'var(--ns-chart-2)', name: 'NTD → USD',     sub: '美元帳戶轉入 1,500 USD', amt: -47430  },
    { mark: 'AA', color: 'var(--ns-chart-5)', name: 'AAPL · Apple', sub: '+2 股 @198.45 · 美股戶', amt: -12553  },
  ];

  const overBudget = budgetCats.filter(c => c.spent > c.budget);

  return (
    <NSDesktopShell active="dashboard" onNavigate={onNavigate}>
      <div style={{ padding: '22px 32px 100px', height: '100%', overflow: 'auto' }}>

        {/* ── Alert strip ── */}
        {!alertDismissed && overBudget.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 'var(--ns-r-md)',
            background: 'var(--ns-neg-soft)', border: '1px solid color-mix(in srgb, var(--ns-neg) 40%, transparent)',
            marginBottom: 14, fontSize: 13,
          }}>
            <NSIcon name="bell" size={14} />
            <span>
              <strong>{overBudget.map(c => c.name).join('、')}</strong> 本月已超支預算
              &nbsp;·&nbsp;超出 NT${overBudget.reduce((s, c) => s + c.spent - c.budget, 0).toLocaleString()}
            </span>
            <button className="ns-btn ghost" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }}
              onClick={() => onNavigate && onNavigate('cat-mgmt')}>查看分類 →</button>
            <button className="ns-btn ghost icon" style={{ padding: 4 }}
              onClick={() => setAlertDismissed(true)}>✕</button>
          </div>
        )}

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Overview · 5 月 27 日</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>
              晚安，家瑋
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="refresh" size={14} />2 分鐘前更新</button>
            <button className="ns-btn"><NSIcon name="download" size={14} />Export</button>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2} />新增</button>
          </div>
        </div>

        {/* ── Row 1 · Net worth chart + KPI stack ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 296px', gap: 16, marginBottom: 16 }}>

          {/* Net worth card */}
          <div className="ns-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 5 }}>Net worth · NTD</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span className="ns-num-xl">NT$8,452,310</span>
                  <span className="ns-pill solid-pos">
                    <NSIcon name="arrowUp" size={11} strokeWidth={2} />
                    <span className="num">+NT$184K · 2.23%</span>
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  vs 上個月 <span className="mono">NT$8,268,100</span>
                  &nbsp;·&nbsp; FX base NTD &nbsp;·&nbsp; <span className="mono">USD 1 = 31.62</span>
                </div>
              </div>
              <div className="ns-seg">
                {['1W', '1M', '3M', 'YTD', '1Y'].map(v => (
                  <button key={v} aria-selected={v === period} onClick={() => setPeriod(v)}>{v}</button>
                ))}
              </div>
            </div>
            <div style={{ height: 190 }}>
              <NSAreaChart data={series} secondary={benchmark} secondaryLabel="0050 benchmark"
                w={900} h={190} xLabels={labels} highlightIdx={140}
                yFormat={v => 'NT$' + (v / 1_000_000).toFixed(2) + 'M'} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 2, background: 'var(--ns-accent)' }} />
                <span className="muted">Net worth</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 2, background: 'var(--ns-fg-dim)', borderTop: '1px dashed var(--ns-fg-dim)' }} />
                <span className="muted">0050.TW benchmark</span>
              </span>
              <span className="dim" style={{ marginLeft: 'auto' }}>Hover to scrub →</span>
            </div>
          </div>

          {/* KPI stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Investments',    value: 'NT$5,210K', sub: '61.6%', trend: +1.82, color: 'var(--ns-chart-1)', spark: nsSeries(20, 100, 0.014, 0.003) },
              { label: 'Cash & savings', value: 'NT$2,840K', sub: '33.6%', trend: +0.42, color: 'var(--ns-chart-2)', spark: nsSeries(20, 100, 0.005, 0.001) },
              { label: 'Real assets',    value: 'NT$402K',   sub: '4.8%',  trend: -0.91, color: 'var(--ns-chart-5)', spark: nsSeries(20, 100, 0.025, -0.001) },
            ].map(k => (
              <div key={k.label} className="ns-card" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 4, height: 32, borderRadius: 99, background: k.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="ns-eyebrow" style={{ fontSize: 10 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, marginTop: 1 }}>{k.value}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={'ns-pill ' + (k.trend >= 0 ? 'solid-pos' : 'solid-neg')} style={{ fontSize: 10.5 }}>
                    <NSIcon name={k.trend >= 0 ? 'arrowUp' : 'arrowDown'} size={10} strokeWidth={2} />
                    <span className="num">{Math.abs(k.trend).toFixed(2)}%</span>
                  </span>
                  <NSSparkline data={k.spark} pos={k.trend >= 0} w={60} h={16} />
                </div>
              </div>
            ))}
            {/* Cash flow KPI */}
            <div className="ns-card" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 32, borderRadius: 99, background: 'var(--ns-chart-3)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="ns-eyebrow" style={{ fontSize: 10 }}>本月現金流</div>
                <div className="pos" style={{ fontSize: 18, fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, marginTop: 1 }}>+NT$48,210</div>
              </div>
              <div style={{ fontSize: 11.5, textAlign: 'right' }}>
                <div className="muted">收 NT$72K</div>
                <div className="muted">支 NT$24K</div>
                <div className="pos mono" style={{ fontSize: 11 }}>儲蓄率 66.7%</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2 · Budget health + Upcoming bills ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Budget health */}
          <div className="ns-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Budget · 5 月</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>預算進度</h3>
              </div>
              <button className="ns-btn ghost" style={{ fontSize: 12 }}
                onClick={() => onNavigate && onNavigate('cat-mgmt')}>
                管理分類 →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {budgetCats.map(c => {
                const pct = Math.min(c.spent / c.budget, 1);
                const over = c.spent > c.budget;
                return (
                  <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '22px 72px 1fr 110px', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 15 }}>{c.icon}</span>
                    <span style={{ fontSize: 13 }}>{c.name}</span>
                    <div>
                      <div style={{ height: 7, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                        <div style={{ width: (pct * 100) + '%', height: '100%', background: over ? 'var(--ns-neg)' : c.color, borderRadius: 99, transition: 'width .4s var(--ns-ease)' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                      <span className={'num ' + (over ? 'neg' : 'muted')}>{(pct * 100).toFixed(0)}%</span>
                      <span className="dim">·</span>
                      <span className={'num ' + (over ? 'neg' : '')}>NT${c.spent.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ns-border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span className="muted">總預算 NT$28,500</span>
              <span>
                <span className="neg num">食物超支 NT$240</span>
                <span className="muted"> · 1 個分類超支</span>
              </span>
            </div>
          </div>

          {/* Upcoming bills */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Upcoming</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>近期帳單 · 未來 30 天</h3>
              </div>
              <span className="ns-pill solid-neg" style={{ fontSize: 11 }}>NT$70,749</span>
            </div>
            {upcomingBills.map((b, i) => (
              <div key={b.name} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', borderTop: i ? '1px solid var(--ns-border)' : 'none',
              }}>
                <NSMark label={b.icon} color={b.color} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{b.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{b.cat}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 13.5 }}>−NT${b.amt.toLocaleString()}</div>
                  <div className="mono dim" style={{ fontSize: 11 }}>{b.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 3 · Allocation + Goals + Market ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 0.82fr', gap: 16, marginBottom: 16 }}>

          {/* Asset allocation */}
          <div className="ns-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Asset allocation</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>By class</h3>
              </div>
              <div className="ns-seg" style={{ fontSize: 11 }}>
                <button aria-selected>Class</button>
                <button>Region</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 18, alignItems: 'center' }}>
              <NSDonut size={120} thickness={18}
                data={[
                  { label: 'TW equity', v: 38, color: 'var(--ns-chart-1)' },
                  { label: 'US equity', v: 24, color: 'var(--ns-chart-2)' },
                  { label: 'Cash',      v: 22, color: 'var(--ns-chart-3)' },
                  { label: 'Bonds',     v: 10, color: 'var(--ns-chart-4)' },
                  { label: 'Crypto',    v:  6, color: 'var(--ns-chart-5)' },
                ]}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Taiwan equity', '38.2%', 'var(--ns-chart-1)', 'NT$3,228K'],
                  ['US equity',     '23.7%', 'var(--ns-chart-2)', 'NT$2,003K'],
                  ['Cash',          '22.4%', 'var(--ns-chart-3)', 'NT$1,893K'],
                  ['Bonds',          '9.8%', 'var(--ns-chart-4)', 'NT$828K'],
                  ['Crypto',         '5.9%', 'var(--ns-chart-5)', 'NT$499K'],
                ].map(r => (
                  <div key={r[0]} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, borderBottom: '1px solid var(--ns-border)', paddingBottom: 5 }}>
                    <span style={{ width: 8, height: 8, background: r[2], borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{r[0]}</span>
                    <span className="num muted" style={{ fontSize: 11 }}>{r[3]}</span>
                    <span className="num" style={{ minWidth: 40, textAlign: 'right' }}>{r[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Goals progress */}
          <div className="ns-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Goals</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>5 active</h3>
              </div>
              <button className="ns-btn ghost" style={{ fontSize: 12 }}
                onClick={() => onNavigate && onNavigate('goals')}>全部 →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {goals.map(g => (
                <div key={g.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {g.pct >= 100
                        ? <span className="ns-pill solid-pos" style={{ fontSize: 10 }}><NSIcon name="check" size={10} strokeWidth={2.2} />達成</span>
                        : <span className="mono dim" style={{ fontSize: 11 }}>{g.eta}</span>}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden', marginBottom: 5 }}>
                    <div style={{ width: Math.min(g.pct, 100) + '%', height: '100%', background: g.color, borderRadius: 99 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span className="mono pos" style={{ color: g.color }}>{g.pct.toFixed(1)}% · {g.curr}</span>
                    <span className="mono muted">{g.target}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Market + FX */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--ns-border)' }}>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Market</div>
              <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>FX &amp; Indices</h3>
            </div>
            <div style={{ padding: '8px 18px 6px' }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>FX Rates</div>
            </div>
            {fxData.map((fx, i) => (
              <div key={fx.pair} style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--ns-border)' }}>
                <span className="mono" style={{ fontSize: 12.5, flex: 1 }}>{fx.pair}</span>
                <span className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{fx.rate}</span>
                <span className={'num ' + (fx.pct >= 0 ? 'pos' : 'neg')} style={{ fontSize: 11, minWidth: 48, textAlign: 'right' }}>
                  {fx.pct >= 0 ? '+' : ''}{fx.pct.toFixed(2)}%
                </span>
              </div>
            ))}
            <div style={{ padding: '10px 18px 6px', borderTop: '1px solid var(--ns-border)' }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Indices</div>
            </div>
            {indices.map(ix => (
              <div key={ix.name} style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--ns-border)' }}>
                <span className="mono" style={{ fontSize: 12.5, flex: 1 }}>{ix.name}</span>
                <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{ix.val}</span>
                <span className={'num ' + (ix.pct >= 0 ? 'pos' : 'neg')} style={{ fontSize: 11, minWidth: 48, textAlign: 'right' }}>
                  {ix.pct >= 0 ? '+' : ''}{ix.pct.toFixed(2)}%
                </span>
              </div>
            ))}
            <div style={{ padding: '8px 18px', borderTop: '1px solid var(--ns-border)', fontSize: 10.5, color: 'var(--ns-fg-dim)' }}>
              更新 14:32 · Yahoo Finance
            </div>
          </div>
        </div>

        {/* ── Row 4 · Recent activity (2-col) ── */}
        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recent activity</div>
              <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>Last 24h · 8 events</h3>
            </div>
            <button className="ns-btn ghost" style={{ fontSize: 12 }}
              onClick={() => onNavigate && onNavigate('cashflow')}>查看全部 →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {recentTxns.map((r, i) => (
              <div key={i} className="ns-row" style={{
                gap: 12, paddingLeft: 22, paddingRight: 22,
                borderLeft: i % 2 === 1 ? '1px solid var(--ns-border)' : 'none',
                cursor: 'pointer',
              }} onClick={() => onNavigate && onNavigate('cf-detail')}>
                <NSMark label={r.mark} color={r.color} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.sub}</div>
                </div>
                <div className={'num ' + (r.amt >= 0 ? 'pos' : '')} style={{ fontSize: 14, minWidth: 88, textAlign: 'right' }}>
                  {r.amt >= 0 ? '+' : '−'}NT${Math.abs(r.amt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </NSDesktopShell>
  );
}

Object.assign(window, { NSDesktopDashboardV2 });
