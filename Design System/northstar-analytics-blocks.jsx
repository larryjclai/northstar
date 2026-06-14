// northstar-analytics-blocks.jsx
// Shared building blocks + data for the Analytics redesign variants.

// ─── Shared portfolio facts ──────────────────────────────────────────────────
const nsAn = {
  startVal: 7267488,
  endVal: 14494731,
  change: 7227243,
  retPct: 99.4,
  twr: 94.2, xirr: 38.6, priceRet: 99.4,
  benchRet: 116.2, alpha: -16.7,
  vol: '14.2%', sortino: '1.84', sharpe: '1.42', maxDD: '−18.4%',
  divTTM: 558, divYield: 0.04, divCum: 2742,
  ccy: [
    { label: 'TWD', pct: 77.3, amt: 11235202, color: 'var(--ns-chart-2)' },
    { label: 'USD', pct: 22.7, amt: 3308729,  color: 'var(--ns-chart-1)' },
  ],
};
const nsMoney = v => 'NT$' + Math.round(v).toLocaleString('en-US');

// ─── Section eyebrow + title ─────────────────────────────────────────────────
function NSAnHead({ kicker, title, right, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, marginBottom: 18 }}>
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 7, color: accent || 'var(--ns-accent)' }}>{kicker}</div>
        <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 21,
          fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</h3>
      </div>
      {right}
    </div>
  );
}

// ─── Dark feature band (deeper than page) ────────────────────────────────────
function NSAnBand({ children, style, deep }) {
  return (
    <div style={{
      background: deep ? '#0a0c0e' : 'var(--ns-bg-card)',
      border: deep ? '1px solid #1a1d20' : '1px solid var(--ns-border)',
      borderRadius: 'var(--ns-r-xl)',
      padding: 34,
      ...style,
    }}>{children}</div>
  );
}

