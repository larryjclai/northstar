// northstar-analytics.jsx — Holdings → Analytics tab

// ─── Stacked Area Chart (Allocation Drift) ───────────────────────────────────
function NSAnalyticsStackedArea({ data, labels, colors, seriesLabels, w = 660, h = 178 }) {
  const [hoverT, setHoverT] = React.useState(null);
  const svgRef = React.useRef(null);
  const n = data.length, m = data[0].length;
  const pL = 40, pR = 12, pT = 10, pB = 28;
  const xOf = t => pL + (t / (n - 1)) * (w - pL - pR);
  const yOf = pct => pT + (1 - pct / 100) * (h - pT - pB);

  // Cumulative stacks cum[t][s] = sum of series 0..s at time t
  const cum = data.map(row => {
    let acc = 0;
    return row.map(v => (acc += v, acc));
  });

  // Build closed polygon path for each series band
  const bands = Array.from({ length: m }, (_, s) => {
    const topEdge = cum.map((c, t) =>
      `${t === 0 ? 'M' : 'L'}${xOf(t).toFixed(1)},${yOf(c[s]).toFixed(1)}`
    );
    const botEdge = [...cum].reverse().map((c, ri) => {
      const t = n - 1 - ri;
      return `L${xOf(t).toFixed(1)},${yOf(s > 0 ? c[s - 1] : 0).toFixed(1)}`;
    });
    return topEdge.join(' ') + ' ' + botEdge.join(' ') + ' Z';
  });

  const onMove = e => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (w / rect.width);
    const t = Math.round(Math.max(0, Math.min(n - 1, ((px - pL) / (w - pL - pR)) * (n - 1))));
    setHoverT(t);
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%"
      style={{ display: 'block', cursor: 'crosshair' }}
      onMouseMove={onMove} onMouseLeave={() => setHoverT(null)}>

      {/* Grid */}
      {[0, 25, 50, 75, 100].map(pct => (
        <g key={pct}>
          <line x1={pL} y1={yOf(pct)} x2={w - pR} y2={yOf(pct)}
            stroke="var(--ns-border)"
            strokeWidth={pct === 0 || pct === 100 ? 0.8 : 0.4}
            strokeDasharray={pct > 0 && pct < 100 ? '2 4' : 'none'} />
          <text x={pL - 6} y={yOf(pct) + 4} fontSize="10" fill="var(--ns-fg-dim)"
            textAnchor="end" fontFamily="var(--ns-font-mono)">{pct}%</text>
        </g>
      ))}

      {/* Stacked bands */}
      {bands.map((d, s) => (
        <path key={s} d={d} fill={colors[s]} fillOpacity="0.84" />
      ))}

      {/* X-axis labels */}
      {labels.map((l, i) => (
        i % 2 === 0 ? (
          <text key={i} x={xOf(i)} y={h - 6} fontSize="10" fill="var(--ns-fg-dim)"
            textAnchor="middle" fontFamily="var(--ns-font-mono)">{l}</text>
        ) : null
      ))}

      {/* Hover crosshair + tooltip */}
      {hoverT != null && (() => {
        const tx = xOf(hoverT);
        const bW = 92, bH = m * 15 + 18;
        const bX = tx + 10 + bW > w ? tx - bW - 10 : tx + 10;
        return (
          <>
            <line x1={tx} y1={pT} x2={tx} y2={h - pB}
              stroke="var(--ns-fg)" strokeWidth="1" strokeOpacity="0.3" />
            <g transform={`translate(${bX}, ${pT + 4})`}>
              <rect width={bW} height={bH} rx="5"
                fill="var(--ns-bg-card)" stroke="var(--ns-border)" />
              <text x="8" y="13" fontSize="10" fill="var(--ns-fg-dim)"
                fontFamily="var(--ns-font-mono)">{labels[hoverT]}</text>
              {seriesLabels.map((l, s) => (
                <g key={s} transform={`translate(8, ${s * 15 + 23})`}>
                  <rect width="6" height="6" rx="1" y="-5" fill={colors[s]} />
                  <text x="10" fontSize="10" fill="var(--ns-fg)"
                    fontFamily="var(--ns-font-mono)">{seriesLabels[s]}</text>
                  <text x={bW - 10} fontSize="10" fill="var(--ns-fg)"
                    textAnchor="end" fontFamily="var(--ns-font-mono)"
                    fontWeight="500">{data[hoverT][s]}%</text>
                </g>
              ))}
            </g>
          </>
        );
      })()}
    </svg>
  );
}

