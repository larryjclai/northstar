// northstar-foundations.jsx — Foundation artboards: tokens, type, components

function NSFoundationColors() {
  const groups = [
    {
      name: 'Surfaces',
      tokens: [
        ['--ns-bg', 'Canvas'],
        ['--ns-bg-elev', 'Elevated'],
        ['--ns-bg-card', 'Card'],
        ['--ns-bg-hover', 'Hover'],
      ]
    },
    {
      name: 'Foreground',
      tokens: [
        ['--ns-fg', 'Primary'],
        ['--ns-fg-muted', 'Muted'],
        ['--ns-fg-dim', 'Dim'],
        ['--ns-border', 'Border'],
      ]
    },
    {
      name: 'Semantic',
      tokens: [
        ['--ns-accent', 'Accent'],
        ['--ns-pos', 'Positive'],
        ['--ns-neg', 'Negative'],
        ['--ns-warn', 'Warn'],
      ]
    },
    {
      name: 'Chart series',
      tokens: [
        ['--ns-chart-1', 'Series 1'],
        ['--ns-chart-2', 'Series 2'],
        ['--ns-chart-3', 'Series 3'],
        ['--ns-chart-4', 'Series 4'],
      ]
    },
  ];
  return (
    <div className="ns-board" style={{ padding: 40 }}>
      <header style={{ marginBottom: 32 }}>
        <div className="ns-eyebrow">Foundations · 01</div>
        <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 36, margin: '6px 0 8px', letterSpacing: -0.02 }}>Color tokens</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 520, fontSize: 14 }}>
          Built with <span className="mono">oklch()</span> for perceptual uniformity. Dark mode primary; light flips bg / fg.
          Accent <span className="mono" style={{ color: 'var(--ns-accent)' }}>#9fe870</span> (lime) inherits from Wise; gain/loss switches per locale.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 28 }}>
        {groups.map((g) => (
          <div key={g.name}>
            <div className="ns-eyebrow" style={{ marginBottom: 10 }}>{g.name}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {g.tokens.map(([tok, label]) => (
                <div key={tok} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '10px 14px', borderRadius: 'var(--ns-r-sm)',
                  border: '1px solid var(--ns-border)',
                  background: 'var(--ns-bg-elev)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `var(${tok})`,
                    border: '1px solid var(--ns-border)',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
                    <div className="mono dim" style={{ fontSize: 11 }}>{tok}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 36 }}>
        <div className="ns-eyebrow" style={{ marginBottom: 12 }}>Gain / Loss locales</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { name: 'TW · 紅漲綠跌', pos: '#ff6363', neg: '#3fbf6c' },
            { name: 'US · Green up', pos: '#6ee49a', neg: '#ff7d6b' },
            { name: 'Neutral · Teal/Amber', pos: '#34c5b0', neg: '#f0a050' },
          ].map((l) => (
            <div key={l.name} className="ns-card" style={{ padding: 16, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 10 }}>{l.name}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="ns-pill" style={{ background: l.pos + '28', color: l.pos, borderColor: 'transparent' }}>
                  <NSIcon name="arrowUp" size={11} strokeWidth={2} />
                  <span className="num">+2.34%</span>
                </span>
                <span className="ns-pill" style={{ background: l.neg + '28', color: l.neg, borderColor: 'transparent' }}>
                  <NSIcon name="arrowDown" size={11} strokeWidth={2} />
                  <span className="num">−1.12%</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NSFoundationType() {
  return (
    <div className="ns-board" style={{ padding: 40 }}>
      <header style={{ marginBottom: 28 }}>
        <div className="ns-eyebrow">Foundations · 02</div>
        <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 36, margin: '6px 0 8px', letterSpacing: -0.02 }}>Type system</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          UI/Display: <span className="mono" style={{ color: 'var(--ns-fg)' }}>Space Grotesk</span> · Numbers: <span className="mono" style={{ color: 'var(--ns-fg)' }}>JetBrains Mono</span> · 中文: <span style={{ color: 'var(--ns-fg)' }}>Noto Sans TC</span>
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 16 }}>Display & headings</div>
          <div style={{ display: 'grid', gap: 14 }}>
            {[
              { size: 56, weight: 600, label: 'Display XL · 56/600' },
              { size: 40, weight: 600, label: 'Display · 40/600' },
              { size: 28, weight: 600, label: 'Title 1 · 28/600' },
              { size: 22, weight: 500, label: 'Title 2 · 22/500' },
              { size: 18, weight: 500, label: 'Title 3 · 18/500' },
            ].map((r) => (
              <div key={r.label}>
                <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 2 }}>{r.label}</div>
                <div style={{ fontFamily: 'var(--ns-font-display)', fontSize: r.size, fontWeight: r.weight, letterSpacing: r.size > 30 ? -0.025 : -0.01, lineHeight: 1.08 }}>
                  Net worth
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 16 }}>Numbers (mono)</div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 2 }}>XXL · 56/500</div>
              <div className="ns-num-xl">NT$8,452,310</div>
            </div>
            <div>
              <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 2 }}>XL · 40/500</div>
              <div className="ns-num-lg">+2,103.45</div>
            </div>
            <div>
              <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 2 }}>L · 28/500</div>
              <div className="ns-num-md pos">+12.34%</div>
            </div>
            <div>
              <div className="dim mono" style={{ fontSize: 10.5, marginBottom: 2 }}>S · 16/500</div>
              <div className="ns-num-sm">2330.TW · 1,042</div>
            </div>
          </div>

          <div className="ns-eyebrow" style={{ marginTop: 28, marginBottom: 12 }}>Body & UI</div>
          <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
            <div>記帳與資產追蹤的完整體驗。Track every NT$, USD and JPY with the same precision.</div>
            <div className="muted">14px UI — 主要資訊密度的基準大小</div>
            <div className="dim mono" style={{ fontSize: 11, letterSpacing: 0.12, textTransform: 'uppercase' }}>11/MONO/UPPER · EYEBROW LABEL</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NSFoundationComponents() {
  const [seg, setSeg] = React.useState('1m');
  return (
    <div className="ns-board" style={{ padding: 40 }}>
      <header style={{ marginBottom: 28 }}>
        <div className="ns-eyebrow">Foundations · 03</div>
        <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 36, margin: '6px 0 8px', letterSpacing: -0.02 }}>Components</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Buttons, pills, segmented controls, list rows, KPI cards.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div className="ns-card" style={{ display: 'grid', gap: 16 }}>
          <div className="ns-eyebrow">Buttons</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新增交易</button>
            <button className="ns-btn"><NSIcon name="refresh" size={14}/>Refresh</button>
            <button className="ns-btn ghost">Cancel</button>
            <button className="ns-btn icon"><NSIcon name="dots" size={16}/></button>
          </div>

          <div className="ns-eyebrow" style={{ marginTop: 6 }}>Pills</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="ns-pill"><NSIcon name="tag" size={11}/>Food</span>
            <span className="ns-pill solid-pos"><NSIcon name="arrowUp" size={11} strokeWidth={2}/><span className="num">+12.4%</span></span>
            <span className="ns-pill solid-neg"><NSIcon name="arrowDown" size={11} strokeWidth={2}/><span className="num">−3.2%</span></span>
            <span className="ns-pill solid-accent"><span className="num">FIFO</span></span>
            <span className="ns-pill"><span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ns-warn)' }}/>Stale 4h</span>
          </div>

          <div className="ns-eyebrow" style={{ marginTop: 6 }}>Segmented</div>
          <div className="ns-seg">
            {['1D','1W','1M','3M','1Y','ALL'].map((v) => (
              <button key={v} aria-selected={seg === v.toLowerCase()} onClick={() => setSeg(v.toLowerCase())}>{v}</button>
            ))}
          </div>

          <div className="ns-eyebrow" style={{ marginTop: 6 }}>Input</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="ns-input" placeholder="搜尋交易、商品代號…" style={{ flex: 1 }} />
            <button className="ns-btn"><NSIcon name="filter" size={14}/></button>
          </div>
        </div>

        <div className="ns-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--ns-pad-card)', borderBottom: '1px solid var(--ns-border)' }}>
            <div className="ns-eyebrow">List rows · transactions</div>
          </div>
          {[
            { mark: 'FD', color: 'var(--ns-chart-3)', name: '全家便利商店', sub: '今天 · 14:32 · 信用卡', amt: -85, cat: '食物' },
            { mark: 'UB', color: 'var(--ns-chart-4)', name: 'Uber', sub: '今天 · 09:10 · 信用卡', amt: -250, cat: '交通' },
            { mark: 'TW', color: 'var(--ns-chart-1)', name: '台積電配息', sub: '昨天 · 證券戶 · 1,000 股', amt: +3500, cat: '股息' },
            { mark: '$', color: 'var(--ns-chart-2)', name: '薪資', sub: '5/25 · 銀行轉入', amt: +72000, cat: '收入' },
          ].map((r, i) => (
            <div key={i} className="ns-row" style={{ gap: 12 }}>
              <NSMark label={r.mark} color={r.color} mono />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{r.sub}</div>
              </div>
              <span className="ns-pill" style={{ fontSize: 11 }}>{r.cat}</span>
              <div className={'num ' + (r.amt >= 0 ? 'pos' : '')} style={{ fontSize: 15, fontWeight: 500, minWidth: 110, textAlign: 'right' }}>
                {r.amt >= 0 ? '+' : '−'}NT${Math.abs(r.amt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <NSKpi label="淨資產" value="NT$8,452K" sub="HKD · USD · NTD"   trend={2.34} spark={nsSeries(20, 100, 0.012, 0.004)}/>
          <NSKpi label="本月現金流" value="+NT$48,210" sub="收入 NT$72K · 支出 NT$24K" trend={5.6} spark={nsSeries(20, 100, 0.02, 0.003)}/>
          <NSKpi label="投資組合" value="NT$5,210K" sub="台股 · 美股 · ETF" trend={1.82} spark={nsSeries(20, 100, 0.018, 0.003)}/>
          <NSKpi label="今日損益" value="+NT$12,450" sub="未實現 +NT$8.4K · 已實現 +NT$4K" trend={0.27} spark={nsSeries(20, 100, 0.01, 0.001)}/>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NSFoundationColors, NSFoundationType, NSFoundationComponents });