// ─── Equity hero — big period-return number + cumulative curve ────────────────
function NSAnEquityHero({ compact }) {
  const series = React.useMemo(() => nsSeries(260, 100, 0.022, 0.0035), []);
  const ret = series.map(v => ((v / series[0]) - 1) * 100);
  const labels = React.useMemo(() => Array.from({ length: 260 }, (_, i) => {
    const d = new Date(2025, 5, 14); d.setDate(d.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }), []);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 24, marginBottom: compact ? 14 : 22 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 12 }}>期間報酬 · 1Y</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span className="num" style={{ fontSize: compact ? 56 : 72, fontWeight: 600,
              letterSpacing: '-0.03em', color: 'var(--ns-pos)', lineHeight: 0.9 }}>+{nsAn.retPct}%</span>
            <span className="ns-pill solid-pos" style={{ fontSize: 13 }}>
              <NSIcon name="arrowUp" size={12} strokeWidth={2} />{nsMoney(nsAn.change).replace('NT$', 'NT$ ')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {[
            { l: '期初市值', v: nsMoney(nsAn.startVal) },
            { l: '期末市值', v: nsMoney(nsAn.endVal), strong: true },
          ].map(s => (
            <div key={s.l}>
              <div className="ns-eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>{s.l}</div>
              <div className="num" style={{ fontSize: 22, fontWeight: 500,
                color: s.strong ? 'var(--ns-fg)' : 'var(--ns-fg-muted)' }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: compact ? 150 : 200 }}>
        <NSAreaChart data={ret} w={760} h={compact ? 150 : 200} xLabels={labels}
          color="var(--ns-pos)" yFormat={v => v.toFixed(0) + '%'} padLeft={0} padRight={4} />
      </div>
    </div>
  );
}

// ─── Three return measures (TWR / XIRR / 價格報酬) ────────────────────────────
function NSAnThreeReturns() {
  const items = [
    { l: '期間 TWR', sub: '剔除進出金影響', v: `+${nsAn.twr}%`, c: 'var(--ns-pos)' },
    { l: '年化 XIRR', sub: '考慮金流時間', v: `+${nsAn.xirr}%`, c: 'var(--ns-pos)' },
    { l: '價格報酬', sub: '市值帳面變化', v: `+${nsAn.priceRet}%`, c: 'var(--ns-fg)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      border: '1px solid var(--ns-border)', borderRadius: 'var(--ns-r-md)', overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={it.l} style={{ padding: '18px 20px',
          borderLeft: i ? '1px solid var(--ns-border)' : 'none', background: 'var(--ns-bg-card)' }}>
          <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>{it.l}</div>
          <div className="num" style={{ fontSize: 28, fontWeight: 600, color: it.c, marginBottom: 6 }}>{it.v}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Alpha / benchmark compare (KEEP — must retain) ──────────────────────────
function NSAnAlpha({ compact }) {
  const port  = React.useMemo(() => nsSeries(260, 100, 0.022, 0.0035), []);
  const bench = React.useMemo(() => nsSeries(260, 100, 0.016, 0.0042), []);
  const pr = port.map(v => ((v / port[0]) - 1) * 100);
  const br = bench.map(v => ((v / bench[0]) - 1) * 100);
  const labels = React.useMemo(() => Array.from({ length: 260 }, (_, i) => {
    const d = new Date(2025, 5, 14); d.setDate(d.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }), []);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        border: '1px solid var(--ns-border)', borderRadius: 'var(--ns-r-md)',
        overflow: 'hidden', marginBottom: 16 }}>
        {[
          { l: '投資組合', v: `+${nsAn.retPct}%`, c: 'var(--ns-pos)' },
          { l: '0050.TW 指標', v: `+${nsAn.benchRet}%`, c: 'var(--ns-fg-muted)' },
          { l: 'Alpha', v: `${nsAn.alpha}%`, c: 'var(--ns-neg)' },
        ].map((s, i) => (
          <div key={s.l} style={{ padding: '14px 18px', background: 'var(--ns-bg-hover)',
            borderLeft: i ? '1px solid var(--ns-border)' : 'none' }}>
            <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{s.l}</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 600, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ height: compact ? 170 : 210 }}>
        <NSAreaChart data={pr} secondary={br} w={760} h={compact ? 170 : 210}
          xLabels={labels} color="var(--ns-pos)" yFormat={v => v.toFixed(0) + '%'} padRight={4} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 2, background: 'var(--ns-pos)' }} />
          <span className="muted">投資組合（累積報酬）</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 16, height: 0, borderTop: '1.5px dashed var(--ns-fg-dim)' }} />
          <span className="muted">0050.TW 指標</span></span>
      </div>
      <p style={{ marginTop: 14, marginBottom: 0, fontSize: 12, color: 'var(--ns-fg-muted)', lineHeight: 1.6 }}>
        本期落後指標 <span className="neg" style={{ fontWeight: 600 }}>16.7%</span>，
        主因集中度過高且未持有指標中的權值成分；可參考下方持倉熱度檢視貢獻來源。
      </p>
    </div>
  );
}

