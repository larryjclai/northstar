// northstar-shared.jsx — shared primitives: icons, chart, mini components

// ─────── Icons (stroke-based, 18px default) ───────
function NSIcon({ name, size = 18, strokeWidth = 1.6 }) {
  const s = size;
  const sw = strokeWidth;
  const paths = {
    home:        <path d="M3 10.5L10 4l7 6.5V17a1 1 0 01-1 1h-3v-5h-6v5H4a1 1 0 01-1-1v-6.5z"/>,
    chart:       <><path d="M3 17h14"/><path d="M5 13l3-4 3 3 4-6"/></>,
    wallet:      <><rect x="3" y="6" width="14" height="11" rx="2"/><path d="M3 9h14"/><circle cx="14" cy="13" r="1"/></>,
    coin:        <><circle cx="10" cy="10" r="7"/><path d="M10 6v8M8 8h3a1.5 1.5 0 010 3H8a1.5 1.5 0 000 3h4"/></>,
    target:      <><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.5"/><circle cx="10" cy="10" r="0.7" fill="currentColor"/></>,
    settings:    <><circle cx="10" cy="10" r="2.5"/><path d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.5 1.5M6 14l-1.5 1.5M15.5 15.5L14 14M6 6L4.5 4.5"/></>,
    plus:        <><path d="M10 4v12M4 10h12"/></>,
    search:      <><circle cx="9" cy="9" r="5.5"/><path d="M17 17l-4-4"/></>,
    filter:      <><path d="M3 5h14M6 10h8M9 15h2"/></>,
    download:    <><path d="M10 3v10M5 9l5 5 5-5M4 17h12"/></>,
    upload:      <><path d="M10 17V7M5 12l5-5 5 5M4 3h12"/></>,
    arrowUp:     <path d="M10 16V4M5 9l5-5 5 5"/>,
    arrowDown:   <path d="M10 4v12M5 11l5 5 5-5"/>,
    arrowLeft:   <path d="M16 10H4M9 5l-5 5 5 5"/>,
    arrowRight:  <path d="M4 10h12M11 5l5 5-5 5"/>,
    chevDown:    <path d="M5 8l5 5 5-5"/>,
    chevLeft:    <path d="M12 5l-5 5 5 5"/>,
    chevRight:   <path d="M8 5l5 5-5 5"/>,
    chevUp:      <path d="M5 13l5-5 5 5"/>,
    refresh:     <><path d="M3 10a7 7 0 0112-4.95M17 4v3.5h-3.5"/><path d="M17 10a7 7 0 01-12 4.95M3 16v-3.5h3.5"/></>,
    eye:         <><path d="M1.5 10S4 4 10 4s8.5 6 8.5 6S16 16 10 16 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/></>,
    dots:        <><circle cx="5" cy="10" r="1.2" fill="currentColor"/><circle cx="10" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/></>,
    bell:        <><path d="M6 8a4 4 0 018 0c0 4 1.5 5.5 1.5 5.5h-11S6 12 6 8z"/><path d="M8.5 16.5a1.5 1.5 0 003 0"/></>,
    star:        <path d="M10 3l2.2 4.5 5 .7-3.6 3.5.85 5L10 14.3 5.55 16.7l.85-5L2.8 8.2l5-.7L10 3z"/>,
    calendar:    <><rect x="3" y="5" width="14" height="13" rx="2"/><path d="M3 9h14M7 3v4M13 3v4"/></>,
    tag:         <><path d="M3 11l7 7 8-8V3h-7l-8 8z"/><circle cx="13" cy="7" r="1.2" fill="currentColor"/></>,
    transfer:    <><path d="M3 7h12l-3-3M17 13H5l3 3"/></>,
    bank:        <><path d="M3 8L10 3l7 5M5 9v6M9 9v6M11 9v6M15 9v6M3 17h14"/></>,
    pie:         <><path d="M10 3v7h7a7 7 0 11-7-7z"/><path d="M12 3a7 7 0 015 5h-5V3z"/></>,
    swap:        <><path d="M3 8h14l-3-3M17 12H3l3 3"/></>,
    sparkle:     <><path d="M10 3v3M10 14v3M3 10h3M14 10h3M5.5 5.5l2 2M12.5 12.5l2 2M14.5 5.5l-2 2M7.5 12.5l-2 2"/></>,
    check:       <path d="M4 10.5L8 14.5l8-8.5"/>,
    lock:        <><rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6a3 3 0 016 0v3"/></>,
    users:       <><circle cx="7" cy="8" r="3"/><circle cx="14" cy="9" r="2.3"/><path d="M2 17c.5-3 2.6-4 5-4s4.5 1 5 4"/><path d="M13 17c.4-2.4 1.6-3 3-3s2.6.6 3 3"/></>,
    backspace:   <><path d="M7 5l-4 5 4 5h10a1 1 0 001-1V6a1 1 0 00-1-1H7z"/><path d="M10 8l4 4M14 8l-4 4"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none"
         stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0 }}>
      {paths[name] || <circle cx="10" cy="10" r="6"/>}
    </svg>
  );
}