// ─── Rolling Volatility Chart ─────────────────────────────────────────────────
function NSAnalyticsVolatChart({ w = 370, h = 128 }) {
  const [hover, setHover] = React.useState(null);
  const ref = React.useRef(null);
  const N = 260;
  const THRESHOLD = 20;

  // Deterministic series — spike at day ~158 (Aug crash)
  const volPts = React.useMemo(() =>
    Array.from({ length: N }, (_, i) => {
      const base  = 12 + Math.sin(i * 0.042) * 2.1;
      const spike = 16 * Math.exp(-Math.pow((i - 158) / 9, 2));
      const noise = Math.sin(i * 47.3) * 0.55 + Math.cos(i * 23.1) * 0.4;
      return Math.max(7, base + spike + noise);
    }), []);

  const pL = 36, pR = 10, pT = 10, pB = 26;
  const minV = 6, maxV = 31;
  const xOf = i  => pL + (i / (N - 1)) * (w - pL - pR);
  const yOf = v  => pT + (1 - (v - minV) / (maxV - minV)) * (h - pT - pB);

  const linePts  = volPts.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const areaPath = linePts +
    ` L${xOf(N - 1).toFixed(1)},${yOf(minV).toFixed(1)}` +
    ` L${xOf(0).toFixed(1)},${yOf(minV).toFixed(1)} Z`;

  const onMove = e => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px   = (e.clientX - rect.left) * (w / rect.width);
    setHover(Math.round(Math.max(0, Math.min(N - 1, ((px - pL) / (w - pL - pR)) * (N - 1)))));
  };

  return (
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} width="100%"
      style={{ display: 'block', cursor: 'crosshair' }}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}>

      <defs>
        <clipPath id="nsVolHiClip">
          <rect x={pL} y={pT} width={w - pL - pR} height={Math.max(0, yOf(THRESHOLD) - pT)} />
        </clipPath>
        <linearGradient id="nsVolGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--ns-chart-2)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--ns-chart-2)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[10, 15, 20, 25].map(v => (
        <g key={v}>
          <line x1={pL} y1={yOf(v)} x2={w - pR} y2={yOf(v)}
            stroke={v === THRESHOLD ? 'var(--ns-neg)' : 'var(--ns-border)'}
            strokeWidth={v === THRESHOLD ? 0.9 : 0.4}
            strokeDasharray="2 4"
            strokeOpacity={v === THRESHOLD ? 0.65 : 1} />
          <text x={pL - 5} y={yOf(v) + 4} fontSize="10"
            fill={v === THRESHOLD ? 'var(--ns-neg)' : 'var(--ns-fg-dim)'}
            textAnchor="end" fontFamily="var(--ns-font-mono)"
            fillOpacity={v === THRESHOLD ? 0.85 : 1}>{v}%</text>
        </g>
      ))}

      {/* Normal area + line */}
      <path d={areaPath} fill="url(#nsVolGrad)" />
      <path d={linePts}  stroke="var(--ns-chart-2)" strokeWidth="1.5" fill="none" />

      {/* High-vol region (above threshold) — clipped */}
      <path d={areaPath} fill="var(--ns-neg)" fillOpacity="0.18" clipPath="url(#nsVolHiClip)" />
      <path d={linePts}  stroke="var(--ns-neg)" strokeWidth="1.6" fill="none" clipPath="url(#nsVolHiClip)" />

      {/* X-axis month labels */}
      {['6月','8月','10月','12月','2月','4月'].map((l, i) => (
        <text key={l} x={xOf(i * (N / 6))} y={h - 6} fontSize="10" fill="var(--ns-fg-dim)"
          textAnchor="middle" fontFamily="var(--ns-font-mono)">{l}</text>
      ))}

      {/* Hover indicator */}
      {hover != null && (() => {
        const v    = volPts[hover];
        const isHi = v > THRESHOLD;
        const cx   = xOf(hover);
        const cy   = yOf(v);
        const tX   = cx + 8 + 72 > w ? cx - 80 : cx + 8;
        return (
          <>
            <line x1={cx} y1={pT} x2={cx} y2={h - pB}
              stroke="var(--ns-fg)" strokeWidth="1" strokeOpacity="0.2" />
            <circle cx={cx} cy={cy} r="4"
              fill={isHi ? 'var(--ns-neg)' : 'var(--ns-chart-2)'} />
            <g transform={`translate(${tX}, ${Math.max(cy - 22, pT)})`}>
              <rect width="70" height="22" rx="4" fill="var(--ns-bg-card)" stroke="var(--ns-border)" />
              <text x="8" y="15" fontSize="11" fill="var(--ns-fg)"
                fontFamily="var(--ns-font-mono)">{v.toFixed(1)}%</text>
            </g>
          </>
        );
      })()}
    </svg>
  );
}