// ─── Risk KPI rail ───────────────────────────────────────────────────────────
function NSAnRiskKpis({ cols = 4 }) {
  const volSpark     = Array.from({ length: 20 }, (_, i) => 12 + Math.sin(i * 0.8) * 2 + Math.sin(i * 2.1) * 0.5);
  const sortinoSpark = Array.from({ length: 20 }, (_, i) => 1.5 + Math.sin(i * 0.4) * 0.3);
  const sharpeSpark  = Array.from({ length: 20 }, (_, i) => 1.2 + Math.sin(i * 0.5) * 0.2);
  const ddSpark      = Array.from({ length: 20 }, (_, i) => -(5 + Math.abs(Math.sin(i * 0.6)) * 10));
  const kpis = [
    { label: 'Annual Volatility', note: '年化波動率', value: nsAn.vol,     sub: 'vs 指標 12.8%',           color: 'var(--ns-chart-2)', spark: volSpark,     up: true },
    { label: 'Sortino Ratio',     note: '越高越好',   value: nsAn.sortino, sub: '指標 1.21 · 下檔σ 5.4%',  color: 'var(--ns-pos)',     spark: sortinoSpark, up: true },
    { label: 'Sharpe Ratio',      note: '越高越好',   value: nsAn.sharpe,  sub: '無風險 2.5% · σ 14.2%',   color: 'var(--ns-chart-1)', spark: sharpeSpark,  up: true },
    { label: 'Max Drawdown',      note: '最大回撤',   value: nsAn.maxDD,   sub: '2025-08-05 · 已恢復',     color: 'var(--ns-neg)',     spark: ddSpark,      up: false },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
      {kpis.map(k => (
        <div key={k.label} className="ns-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="ns-eyebrow" style={{ fontSize: 10 }}>{k.label}</span>
            <span className="mono dim" style={{ fontSize: 10 }}>{k.note}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <span className="num" style={{ fontSize: 27, fontWeight: 600, color: k.color }}>{k.value}</span>
            <NSSparkline data={k.spark} pos={k.up} color={k.color} w={58} h={26} />
          </div>
          <div className="muted" style={{ fontSize: 11 }}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Currency split (slim) ───────────────────────────────────────────────────
function NSAnCurrency() {
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', marginBottom: 16 }}>
        {nsAn.ccy.map(c => (
          <div key={c.label} style={{ width: c.pct + '%', background: c.color }} />
        ))}
      </div>
      {nsAn.ccy.map(c => (
        <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 0', borderBottom: '1px solid var(--ns-border)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
          <span style={{ flex: 1, fontFamily: 'var(--ns-font-mono)', fontSize: 13, fontWeight: 600 }}>{c.label}</span>
          <span className="num muted" style={{ fontSize: 12.5 }}>{nsMoney(c.amt)}</span>
          <span className="num" style={{ fontSize: 13, fontWeight: 600, minWidth: 56, textAlign: 'right' }}>{c.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Dividend summary stats ──────────────────────────────────────────────────
function NSAnDividendStats() {
  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {[
        { l: '近一年股利 (TTM)', v: `NT$ ${nsAn.divTTM}`, c: 'var(--ns-accent)' },
        { l: '近一年殖利率', v: `${nsAn.divYield.toFixed(2)}%`, c: 'var(--ns-fg)' },
        { l: '累計股利', v: `NT$ ${nsAn.divCum.toLocaleString('en-US')}`, c: 'var(--ns-fg)' },
      ].map(s => (
        <div key={s.l}>
          <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>{s.l}</div>
          <div className="num" style={{ fontSize: 26, fontWeight: 600, color: s.c }}>{s.v}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Page shell (header + tab bar), fixed content width ──────────────────────
function NSAnPageShell({ title, badge, children }) {
  return (
    <div style={{ width: 1180, background: 'var(--ns-bg)', color: 'var(--ns-fg)',
      fontFamily: 'var(--ns-font-ui)', padding: '30px 36px 56px' }} className="ns">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>投資組合 · 分析</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 30,
            fontWeight: 600, letterSpacing: '-0.02em' }}>投資分析</h1>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 13px',
          borderRadius: 999, border: '1px solid var(--ns-border)', background: 'var(--ns-bg-card)',
          fontSize: 12.5, color: 'var(--ns-fg-muted)' }}>
          <span style={{ width: 13, height: 13, borderRadius: 4, background: 'var(--ns-accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} />
          {badge}
        </span>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ns-border)', marginBottom: 28, gap: 4 }}>
        {['持倉', '交易紀錄', '定期定額', '分析'].map(t => (
          <span key={t} style={{ padding: '11px 18px', fontSize: 14,
            fontWeight: t === '分析' ? 600 : 400,
            color: t === '分析' ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
            borderBottom: t === '分析' ? '2px solid var(--ns-accent)' : '2px solid transparent',
            marginBottom: -1 }}>{t}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, {
  nsAn, nsMoney, NSAnHead, NSAnBand, NSAnEquityHero, NSAnThreeReturns,
  NSAnAlpha, NSAnRiskKpis, NSAnCurrency, NSAnDividendStats, NSAnPageShell,
});
