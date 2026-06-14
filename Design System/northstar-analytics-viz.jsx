// northstar-analytics-viz.jsx
// New data-viz primitives for the Holdings → Analytics redesign.
// Dark, NorthStar lime-native. Green = gain, red = loss.
// Exports: nsAnHoldings, nsAnSectors, nsAnDividends, nsAnDaily,
//          nsHeat, nsHeatText, NSTreemap, NSAllocBars, NSCalendarHeatmap,
//          NSDividendYears, NSDivergeBars

// ─── Shared mock portfolio ───────────────────────────────────────────────────
// value = market value (TWD thousands), ret = period (1Y) return %
const nsAnHoldings = [
  { sym: '0050.TW',   name: '元大台灣50',  value: 2660, ret: 18.5, cls: 'ETF',   sector: '台股ETF',  ccy: 'TWD' },
  { sym: '2330.TW',   name: '台積電',      value: 2240, ret: 42.0, cls: 'Equity', sector: '半導體',   ccy: 'TWD' },
  { sym: '006208.TW', name: '富邦台50',    value: 1820, ret: 17.2, cls: 'ETF',   sector: '台股ETF',  ccy: 'TWD' },
  { sym: '2454.TW',   name: '聯發科',      value: 980,  ret: 12.4, cls: 'Equity', sector: '半導體',   ccy: 'TWD' },
  { sym: '2449.TW',   name: '京元電子',    value: 760,  ret: 28.6, cls: 'Equity', sector: '半導體',   ccy: 'TWD' },
  { sym: '2308.TW',   name: '台達電',      value: 690,  ret: 9.1,  cls: 'Equity', sector: '電子零組件', ccy: 'TWD' },
  { sym: 'MU',        name: 'Micron',     value: 620,  ret: 33.5, cls: 'Equity', sector: '半導體',   ccy: 'USD' },
  { sym: 'AAPL',      name: 'Apple',      value: 540,  ret: 6.8,  cls: 'Equity', sector: '科技',     ccy: 'USD' },
  { sym: 'VWRA',      name: '全球股票ETF',  value: 520,  ret: 11.0, cls: 'ETF',   sector: '全球ETF',  ccy: 'USD' },
  { sym: 'CEG',       name: 'Constellation', value: 410, ret: 52.3, cls: 'Equity', sector: '能源',   ccy: 'USD' },
  { sym: '2481.TW',   name: '強茂',        value: 360,  ret: -6.2, cls: 'Equity', sector: '半導體',   ccy: 'TWD' },
  { sym: 'BTC',       name: 'Bitcoin',    value: 58,   ret: -14.5, cls: 'Crypto', sector: '加密貨幣', ccy: 'USD' },
  { sym: '其他 80 檔', name: '分散持倉',     value: 2885, ret: 14.0, cls: 'Mixed',  sector: '其他',     ccy: 'TWD' },
];

// Sector roll-up (for the vertical stacked allocation bars)
const nsAnSectors = [
  { label: '半導體',     pct: 34.1, color: 'var(--ns-chart-1)' },
  { label: '台股 ETF',   pct: 30.8, color: 'var(--ns-chart-2)' },
  { label: '其他 80 檔', pct: 19.8, color: 'var(--ns-fg-dim)'  },
  { label: '電子零組件', pct: 4.7,  color: 'var(--ns-chart-3)' },
  { label: '科技',       pct: 3.7,  color: 'var(--ns-chart-5)' },
  { label: '全球 ETF',   pct: 3.6,  color: 'var(--ns-chart-4)' },
  { label: '能源',       pct: 2.8,  color: '#e0794f'           },
  { label: '加密貨幣',   pct: 0.5,  color: 'var(--ns-warn)'    },
];

// Multi-year dividends (TWD)
const nsAnDividends = [
  { year: '2021', amt: 312 },
  { year: '2022', amt: 388 },
  { year: '2023', amt: 441 },
  { year: '2024', amt: 503 },
  { year: '2025', amt: 540 },
  { year: 'TTM',  amt: 558, ttm: true },
];

// Deterministic daily returns for the calendar heatmap (≈ 371 days)
function nsAnDaily(n = 371) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const base  = Math.sin(i * 0.27) * 0.8 + Math.cos(i * 0.11) * 0.6;
    const noise = Math.sin(i * 12.9) * 0.7 + Math.cos(i * 7.3) * 0.5;
    // August stress window (~day 60 from start) — cluster of red
    const crash = -3.4 * Math.exp(-Math.pow((i - 60) / 6, 2));
    const rally =  2.6 * Math.exp(-Math.pow((i - 250) / 10, 2));
    let v = base + noise * 0.9 + crash + rally;
    if (i % 7 === 5 || i % 7 === 6) v = null; // weekends blank
    out.push(v == null ? null : +v.toFixed(2));
  }
  return out;
}