// ─── Holdings Analytics Tab ───────────────────────────────────────────────────
function NSDesktopHoldingsAnalytics({ onNavigate } = {}) {
  const [perfPeriod, setPerfPeriod] = React.useState('1Y');

  // Period-aware KPI values — each period has its own risk metrics
  const kpiValues = {
    '3M':  { vol: '11.8%', sortino: '2.14', sharpe: '1.68', dd: '−5.2%',  ddSub: '2026-03-20 → 03-28 · 已恢復', volSub: 'vs benchmark 10.4%' },
    '6M':  { vol: '13.1%', sortino: '1.95', sharpe: '1.54', dd: '−8.4%',  ddSub: '2025-12-02 → 12-08 · 已恢復', volSub: 'vs benchmark 11.6%' },
    'YTD': { vol: '12.6%', sortino: '1.88', sharpe: '1.48', dd: '−10.1%', ddSub: '2026-01-15 → 01-22 · 已恢復', volSub: 'vs benchmark 11.8%' },
    '1Y':  { vol: '14.2%', sortino: '1.84', sharpe: '1.42', dd: '−18.4%', ddSub: '2025-08-05 → 08-12 · 已恢復', volSub: 'vs benchmark 12.8%' },
    'ALL': { vol: '15.6%', sortino: '1.62', sharpe: '1.28', dd: '−24.8%', ddSub: '2025-06-10 → 06-20 · 未恢復', volSub: 'vs benchmark 13.2%' },
  };
  const kv = kpiValues[perfPeriod] || kpiValues['1Y'];

  // Portfolio vs benchmark — full 260-day raw series
  const rawPort  = React.useMemo(() => nsSeries(260, 100, 0.022, 0.0035), []);
  const rawBench = React.useMemo(() => nsSeries(260, 100, 0.014, 0.0018), []);
  const allLabels260 = React.useMemo(() => Array.from({ length: 260 }, (_, i) => {
    const d = new Date(2025, 0, 1); d.setDate(d.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }), []);

  // Slice to selected period and compute period-relative cumulative returns
  const periodN    = { '3M': 90, '6M': 180, 'YTD': 148, '1Y': 260, 'ALL': 260 }[perfPeriod] || 260;
  const startIdx   = Math.max(0, rawPort.length - periodN);
  const portSlice  = rawPort.slice(startIdx);
  const benchSlice = rawBench.slice(startIdx);
  const portRet    = portSlice.map(v  => ((v / portSlice[0])  - 1) * 100);
  const benchRet   = benchSlice.map(v => ((v / benchSlice[0]) - 1) * 100);
  const perfLabels = allLabels260.slice(startIdx);
  const portFinal  = portRet[portRet.length - 1];
  const benchFinal = benchRet[benchRet.length - 1];
  const alpha      = portFinal - benchFinal;

  // Today's top movers — sorted best → worst
  const movers = [
    { sym: '2330.TW', name: '台積電',          day: +1.82, color: 'var(--ns-chart-1)' },
    { sym: 'AAPL',    name: 'Apple',           day: +0.91, color: 'var(--ns-chart-5)' },
    { sym: '0050.TW', name: '元大台灣50',        day: +0.42, color: 'var(--ns-chart-2)' },
    { sym: 'VWRA',    name: 'FTSE All-World',  day: +0.31, color: 'var(--ns-chart-3)' },
    { sym: 'VTI',     name: 'Vanguard Total',  day: -0.18, color: 'var(--ns-chart-3)' },
    { sym: '2454.TW', name: '聯發科',           day: -1.25, color: 'var(--ns-chart-4)' },
    { sym: 'BTC',     name: 'Bitcoin',         day: -2.13, color: 'var(--ns-chart-5)' },
  ];
  const maxAbs = Math.max(...movers.map(m => Math.abs(m.day)));

  // Allocation drift — 12 months
  const allMonths = ['6月','7月','8月','9月','10月','11月','12月','1月','2月','3月','4月','5月'];
  const allData   = [
    [40,20,25,10,5],[41,21,24,10,4],[38,22,25,11,4],[36,21,26,12,5],
    [35,22,27,11,5],[37,23,25,10,5],[39,24,22, 9,6],[38,24,23, 9,6],
    [39,23,22,10,6],[40,24,21, 9,6],[38,24,22,10,6],[38,24,22,10,6],
  ];
  const allColors  = ['var(--ns-chart-1)','var(--ns-chart-2)','var(--ns-chart-3)','var(--ns-chart-4)','var(--ns-chart-5)'];
  const allLabels  = ['TW Equity','US Equity','Cash','Bonds','Crypto'];

  // KPI spark data
  const volSpark    = Array.from({ length: 20 }, (_, i) => 12 + Math.sin(i * 0.8) * 2   + Math.sin(i * 2.1) * 0.5);
  const sortinoSpark= Array.from({ length: 20 }, (_, i) => 1.5 + Math.sin(i * 0.4) * 0.3);
  const sharpeSpark = Array.from({ length: 20 }, (_, i) => 1.2 + Math.sin(i * 0.5) * 0.2);
  const ddSpark     = Array.from({ length: 20 }, (_, i) => -(5  + Math.abs(Math.sin(i * 0.6)) * 10));

  const kpis = [
    { label: 'Annual Volatility', note: '年化波動率', value: kv.vol,     sub: kv.volSub,                           color: 'var(--ns-chart-2)', spark: volSpark,     posUp: true  },
    { label: 'Sortino Ratio',     note: '越高越好',   value: kv.sortino, sub: 'Benchmark 1.21 · downside σ 5.4%', color: 'var(--ns-pos)',     spark: sortinoSpark, posUp: true  },
    { label: 'Sharpe Ratio',      note: '越高越好',   value: kv.sharpe,  sub: `Risk-free 2.5% · σ ${kv.vol}`,     color: 'var(--ns-chart-1)', spark: sharpeSpark,  posUp: true  },
    { label: 'Max Drawdown',      note: '最大回撤',   value: kv.dd,      sub: kv.ddSub,                            color: 'var(--ns-neg)',     spark: ddSpark,      posUp: false },
  ];

  return (
    <NSDesktopShell active="holdings" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Portfolio</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0,
              letterSpacing: -0.02, fontWeight: 600 }}>Holdings</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="download" size={14} />Export</button>
            <button className="ns-btn primary" onClick={() => onNavigate && onNavigate('inv-add')}>
              <NSIcon name="plus" size={14} strokeWidth={2} />Buy / Sell
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--ns-border)', marginTop: 20, marginBottom: 24 }}>
          {[
            { id: 'portfolio', label: 'Portfolio',    active: false, nav: 'holdings' },
            { id: 'txns',      label: 'Transactions', active: false, nav: 'holdings-txns' },
            { id: 'analytics', label: 'Analytics',    active: true,  nav: null },
          ].map(tab => (
            <button key={tab.id}
              onClick={() => tab.nav && onNavigate && onNavigate(tab.nav)}
              style={{
                padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 14,
                fontWeight: tab.active ? 600 : 400,
                color:  tab.active ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
                borderBottom: tab.active ? '2px solid var(--ns-accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.12s',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── KPI strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
          {kpis.map(k => (
            <div key={k.label} className="ns-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start',
                justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="ns-eyebrow" style={{ fontSize: 10 }}>{k.label}</div>
                <span className="mono dim" style={{ fontSize: 10 }}>{k.note}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end',
                justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div className="num" style={{
                  fontSize: 26, fontWeight: 600,
                  fontFamily: 'var(--ns-font-mono)',
                  color: k.color,
                  fontVariantNumeric: 'tabular-nums lining-nums',
                  letterSpacing: -0.01,
                }}>{k.value}</div>
                <NSSparkline data={k.spark} pos={k.posUp} color={k.color} w={58} h={26} />
              </div>
              <div className="muted" style={{ fontSize: 11, lineHeight: 1.45 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2: Portfolio vs Benchmark | Top Movers ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* Portfolio vs Benchmark */}
          <div className="ns-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Performance</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>
                  Portfolio vs Benchmark
                </h3>
              </div>
              <div className="ns-seg" style={{ fontSize: 11 }}>
                {['3M','6M','YTD','1Y','ALL'].map(v => (
                  <button key={v} aria-selected={v === perfPeriod}
                    onClick={() => setPerfPeriod(v)}>{v}</button>
                ))}
              </div>
            </div>

            {/* Summary strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              borderRadius: 'var(--ns-r-md)',
              border: '1px solid var(--ns-border)',
              overflow: 'hidden', marginBottom: 14,
            }}>
              {[
                { label: 'Portfolio',         val: `${portFinal  >= 0 ? '+' : ''}${portFinal.toFixed(1)}%`,  color: portFinal >= 0 ? 'var(--ns-pos)' : 'var(--ns-neg)' },
                { label: '0050.TW Benchmark', val: `${benchFinal >= 0 ? '+' : ''}${benchFinal.toFixed(1)}%`, color: 'var(--ns-fg-muted)' },
                { label: 'Alpha',             val: `${alpha      >= 0 ? '+' : ''}${alpha.toFixed(1)}%`,      color: alpha >= 0 ? 'var(--ns-accent)' : 'var(--ns-neg)' },
              ].map((s, i) => (
                <div key={s.label} style={{
                  padding: '12px 16px',
                  borderLeft: i ? '1px solid var(--ns-border)' : 'none',
                  background: 'var(--ns-bg-hover)',
                }}>
                  <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>{s.label}</div>
                  <div className="num" style={{
                    fontSize: 22, fontWeight: 600,
                    fontFamily: 'var(--ns-font-mono)',
                    color: s.color,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ height: 190 }}>
              <NSAreaChart
                data={portRet} secondary={benchRet}
                w={700} h={190} xLabels={perfLabels}
                yFormat={v => v.toFixed(1) + '%'}
              />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 2, background: 'var(--ns-accent)' }} />
                <span className="muted">Portfolio (cumulative return)</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 2, borderTop: '1px dashed var(--ns-fg-dim)',
                  background: 'transparent', width: 14 }} />
                <span className="muted">0050.TW Benchmark</span>
              </span>
            </div>
          </div>

          {/* Today's Top Movers */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{
              padding: '16px 20px 12px',
              borderBottom: '1px solid var(--ns-border)',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Today · 5/27</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)',
                  fontSize: 16, fontWeight: 500 }}>Top Movers</h3>
              </div>
              <span className="mono dim" style={{ fontSize: 11 }}>更新 14:32</span>
            </div>

            {movers.map((m, i) => {
              const isPos  = m.day >= 0;
              const barPct = (Math.abs(m.day) / maxAbs) * 100;
              return (
                <div key={m.sym}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '18px 1fr 58px',
                    alignItems: 'center', gap: 10,
                    padding: '11px 20px',
                    borderTop: i ? '1px solid var(--ns-border)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => onNavigate && onNavigate('holding-detail')}>

                  {/* Rank */}
                  <span className="mono dim" style={{ fontSize: 11, textAlign: 'right' }}>{i + 1}</span>

                  {/* Label + bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{m.sym}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {m.name.length > 11 ? m.name.slice(0, 11) + '…' : m.name}
                      </span>
                    </div>
                    {/* Diverging bar from left edge */}
                    <div style={{ height: 4, borderRadius: 99,
                      background: 'var(--ns-bg-hover)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{
                        position: 'absolute',
                        left: isPos ? 0 : undefined,
                        right: isPos ? undefined : 0,
                        width: barPct + '%',
                        height: '100%',
                        borderRadius: 99,
                        background: isPos ? 'var(--ns-pos)' : 'var(--ns-neg)',
                        transition: 'width 0.4s var(--ns-ease)',
                      }} />
                    </div>
                  </div>

                  {/* Percentage */}
                  <span className={'num ' + (isPos ? 'pos' : 'neg')} style={{
                    fontSize: 14, fontWeight: 600, textAlign: 'right',
                    fontFamily: 'var(--ns-font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {isPos ? '+' : ''}{m.day.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Row 3: Allocation Drift | Rolling Volatility ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 16 }}>

          {/* Allocation Drift */}
          <div className="ns-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start',
              justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Allocation</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)',
                  fontSize: 16, fontWeight: 500 }}>Asset drift · 12 months</h3>
              </div>
              <div className="ns-seg" style={{ fontSize: 11 }}>
                <button aria-selected="true">By class</button>
                <button>By region</button>
              </div>
            </div>
            <NSAnalyticsStackedArea
              data={allData} labels={allMonths}
              colors={allColors} seriesLabels={allLabels}
              w={660} h={178}
            />
            <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
              {allLabels.map((l, i) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2,
                    background: allColors[i], flexShrink: 0 }} />
                  <span className="muted">{l}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Rolling 30-day Volatility */}
          <div className="ns-card" style={{ padding: 22 }}>
            <div style={{ marginBottom: 12 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Risk over time</div>
              <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)',
                fontSize: 16, fontWeight: 500 }}>Rolling 30-day Volatility</h3>
            </div>

            <NSAnalyticsVolatChart w={370} h={128} />

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { dot: 'var(--ns-chart-2)', label: '當前',      value: '14.2%', note: '年化' },
                { dot: 'var(--ns-fg-dim)',  label: '90 天平均', value: '12.8%', note: '' },
                { dot: 'var(--ns-neg)',     label: '1Y 峰值',   value: '28.6%', note: '2025-08-05' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99,
                    background: r.dot, flexShrink: 0 }} />
                  <span className="muted" style={{ flex: 1, fontSize: 12.5 }}>{r.label}</span>
                  <span className="num" style={{
                    fontSize: 13, fontFamily: 'var(--ns-font-mono)',
                    color: r.dot, fontVariantNumeric: 'tabular-nums',
                  }}>{r.value}</span>
                  {r.note && (
                    <span className="dim" style={{ fontSize: 10.5 }}>{r.note}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Peak annotation */}
            <div style={{
              marginTop: 14, padding: '10px 12px',
              borderRadius: 'var(--ns-r-md)',
              background: 'var(--ns-neg-soft)',
              border: '1px solid color-mix(in srgb, var(--ns-neg) 35%, transparent)',
            }}>
              <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                <span className="neg" style={{ fontWeight: 600 }}>峰值警示 · </span>
                <span className="muted">8 月市場波動曾超過 20% 閾值，持續 7 天後恢復正常。</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </NSDesktopShell>
  );
}

Object.assign(window, { NSDesktopHoldingsAnalytics });
