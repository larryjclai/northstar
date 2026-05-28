// northstar-desktop.jsx — Desktop screens (1440 wide × 900 tall)

// ─────── Shared app shell ───────
function NSDesktopShell({ children, active = 'dashboard', quickAdd = true, onNavigate }) {
  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'holdings', label: 'Holdings', icon: 'chart' },
    { id: 'cashflow', label: 'Cash Flow', icon: 'coin' },
    { id: 'accounts', label: 'Accounts', icon: 'wallet' },
    { id: 'goals', label: 'Goals · FIRE', icon: 'target' },
  ];
  const nav2 = [
    { id: 'connect', label: 'Connect · Household', icon: 'users' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  const clickable = !!onNavigate;
  const go = (id) => clickable && onNavigate(id);
  return (
    <div className="ns-board" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%' }}>
      {/* Sidebar */}
      <aside style={{
        background: 'var(--ns-bg-elev)',
        borderRight: '1px solid var(--ns-border)',
        padding: '22px 14px 14px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ padding: '0 8px 12px' }}>
          <NSLogo />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 14px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 99, background: 'linear-gradient(135deg,#9fe870,#6ee49a)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>陳家</div>
            <div className="dim mono" style={{ fontSize: 10.5 }}>Household · 2 members</div>
          </div>
          <NSIcon name="chevDown" size={14}/>
        </div>

        <div style={{ position: 'relative' }}>
          <NSIcon name="search" size={14}/>
          <span style={{ position: 'absolute', left: 30, top: 9, fontSize: 12.5 }} className="muted">Search · </span>
          <span style={{ position: 'absolute', right: 12, top: 8 }} className="dim mono">⌘K</span>
          <input className="ns-input" placeholder="" style={{ paddingLeft: 32, fontSize: 12.5, marginBottom: 14 }} />
        </div>

        {nav.map((n) => (
          <div key={n.id} className={'ns-nav-link' + (n.id === active ? ' active' : '')}
               onClick={() => go(n.id)}>
            <NSIcon name={n.icon} size={16}/> <span>{n.label}</span>
          </div>
        ))}

        <div className="ns-eyebrow" style={{ padding: '18px 11px 8px' }}>Settings</div>
        {nav2.map((n) => (
          <div key={n.id} className={'ns-nav-link' + (n.id === active ? ' active' : '')}
               onClick={() => go(n.id)}>
            <NSIcon name={n.icon} size={16}/> <span>{n.label}</span>
          </div>
        ))}

        <div style={{ flex: 1 }}/>

        <div className="ns-surface" style={{ padding: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <NSIcon name="lock" size={13}/>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Local-first</span>
          </div>
          <div className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>Vault unlocked · this device only. Connect to sync.</div>
        </div>
      </aside>

      {/* Main area */}
      <main style={{ position: 'relative', overflow: 'hidden' }}>
        {children}
        {quickAdd && <NSQuickAddBar />}
      </main>
    </div>
  );
}

// ─────── Floating Quick-add bar ───────
function NSQuickAddBar() {
  const [text, setText] = React.useState('');
  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 20, transform: 'translateX(-50%)',
      width: 580, zIndex: 5,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'var(--ns-bg-card)',
        border: '1px solid var(--ns-border)',
        borderRadius: 999,
        padding: '6px 6px 6px 18px',
        boxShadow: 'var(--ns-shadow-2)',
      }}>
        <NSIcon name="plus" size={16} strokeWidth={2}/>
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Quick add · 試試「拿鐵 120 信用卡」或「買 2330.TW 5股 @1042」"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--ns-fg)', fontFamily: 'inherit', fontSize: 13.5,
            padding: '8px 8px',
          }}/>
        <span className="ns-pill" style={{ fontSize: 10.5 }}><span className="mono">⌘N</span></span>
        <button className="ns-btn ghost" style={{ padding: 8 }}><NSIcon name="sparkle" size={14}/></button>
        <button className="ns-btn primary" style={{ padding: '8px 16px', borderRadius: 999 }}>Add</button>
      </div>
    </div>
  );
}