// ─────── Sparkline ───────
function NSSparkline({ data, w = 80, h = 24, color, pos = true, fillOpacity = 0.18 }) {
  if (!data || !data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / r) * (h - 2) - 1,
  ]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dArea = d + ` L${w},${h} L0,${h} Z`;
  const c = color || (pos ? 'var(--ns-pos)' : 'var(--ns-neg)');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={dArea} fill={c} fillOpacity={fillOpacity} />
      <path d={d} stroke={c} strokeWidth="1.4" fill="none" />
    </svg>
  );
}

// ─────── Area chart with crosshair ───────
function NSAreaChart({
  data, w = 720, h = 280, color, secondary, secondaryLabel,
  yFormat = (v) => v.toFixed(0), xLabels, padTop = 24, padBot = 32, padLeft = 0, padRight = 0,
  highlightIdx,
}) {
  const [hover, setHover] = React.useState(highlightIdx ?? null);
  const wRef = React.useRef(null);
  const allVals = [...data, ...(secondary || [])];
  const min = Math.min(...allVals) * 0.985;
  const max = Math.max(...allVals) * 1.015;
  const r = max - min || 1;
  const ix = (i) => padLeft + (i / (data.length - 1)) * (w - padLeft - padRight);
  const iy = (v) => padTop + (1 - (v - min) / r) * (h - padTop - padBot);
  const pts = data.map((v, i) => [ix(i), iy(v)]);
  const sPts = secondary ? secondary.map((v, i) => [ix(i), iy(v)]) : null;
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dArea = d + ` L${pts[pts.length-1][0]},${h - padBot} L${pts[0][0]},${h - padBot} Z`;
  const dS = sPts ? sPts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ') : null;
  const c = color || 'var(--ns-accent)';
  const c2 = 'var(--ns-fg-dim)';
  const hi = hover != null && data[hover] != null ? pts[hover] : null;
  const gridY = [0.25, 0.5, 0.75];

  const onMove = (e) => {
    const rect = wRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pctX = (x - padLeft) / (w - padLeft - padRight);
    const idx = Math.round(pctX * (data.length - 1));
    if (idx >= 0 && idx < data.length) setHover(idx);
  };

  return (
    <svg ref={wRef} viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}
         onMouseMove={onMove} onMouseLeave={() => setHover(highlightIdx ?? null)}>
      <defs>
        <linearGradient id="ns-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.28" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid */}
      {gridY.map((g, i) => {
        const y = padTop + g * (h - padTop - padBot);
        const v = max - g * r;
        return (
          <g key={i}>
            <line x1={padLeft} x2={w - padRight} y1={y} y2={y} stroke="var(--ns-border)" strokeDasharray="2 3" />
            <text x={w - padRight - 4} y={y - 4} fill="var(--ns-fg-dim)" fontSize="11" textAnchor="end" fontFamily="var(--ns-font-mono)">{yFormat(v)}</text>
          </g>
        );
      })}
      {/* benchmark line */}
      {dS && <path d={dS} stroke={c2} strokeWidth="1.2" fill="none" strokeDasharray="4 3" />}
      {/* area + line */}
      <path d={dArea} fill="url(#ns-area-grad)" />
      <path d={d} stroke={c} strokeWidth="1.8" fill="none" strokeLinejoin="round" />

      {/* hover crosshair */}
      {hi && (
        <g>
          <line x1={hi[0]} x2={hi[0]} y1={padTop} y2={h - padBot} className="ns-chart-cross" />
          <circle cx={hi[0]} cy={hi[1]} r="4.5" fill="var(--ns-bg)" stroke={c} strokeWidth="2" />
          {sPts && <circle cx={sPts[hover][0]} cy={sPts[hover][1]} r="3" fill="var(--ns-bg)" stroke={c2} strokeWidth="1.5" />}
          <g transform={`translate(${Math.min(hi[0] + 12, w - 130)}, ${Math.max(hi[1] - 38, padTop)})`}>
            <rect width="118" height="42" rx="6" fill="var(--ns-bg-card)" stroke="var(--ns-border)" />
            <text x="10" y="16" fontSize="11" fill="var(--ns-fg-dim)" fontFamily="var(--ns-font-mono)" letterSpacing="0.06em">
              {xLabels ? xLabels[hover] : `D${hover}`}
            </text>
            <text x="10" y="32" fontSize="13" fill="var(--ns-fg)" fontFamily="var(--ns-font-mono)" fontWeight="500">
              {yFormat(data[hover])}
            </text>
          </g>
        </g>
      )}

      {/* x-axis labels */}
      {xLabels && (
        <g>
          {xLabels.map((lab, i) => {
            const showEvery = Math.max(1, Math.floor(xLabels.length / 6));
            if (i % showEvery !== 0 && i !== xLabels.length - 1) return null;
            return (
              <text key={i} x={ix(i)} y={h - 8} fill="var(--ns-fg-dim)" fontSize="11"
                    textAnchor="middle" fontFamily="var(--ns-font-mono)">{lab}</text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ─────── Donut / allocation chart ───────
function NSDonut({ data, size = 140, thickness = 18 }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  let a0 = -Math.PI / 2;
  const arcs = data.map((d) => {
    const frac = d.v / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const path = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
    a0 = a1;
    return { path, color: d.color, label: d.label, pct: (frac * 100).toFixed(1) };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs.map((a, i) => (
        <path key={i} d={a.path} stroke={a.color} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
      ))}
    </svg>
  );
}

// ─────── Mini bar chart ───────
function NSBars({ data, w = 280, h = 80, color, neutral }) {
  const max = Math.max(...data.map((d) => Math.abs(d.v)));
  const bw = (w - (data.length - 1) * 4) / data.length;
  const mid = h / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--ns-border)" />
      {data.map((d, i) => {
        const bh = (Math.abs(d.v) / max) * (h * 0.42);
        const y = d.v >= 0 ? mid - bh : mid;
        const c = neutral ? 'var(--ns-chart-2)' : d.v >= 0 ? 'var(--ns-pos)' : 'var(--ns-neg)';
        return <rect key={i} x={i * (bw + 4)} y={y} width={bw} height={bh} fill={c} rx="1.5" />;
      })}
    </svg>
  );
}

// ─────── KPI card ───────
function NSKpi({ label, value, sub, trend, spark, accent }) {
  return (
    <div className="ns-card" style={{ padding: 'var(--ns-pad-card)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="ns-eyebrow">{label}</span>
        {trend != null && (
          <span className={'ns-pill ' + (trend >= 0 ? 'solid-pos' : 'solid-neg')}>
            <NSIcon name={trend >= 0 ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2} />
            <span className="num">{Math.abs(trend).toFixed(2)}%</span>
          </span>
        )}
      </div>
      <div className="ns-num-md" style={{ color: accent ? 'var(--ns-fg)' : 'var(--ns-fg)', marginBlock: 2 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>{sub}</span>
        {spark && <NSSparkline data={spark} pos={trend >= 0} />}
      </div>
    </div>
  );
}

// ─────── Brand mark ───────
function NSLogo({ size = 22 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M12 2l2.5 7L22 11l-6 4.5L18 22l-6-4-6 4 2-6.5L2 11l7.5-2L12 2z"
              fill="var(--ns-accent)" stroke="var(--ns-accent)" strokeLinejoin="round" strokeWidth="1" />
      </svg>
      <span style={{ fontFamily: 'var(--ns-font-display)', fontWeight: 600, fontSize: 15, letterSpacing: -0.01 }}>Northstar</span>
    </span>
  );
}

// ─────── Account / holding icon (square colored mark with initials) ───────
function NSMark({ label, color, size = 36, mono = false }) {
  const bg = color || 'var(--ns-bg-hover)';
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      background: bg, color: 'var(--ns-bg)',
      borderRadius: 'var(--ns-r-sm)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: mono ? 'var(--ns-font-mono)' : 'var(--ns-font-display)',
      fontWeight: 600, fontSize: size <= 28 ? 11 : 13, letterSpacing: 0.02,
    }}>{label}</div>
  );
}

// helper: generate fake but plausible series
function nsSeries(n, base, vol = 0.02, trend = 0.001) {
  const out = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = v * (1 + trend + (Math.sin(i * 0.7) + Math.cos(i * 1.3)) * vol * 0.5 + ((i % 7) - 3) * vol * 0.1);
    out.push(v);
  }
  return out;
}

function nsCurrency(v, sign = false, ccy = 'NT$') {
  const s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const prefix = v < 0 ? '−' : sign ? '+' : '';
  return `${prefix}${ccy}${s}`;
}

// ─────── Tabular number helper ───────
// Ensures consistent thousand separators + optional fixed decimals
function nsFmt(v, { decimals = 0, sign = false, prefix = '', suffix = '' } = {}) {
  const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  const abs = Math.abs(v).toLocaleString('zh-TW', opts);
  const sigil = v < 0 ? '−' : sign ? '+' : '';
  return `${sigil}${prefix}${abs}${suffix}`;
}

Object.assign(window, {
  NSIcon, NSSparkline, NSAreaChart, NSDonut, NSBars,
  NSKpi, NSLogo, NSMark, nsSeries, nsCurrency, nsFmt,
});