// ─── Heat color helpers (diverging green↔red on dark) ───────────────────────
function nsHeat(ret, scale = 9) {
  if (ret == null) return 'var(--ns-bg-elev)';
  const t = Math.max(-1, Math.min(1, ret / scale));
  const mag = Math.abs(t);
  const base = t >= 0 ? 'var(--ns-pos)' : 'var(--ns-neg)';
  const pct = (10 + mag * 78).toFixed(1);
  return `color-mix(in srgb, ${base} ${pct}%, var(--ns-bg-elev))`;
}
function nsHeatText(ret, scale = 9) {
  if (ret == null) return 'var(--ns-fg-dim)';
  return Math.abs(ret) / scale > 0.42 ? '#08160a' : 'var(--ns-fg)';
}

// ─── Squarified treemap layout ────────────────────────────────────────────────
function nsSquarify(data, X, Y, W, H) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const items = data.map(d => ({ ...d, _a: (d.value / total) * (W * H) }));
  const out = [];
  let x = X, y = Y, w = W, h = H;
  const sum = arr => arr.reduce((s, r) => s + r._a, 0);
  const worst = (arr, len) => {
    if (!arr.length) return Infinity;
    const s = sum(arr);
    const mx = Math.max(...arr.map(r => r._a));
    const mn = Math.min(...arr.map(r => r._a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const layoutRow = row => {
    const len = Math.min(w, h);
    const s = sum(row);
    const thick = s / len;
    if (w >= h) {
      let oy = y;
      row.forEach(r => { const hh = r._a / thick; out.push({ ...r, x, y: oy, w: thick, h: hh }); oy += hh; });
      x += thick; w -= thick;
    } else {
      let ox = x;
      row.forEach(r => { const ww = r._a / thick; out.push({ ...r, x: ox, y, w: ww, h: thick }); ox += ww; });
      y += thick; h -= thick;
    }
  };
  const queue = [...items];
  let row = [];
  while (queue.length) {
    const len = Math.min(w, h);
    const next = queue[0];
    if (!row.length || worst([...row, next], len) <= worst(row, len)) {
      row.push(next); queue.shift();
    } else {
      layoutRow(row); row = [];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

// ─── NSTreemap — holdings sized by value, colored by return heat ──────────────
function NSTreemap({ data = nsAnHoldings, w = 660, h = 320, scale = 9, gap = 4, onPick }) {
  const [hover, setHover] = React.useState(null);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const cells = nsSquarify(sorted, 0, 0, w, h);
  const totalVal = sorted.reduce((s, d) => s + d.value, 0);

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${w} / ${h}` }}>
      {cells.map((c, i) => {
        const big = c.w > 92 && c.h > 56;
        const med = c.w > 58 && c.h > 38;
        const isHover = hover === i;
        const txt = nsHeatText(c.ret, scale);
        return (
          <div key={c.sym}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick && onPick(c)}
            style={{
              position: 'absolute',
              left: `${(c.x / w) * 100}%`, top: `${(c.y / h) * 100}%`,
              width: `${(c.w / w) * 100}%`, height: `${(c.h / h) * 100}%`,
              padding: gap / 2,
              boxSizing: 'border-box',
              cursor: onPick ? 'pointer' : 'default',
            }}>
            <div style={{
              width: '100%', height: '100%',
              background: nsHeat(c.ret, scale),
              borderRadius: 'var(--ns-r-sm)',
              boxShadow: isHover ? '0 0 0 1.5px var(--ns-fg)' : 'inset 0 0 0 1px rgba(255,255,255,0.05)',
              padding: med ? '9px 11px' : '4px 6px',
              boxSizing: 'border-box',
              display: 'flex', flexDirection: 'column',
              justifyContent: big ? 'space-between' : 'center',
              overflow: 'hidden',
              transition: 'box-shadow .12s',
            }}>
              {med && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--ns-font-mono)', fontWeight: 600,
                    fontSize: big ? 14 : 11.5, color: txt, letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{c.sym}</span>
                  {big && (
                    <span style={{
                      fontFamily: 'var(--ns-font-mono)', fontSize: 11,
                      color: txt, opacity: 0.85, whiteSpace: 'nowrap',
                    }}>{((c.value / totalVal) * 100).toFixed(1)}%</span>
                  )}
                </div>
              )}
              {big && (
                <div>
                  <div style={{ fontSize: 11, color: txt, opacity: 0.78, marginBottom: 3,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{
                    fontFamily: 'var(--ns-font-mono)', fontWeight: 600,
                    fontSize: c.w > 150 ? 22 : 17, color: txt, letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{c.ret >= 0 ? '+' : '−'}{Math.abs(c.ret).toFixed(1)}%</div>
                </div>
              )}
              {!big && med && (
                <div style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 11, color: txt,
                  fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                  {c.ret >= 0 ? '+' : '−'}{Math.abs(c.ret).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Hover tooltip */}
      {hover != null && (() => {
        const c = cells[hover];
        return (
          <div style={{
            position: 'absolute', left: `${((c.x + c.w / 2) / w) * 100}%`, top: `${(c.y / h) * 100}%`,
            transform: 'translate(-50%, -108%)', pointerEvents: 'none', zIndex: 5,
            background: 'var(--ns-bg-card)', border: '1px solid var(--ns-border-strong)',
            borderRadius: 'var(--ns-r-sm)', padding: '8px 11px', whiteSpace: 'nowrap',
            boxShadow: 'var(--ns-shadow-2)',
          }}>
            <div style={{ fontFamily: 'var(--ns-font-mono)', fontWeight: 600, fontSize: 12.5 }}>{c.sym}
              <span style={{ color: 'var(--ns-fg-muted)', fontWeight: 400, marginLeft: 6 }}>{c.name}</span></div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, fontFamily: 'var(--ns-font-mono)', fontSize: 11.5 }}>
              <span className="muted">市值 <span style={{ color: 'var(--ns-fg)' }}>NT${(c.value * 1000).toLocaleString('en-US')}</span></span>
              <span className="muted">報酬 <span style={{ color: c.ret >= 0 ? 'var(--ns-pos)' : 'var(--ns-neg)' }}>
                {c.ret >= 0 ? '+' : '−'}{Math.abs(c.ret).toFixed(1)}%</span></span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── NSAllocBars — vertical thin-bar stacked allocation (editorial) ──────────
function NSAllocBars({ data = nsAnSectors, h = 92, barW = 3, barGap = 3.5, groupGap = 10, onPick }) {
  const [hover, setHover] = React.useState(null);
  const total = data.reduce((s, d) => s + d.pct, 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: groupGap, height: h }}>
        {data.map((d, i) => (
          <div key={d.label}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick && onPick(d)}
            title={`${d.label} · ${d.pct}%`}
            style={{
              flex: `${d.pct} 0 0`, minWidth: 0, position: 'relative',
              backgroundImage: `repeating-linear-gradient(90deg, ${d.color} 0 ${barW}px, transparent ${barW}px ${barW + barGap}px)`,
              backgroundPosition: 'left center', borderRadius: 1,
              opacity: hover == null || hover === i ? 1 : 0.32,
              transition: 'opacity .15s',
              cursor: onPick ? 'pointer' : 'default',
              maskImage: 'linear-gradient(black,black)',
            }} />
        ))}
      </div>
      {/* Legend list */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column' }}>
        {data.map((d, i) => (
          <div key={d.label}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick && onPick(d)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 4px', borderBottom: '1px solid var(--ns-border)',
              cursor: onPick ? 'pointer' : 'default',
              background: hover === i ? 'var(--ns-bg-hover)' : 'transparent',
              transition: 'background .12s',
            }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14 }}>{d.label}</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {d.pct.toFixed(2)}%</span>
            {onPick && <NSIcon name="chevRight" size={15} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NSCalendarHeatmap — daily returns (GitHub-style) ────────────────────────
function NSCalendarHeatmap({ daily, scale = 2.6, cell = 13, gap = 3, startDate }) {
  const [hover, setHover] = React.useState(null);
  const data = daily || nsAnDaily(371);
  const weeks = Math.ceil(data.length / 7);
  const W = weeks * (cell + gap);
  const H = 7 * (cell + gap);
  const start = startDate || (() => { const d = new Date(2026, 5, 14); d.setDate(d.getDate() - data.length + 1); return d; })();

  const dateOf = i => { const d = new Date(start); d.setDate(d.getDate() + i); return d; };
  // Month labels — mark the week where a new month first appears
  const monthMarks = [];
  let lastMonth = -1;
  for (let wk = 0; wk < weeks; wk++) {
    const d = dateOf(wk * 7);
    if (d.getMonth() !== lastMonth) { monthMarks.push({ wk, m: d.getMonth() + 1 }); lastMonth = d.getMonth(); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {monthMarks.map(mk => (
          <text key={mk.wk} x={mk.wk * (cell + gap)} y={10} fontSize="10.5"
            fill="var(--ns-fg-dim)" fontFamily="var(--ns-font-mono)">{mk.m}月</text>
        ))}
        {data.map((v, i) => {
          const wk = Math.floor(i / 7), wd = i % 7;
          return (
            <rect key={i}
              x={wk * (cell + gap)} y={18 + wd * (cell + gap)}
              width={cell} height={cell} rx="2.5"
              fill={v == null ? 'var(--ns-bg-elev)' : nsHeat(v, scale)}
              stroke={hover === i ? 'var(--ns-fg)' : 'transparent'} strokeWidth="1.2"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ cursor: v == null ? 'default' : 'pointer' }} />
          );
        })}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 11 }}>
        <span className="dim" style={{ fontFamily: 'var(--ns-font-mono)' }}>跌</span>
        {[-2.4, -1.2, 0, 1.2, 2.4].map((v, i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 2.5, background: nsHeat(v, scale) }} />
        ))}
        <span className="dim" style={{ fontFamily: 'var(--ns-font-mono)' }}>漲</span>
      </div>
      {/* Tooltip */}
      {hover != null && data[hover] != null && (() => {
        const d = dateOf(hover);
        const wk = Math.floor(hover / 7);
        const v = data[hover];
        return (
          <div style={{
            position: 'absolute', left: `${(wk / weeks) * 100}%`, top: 0,
            transform: 'translate(-50%, -100%)', pointerEvents: 'none',
            background: 'var(--ns-bg-card)', border: '1px solid var(--ns-border-strong)',
            borderRadius: 'var(--ns-r-sm)', padding: '6px 9px', whiteSpace: 'nowrap',
            boxShadow: 'var(--ns-shadow-2)', fontFamily: 'var(--ns-font-mono)', fontSize: 11.5,
          }}>
            <span className="muted">{d.getMonth() + 1}/{d.getDate()} </span>
            <span style={{ color: v >= 0 ? 'var(--ns-pos)' : 'var(--ns-neg)', fontWeight: 600 }}>
              {v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(2)}%</span>
          </div>
        );
      })()}
    </div>
  );
}

// ─── NSDividendYears — multi-year annual dividend bars ───────────────────────
function NSDividendYears({ data = nsAnDividends, h = 150 }) {
  const max = Math.max(...data.map(d => d.amt));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: h }}>
      {data.map(d => {
        const bh = (d.amt / max) * (h - 30);
        return (
          <div key={d.year} style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: '100%' }}>
            <span className="num" style={{ fontSize: 12.5, fontWeight: 600,
              color: d.ttm ? 'var(--ns-accent)' : 'var(--ns-fg)' }}>{d.amt}</span>
            <div style={{
              width: '100%', maxWidth: 46, height: bh, borderRadius: '5px 5px 0 0',
              background: d.ttm ? 'var(--ns-accent)' : 'var(--ns-chart-3)',
              backgroundImage: d.ttm ? 'repeating-linear-gradient(135deg, rgba(0,0,0,0.16) 0 4px, transparent 4px 8px)' : 'none',
            }} />
            <span className="mono dim" style={{ fontSize: 11 }}>{d.year}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── NSDivergeBars — diverging horizontal contribution bars (restyled) ───────
function NSDivergeBars({ items, fmt, h = 30 }) {
  const maxAbs = Math.max(...items.map(it => Math.abs(it.v)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((it, i) => {
        const pos = it.v >= 0;
        const pct = (Math.abs(it.v) / maxAbs) * 100;
        return (
          <div key={it.label} style={{ display: 'grid', gridTemplateColumns: '116px 1fr 92px',
            alignItems: 'center', gap: 12, height: h }}>
            <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
            <div style={{ position: 'relative', height: 8 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: pct + '%',
                borderRadius: 99, background: pos ? 'var(--ns-pos)' : 'var(--ns-neg)',
                boxShadow: `0 0 14px ${pos ? 'var(--ns-pos-soft)' : 'var(--ns-neg-soft)'}` }} />
            </div>
            <span className={'num ' + (pos ? 'pos' : 'neg')} style={{ fontSize: 12.5, fontWeight: 600,
              textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt ? fmt(it.v) : it.v}</span>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, {
  nsAnHoldings, nsAnSectors, nsAnDividends, nsAnDaily,
  nsHeat, nsHeatText, nsSquarify,
  NSTreemap, NSAllocBars, NSCalendarHeatmap, NSDividendYears, NSDivergeBars,
});