// ─────── 1. Dashboard ───────
function NSDesktopDashboard({ onNavigate } = {}) {
  const series = nsSeries(180, 6_800_000, 0.012, 0.0018);
  const benchmark = nsSeries(180, 6_800_000, 0.008, 0.0012);
  const labels = Array.from({ length: 180 }, (_, i) => {
    const d = new Date(2026, 0, 1);
    d.setDate(d.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  return (
    <NSDesktopShell active="dashboard" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Overview · 5 月 27 日</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 30, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>晚安，家瑋</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="refresh" size={14}/>2 分鐘前更新</button>
            <button className="ns-btn"><NSIcon name="download" size={14}/>Export</button>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新增</button>
          </div>
        </div>

        {/* Hero net worth */}
        <div className="ns-card" style={{ padding: 28, marginBottom: 20, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Net worth · NTD</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span className="ns-num-xl">NT$8,452,310</span>
                <span className="ns-pill solid-pos" style={{ fontSize: 13, padding: '5px 12px' }}>
                  <NSIcon name="arrowUp" size={12} strokeWidth={2}/>
                  <span className="num">+184,210 · 2.23%</span>
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                <span>vs 上個月</span> · <span className="mono">NT$8,268,100</span>
                &nbsp; · &nbsp;
                <span>FX 基準 NTD</span> · <span className="mono">USD 1 = 31.62</span>
              </div>
            </div>
            <div className="ns-seg">
              {['1D','1W','1M','3M','YTD','1Y','ALL'].map((v, i) => (
                <button key={v} aria-selected={v === '1M'}>{v}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 260 }}>
            <NSAreaChart
              data={series} secondary={benchmark} secondaryLabel="0050 benchmark"
              w={1100} h={260} xLabels={labels}
              yFormat={(v) => 'NT$' + (v / 1_000_000).toFixed(2) + 'M'}
              highlightIdx={140}
            />
          </div>

          <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 2, background: 'var(--ns-accent)' }}/>
              <span className="muted">Net worth</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 2, background: 'var(--ns-fg-dim)', borderTop: '1px dashed var(--ns-fg-dim)' }}/>
              <span className="muted">0050.TW benchmark</span>
            </span>
            <span className="dim" style={{ marginLeft: 'auto' }}>Hover the chart to scrub →</span>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          <NSKpi label="Investments" value="NT$5,210K" sub="61.6% · stocks, ETFs"
                 trend={1.82} spark={nsSeries(30, 100, 0.014, 0.003)} />
          <NSKpi label="Cash & savings" value="NT$2,840K" sub="33.6% · 5 accounts"
                 trend={0.42} spark={nsSeries(30, 100, 0.005, 0.001)} />
          <NSKpi label="Real assets" value="NT$402K" sub="4.8% · crypto, gold"
                 trend={-0.91} spark={nsSeries(30, 100, 0.025, -0.001)} />
          <NSKpi label="本月現金流" value="+NT$48,210" sub="收 72K · 支 24K"
                 trend={5.6} spark={nsSeries(30, 100, 0.02, 0.003)} />
        </div>

        {/* Two-up */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          {/* Allocation */}
          <div className="ns-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Asset allocation</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 500 }}>By class & geography</h3>
              </div>
              <div className="ns-seg">
                <button aria-selected>By class</button>
                <button>By region</button>
                <button>By account</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24, alignItems: 'center' }}>
              <NSDonut
                size={160} thickness={22}
                data={[
                  { label: 'Taiwan equity', v: 38, color: 'var(--ns-chart-1)' },
                  { label: 'US equity', v: 24, color: 'var(--ns-chart-2)' },
                  { label: 'Cash', v: 22, color: 'var(--ns-chart-3)' },
                  { label: 'Bonds & cash equiv.', v: 10, color: 'var(--ns-chart-4)' },
                  { label: 'Crypto & gold', v: 6, color: 'var(--ns-chart-5)' },
                ]}
              />
              <div style={{ display: 'grid', gap: 6 }}>
                {[
                  ['Taiwan equity', '38.2%', 'var(--ns-chart-1)', 'NT$3,228K'],
                  ['US equity', '23.7%', 'var(--ns-chart-2)', 'NT$2,003K'],
                  ['Cash', '22.4%', 'var(--ns-chart-3)', 'NT$1,893K'],
                  ['Bonds & cash equiv.', '9.8%', 'var(--ns-chart-4)', 'NT$828K'],
                  ['Crypto & gold', '5.9%', 'var(--ns-chart-5)', 'NT$499K'],
                ].map((r) => (
                  <div key={r[0]} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--ns-border)' }}>
                    <span style={{ width: 9, height: 9, background: r[2], borderRadius: 2 }}/>
                    <span style={{ flex: 1, fontSize: 13 }}>{r[0]}</span>
                    <span className="num muted" style={{ fontSize: 12 }}>{r[3]}</span>
                    <span className="num" style={{ fontSize: 13, minWidth: 52, textAlign: 'right' }}>{r[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{ padding: 20, paddingBottom: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recent activity</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 500 }}>Last 24h · 8 events</h3>
              </div>
              <a className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>See all →</a>
            </div>
            {[
              { mark: 'TS', color: 'var(--ns-chart-1)', name: '2330.TW · 台積電', sub: '配息入帳 · 證券戶', amt: +3500, mono: true },
              { mark: 'UB', color: 'var(--ns-chart-4)', name: 'Uber', sub: '14:32 · 信用卡', amt: -250 },
              { mark: 'FX', color: 'var(--ns-chart-2)', name: 'NTD → USD', sub: '美元帳戶轉入 1,500 USD · @31.62', amt: -47430 },
              { mark: 'AA', color: 'var(--ns-chart-5)', name: 'AAPL · Apple', sub: '+2 股 @ 198.45 · 美股戶', amt: -12553, mono: true },
              { mark: '$', color: 'var(--ns-chart-3)', name: '薪資轉入', sub: '5/25 · 玉山銀行', amt: +72000 },
            ].map((r, i) => (
              <div key={i} className="ns-row" style={{ gap: 12 }}>
                <NSMark label={r.mark} color={r.color} size={32} mono={r.mono}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.sub}</div>
                </div>
                <div className={'num ' + (r.amt >= 0 ? 'pos' : '')} style={{ fontSize: 14, minWidth: 100, textAlign: 'right' }}>
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

// ─────── 2. Holdings ───────
function NSDesktopHoldings({ onNavigate } = {}) {
  const holdings = [
    { sym: '2330.TW', name: '台積電', qty: 1000, avg: 612.40, last: 1042.00, pct: 70.13, val: 1042000, day: 1.82, divYtd: 14500, weight: 19.8 },
    { sym: '0050.TW', name: '元大台灣50', qty: 5000, avg: 138.20, last: 169.30, pct: 22.50, val: 846500, day: 0.42, divYtd: 11800, weight: 16.2 },
    { sym: 'VTI', name: 'Vanguard Total US', qty: 60, avg: 215.40, last: 264.18, pct: 22.64, val: 501100, day: -0.18, divYtd: 4280, weight: 9.6 },
    { sym: 'AAPL', name: 'Apple', qty: 40, avg: 178.50, last: 198.45, pct: 11.18, val: 250980, day: 0.91, divYtd: 720, weight: 4.8 },
    { sym: '2454.TW', name: '聯發科', qty: 200, avg: 820.10, last: 1180.00, pct: 43.88, val: 236000, day: -1.25, divYtd: 5400, weight: 4.5 },
    { sym: 'VWRA', name: 'FTSE All-World', qty: 350, avg: 98.20, last: 122.60, pct: 24.85, val: 135562, day: 0.31, divYtd: 1840, weight: 2.6 },
    { sym: 'BTC',    name: 'Bitcoin', qty: 0.18, avg: 1_640_000, last: 2_120_000, pct: 29.27, val: 381600, day: -2.13, divYtd: 0, weight: 7.3 },
  ];

  return (
    <NSDesktopShell active="holdings" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Portfolio</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Holdings</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="ns-seg">
              <button aria-selected>All</button>
              <button>Taiwan</button>
              <button>US</button>
              <button>Crypto</button>
            </div>
            <button className="ns-btn"><NSIcon name="upload" size={14}/>Import CSV</button>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>Buy / Sell</button>
          </div>
        </div>

        {/* Top KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            ['Market value', 'NT$5,210K', '+1.82%', true],
            ['Cost basis (FIFO)', 'NT$3,624K', '−', null],
            ['Unrealized P/L', '+NT$1,586K', '+43.78%', true],
            ['Realized YTD', '+NT$184K', '12 closed lots', true],
            ['Dividends YTD', 'NT$38,540', '+ NT$3,500 today', true],
          ].map((r) => (
            <div className="ns-card" key={r[0]} style={{ padding: 18 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{r[0]}</div>
              <div className="ns-num-md">{r[1]}</div>
              <div className={'mono ' + (r[3] === true ? 'pos' : 'muted')} style={{ fontSize: 11.5, marginTop: 4 }}>{r[2]}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--ns-border)' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>14 lots · 7 symbols</h3>
            <div style={{ flex: 1 }}/>
            <div style={{ position: 'relative' }}>
              <input className="ns-input" placeholder="Search ticker…" style={{ paddingLeft: 30, width: 220, fontSize: 12.5 }} />
              <span style={{ position: 'absolute', left: 10, top: 10 }}><NSIcon name="search" size={13}/></span>
            </div>
            <button className="ns-btn ghost"><NSIcon name="filter" size={14}/></button>
            <button className="ns-btn ghost"><NSIcon name="dots" size={16}/></button>
          </div>

          {/* table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2.2fr 0.8fr 1fr 1fr 1fr 1.1fr 0.9fr 60px',
            padding: '10px 22px', borderBottom: '1px solid var(--ns-border)',
            fontSize: 11, letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--ns-fg-dim)',
            fontFamily: 'var(--ns-font-mono)',
          }}>
            <span>Symbol</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Avg cost</span>
            <span style={{ textAlign: 'right' }}>Last</span><span style={{ textAlign: 'right' }}>Day</span>
            <span style={{ textAlign: 'right' }}>Market value</span><span style={{ textAlign: 'right' }}>P/L</span>
            <span/>
          </div>

          {holdings.map((h) => {
            const pos = h.pct >= 0;
            return (
              <div key={h.sym} style={{
                display: 'grid', gridTemplateColumns: '2.2fr 0.8fr 1fr 1fr 1fr 1.1fr 0.9fr 60px',
                alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid var(--ns-border)',
                cursor: 'pointer',
              }} onClick={() => onNavigate && onNavigate('holding-detail')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <NSMark label={h.sym.slice(0,4)} color={h.sym.includes('TW') ? 'var(--ns-chart-1)' : h.sym === 'BTC' ? 'var(--ns-chart-3)' : 'var(--ns-chart-2)'} mono size={32}/>
                  <div>
                    <div className="mono" style={{ fontSize: 13.5, fontWeight: 500 }}>{h.sym}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{h.name} · weight {h.weight}%</div>
                  </div>
                </div>
                <span className="num" style={{ textAlign: 'right', fontSize: 13 }}>{h.qty < 1 ? h.qty.toFixed(4) : h.qty.toLocaleString()}</span>
                <span className="num muted" style={{ textAlign: 'right', fontSize: 13 }}>{h.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="num" style={{ textAlign: 'right', fontSize: 13 }}>{h.last.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className={'num ' + (h.day >= 0 ? 'pos' : 'neg')} style={{ textAlign: 'right', fontSize: 13 }}>
                  {h.day >= 0 ? '+' : ''}{h.day.toFixed(2)}%
                </span>
                <span className="num" style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>NT${(h.val).toLocaleString()}</span>
                <div style={{ textAlign: 'right' }}>
                  <div className={'num ' + (pos ? 'pos' : 'neg')} style={{ fontSize: 13, fontWeight: 500 }}>
                    {pos ? '+' : ''}{h.pct.toFixed(2)}%
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <NSSparkline data={nsSeries(20, 100, 0.012, pos ? 0.003 : -0.002)} pos={pos} w={70} h={18} />
                  </div>
                </div>
                <span className="dim" style={{ textAlign: 'right' }}><NSIcon name="chevRight" size={14}/></span>
              </div>
            );
          })}
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── 3. Cash Flow ───────
function NSDesktopCashFlow({ onNavigate } = {}) {
  const days = Array.from({ length: 30 }, (_, i) => ({
    v: ((Math.sin(i * 0.9) * 1500) + (Math.cos(i * 0.4) * 2000) + ((i % 5 === 0) ? 4500 : -2200)),
  }));

  const txns = [
    { day: '今天 · 5/27', items: [
      { mark: 'FD', color: 'var(--ns-chart-3)', name: '全家便利商店', sub: '14:32 · 信用卡 · 食物', amt: -85 },
      { mark: 'UB', color: 'var(--ns-chart-4)', name: 'Uber', sub: '09:10 · 信用卡 · 交通', amt: -250 },
      { mark: 'TS', color: 'var(--ns-chart-1)', name: '台積電配息', sub: '證券戶 · 配息', amt: +3500, mono: true },
    ]},
    { day: '昨天 · 5/26', items: [
      { mark: 'SP', color: 'var(--ns-chart-2)', name: 'Spotify', sub: '訂閱 · 信用卡', amt: -149 },
      { mark: 'IK', color: 'var(--ns-chart-5)', name: 'IKEA', sub: '家用 · 信用卡', amt: -2480 },
      { mark: '↔', color: 'var(--ns-fg-dim)', name: 'Transfer · NTD → USD', sub: '美金活存 · @31.62', amt: 0, transfer: true },
    ]},
    { day: '5/25 (週六)', items: [
      { mark: '$',  color: 'var(--ns-chart-1)', name: '薪資', sub: '玉山銀行 · 收入', amt: +72000 },
      { mark: 'CB', color: 'var(--ns-chart-4)', name: 'Costco', sub: '雜貨 · 信用卡', amt: -3850 },
    ]},
  ];

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>May 2026</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Cash Flow</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn" onClick={() => onNavigate && onNavigate('cat-mgmt')}><NSIcon name="tag" size={14}/>分類</button>
            <button className="ns-btn"><NSIcon name="calendar" size={14}/>5 月</button>
            <button className="ns-btn"><NSIcon name="filter" size={14}/>All accounts · All cats</button>
            <button className="ns-btn primary" onClick={() => onNavigate && onNavigate('cf-new')}><NSIcon name="plus" size={14} strokeWidth={2}/>記一筆</button>
          </div>
        </div>

        {/* Top summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
          <div className="ns-card">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Net this month</div>
                <div className="ns-num-lg pos">+NT$48,210</div>
              </div>
              <div style={{ flex: 1 }}/>
              <div style={{ display: 'flex', gap: 18, fontSize: 12 }}>
                <div>
                  <div className="muted">Income</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT$72,310</div>
                </div>
                <div>
                  <div className="muted">Spending</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>NT$24,100</div>
                </div>
                <div>
                  <div className="muted">Savings rate</div>
                  <div className="num pos" style={{ fontSize: 18, fontWeight: 500 }}>66.7%</div>
                </div>
              </div>
            </div>
            <NSBars data={days} w={1000} h={120} />
            <div className="dim mono" style={{ fontSize: 10.5, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>5/1</span><span>5/8</span><span>5/15</span><span>5/22</span><span>5/30</span>
            </div>
          </div>

          <div className="ns-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="ns-eyebrow">By category · May</div>
              <a className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Breakdown →</a>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                ['食物', 8240, 0.34, 'var(--ns-chart-3)'],
                ['交通', 4520, 0.19, 'var(--ns-chart-4)'],
                ['娛樂', 3110, 0.13, 'var(--ns-chart-5)'],
                ['訂閱', 2280, 0.10, 'var(--ns-chart-2)'],
                ['其他', 5950, 0.25, 'var(--ns-fg-dim)'],
              ].map((r) => (
                <div key={r[0]} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                  <span>{r[0]}</span>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                    <div style={{ width: (r[2] * 100) + '%', height: '100%', background: r[3], borderRadius: 99 }}/>
                  </div>
                  <span className="num" style={{ textAlign: 'right' }}>NT${r[1].toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transactions grouped by day */}
        <div className="ns-card" style={{ padding: 0 }}>
          {txns.map((g, gi) => (
            <div key={g.day}>
              <div style={{
                padding: '14px 22px', borderBottom: '1px solid var(--ns-border)',
                borderTop: gi === 0 ? 'none' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--ns-bg-elev)',
              }}>
                <span className="ns-eyebrow">{g.day}</span>
                <span className="dim mono" style={{ fontSize: 11 }}>
                  Net <span className={g.items.reduce((s, i) => s + i.amt, 0) >= 0 ? 'pos' : 'neg'}>
                    {(g.items.reduce((s, i) => s + i.amt, 0) >= 0 ? '+' : '−')}NT${Math.abs(g.items.reduce((s, i) => s + i.amt, 0)).toLocaleString()}
                  </span>
                </span>
              </div>
              {g.items.map((r, i) => (
                <div key={i} className="ns-row" style={{ gap: 12, cursor: 'pointer' }}
                     onClick={() => onNavigate && onNavigate('cf-detail')}>
                  <NSMark label={r.mark} color={r.color} size={32} mono={r.mono}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.sub}</div>
                  </div>
                  {r.transfer ? (
                    <span className="ns-pill"><NSIcon name="transfer" size={11}/>Transfer · 1,500 USD</span>
                  ) : (
                    <div className={'num ' + (r.amt >= 0 ? 'pos' : '')} style={{ fontSize: 14.5, minWidth: 100, textAlign: 'right' }}>
                      {r.amt >= 0 ? '+' : '−'}NT${Math.abs(r.amt).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── 4. Accounts ───────
function NSDesktopAccounts({ onNavigate } = {}) {
  const groups = [
    {
      name: 'Cash & deposits', total: 'NT$2,840,120', accounts: [
        { mark: '玉', color: 'var(--ns-chart-1)', name: '玉山活儲', ccy: 'NTD', native: 'NT$1,840,200', base: 'NT$1,840,200', last: '2m ago' },
        { mark: 'BK', color: 'var(--ns-chart-2)', name: 'BoA 美元活存', ccy: 'USD',  native: '$24,500.00', base: 'NT$774,690', last: '5m ago', fx: '31.62' },
        { mark: 'JP', color: 'var(--ns-chart-3)', name: 'SMBC 円預金', ccy: 'JPY',  native: '¥895,000', base: 'NT$182,580',   last: '1h ago', fx: '0.204' },
        { mark: '$',  color: 'var(--ns-chart-4)', name: '現金',     ccy: 'NTD',  native: 'NT$42,650', base: 'NT$42,650', last: '昨天' },
      ],
    },
    {
      name: 'Investment', total: 'NT$5,210,140', accounts: [
        { mark: '富', color: 'var(--ns-chart-1)', name: '富邦證券',  ccy: 'NTD', native: 'NT$3,182,400', base: 'NT$3,182,400', last: '2m ago', sub: '12 holdings · TPE' },
        { mark: 'IB', color: 'var(--ns-chart-2)', name: 'Interactive Brokers', ccy: 'USD', native: '$58,140.20', base: 'NT$1,838,400', last: '4m ago', sub: '7 holdings · NYSE/NASDAQ', fx: '31.62' },
        { mark: 'BT', color: 'var(--ns-chart-3)', name: 'BitoPro · 加密',     ccy: 'TWD', native: 'NT$381,600',  base: 'NT$381,600',   last: '12m ago', sub: '0.18 BTC · 4.2 ETH' },
      ],
    },
    {
      name: 'Credit · liabilities', total: '−NT$48,210', accounts: [
        { mark: 'V', color: 'var(--ns-neg)', name: 'Cathay World Card', ccy: 'NTD', native: '−NT$48,210', base: '−NT$48,210', last: '3h ago', sub: '本期應繳 · 6/15 截止' },
      ],
    },
  ];

  return (
    <NSDesktopShell active="accounts" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>9 accounts · NTD base</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Accounts</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="refresh" size={14}/>Refresh FX</button>
            <button className="ns-btn"><NSIcon name="transfer" size={14}/>Transfer</button>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新增帳戶</button>
          </div>
        </div>

        {/* Currency breakdown card */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            ['NTD', 'NT$5,065K', 60.0, 'var(--ns-chart-1)'],
            ['USD', 'NT$2,613K · $82.6K', 30.9, 'var(--ns-chart-2)'],
            ['JPY', 'NT$183K · ¥895K', 2.2, 'var(--ns-chart-3)'],
            ['BTC + ETH', 'NT$591K', 7.0, 'var(--ns-chart-5)'],
          ].map((r) => (
            <div className="ns-card" key={r[0]} style={{ padding: 16 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{r[0]}</div>
              <div style={{ fontSize: 19, fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums' }}>{r[1]}</div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--ns-bg-hover)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: r[2] + '%', height: '100%', background: r[3] }}/>
              </div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>{r[2]}% of total</div>
            </div>
          ))}
        </div>

        {/* Account groups */}
        <div style={{ display: 'grid', gap: 16 }}>
          {groups.map((g) => (
            <div key={g.name} className="ns-card" style={{ padding: 0 }}>
              <div style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ns-border)' }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 15, fontWeight: 500 }}>{g.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="dim mono" style={{ fontSize: 11 }}>{g.accounts.length} accounts</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{g.total}</span>
                </div>
              </div>
              {g.accounts.map((a, i) => (
                <div key={i} className="ns-row" style={{ gap: 14 }}>
                  <NSMark label={a.mark} color={a.color} size={36} mono={false}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 500 }}>{a.name}</span>
                      <span className="ns-pill" style={{ fontSize: 10.5, padding: '2px 7px' }}>{a.ccy}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {a.sub || (a.fx ? `FX ${a.ccy}/NTD ${a.fx} · synced ${a.last}` : `synced ${a.last}`)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 15, fontWeight: 500 }}>{a.base}</div>
                    {a.ccy !== 'NTD' && <div className="muted mono" style={{ fontSize: 11.5 }}>{a.native}</div>}
                  </div>
                  <NSIcon name="chevRight" size={14}/>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </NSDesktopShell>
  );
}

Object.assign(window, {
  NSDesktopShell, NSDesktopDashboard, NSDesktopHoldings, NSDesktopCashFlow, NSDesktopAccounts, NSQuickAddBar,
});
