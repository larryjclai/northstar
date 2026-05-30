// northstar-fire-calc.jsx — Interactive FIRE calculator with live projection

// ─────── Core FIRE math ───────
function fireProjection({ currentAge, retireAge, currentAssets, annualSaving, cagr, annualSpend, swr }) {
  const years = retireAge - currentAge;
  const fireTarget = annualSpend / swr;
  const points = [];
  let v = currentAssets;
  let fireYear = null;
  let coastYear = null;
  const coastTarget = (fireTarget) / Math.pow(1 + cagr, years);

  for (let y = 0; y <= Math.max(years, 40); y++) {
    points.push({ y, age: currentAge + y, v, target: fireTarget });
    if (fireYear === null && v >= fireTarget) fireYear = y;
    if (coastYear === null && v >= coastTarget) coastYear = y;
    v = v * (1 + cagr) + annualSaving;
  }
  return { points, fireTarget, fireYear, coastYear, coastTarget };
}

// ─────── Slider with label ───────
function CalcSlider({ label, value, min, max, step = 1, format, onChange, accent }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ns-fg-muted)', fontWeight: 500 }}>{label}</span>
        <span className="mono" style={{
          fontSize: 16, fontWeight: 600,
          color: accent ? 'var(--ns-accent)' : 'var(--ns-fg)',
        }}>{format ? format(value) : value}</span>
      </div>
      <div style={{ position: 'relative', height: 6 }}>
        <div style={{
          position: 'absolute', inset: '1px 0', borderRadius: 99,
          background: 'var(--ns-bg-hover)',
        }}/>
        <div style={{
          position: 'absolute', left: 0, top: '1px', height: 4, borderRadius: 99,
          width: pct + '%', background: 'var(--ns-accent)',
          transition: 'width 0.1s',
        }}/>
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={(e) => onChange(Number(e.target.value))}
               style={{
                 position: 'absolute', inset: 0, width: '100%', height: '100%',
                 opacity: 0, cursor: 'pointer', margin: 0,
               }}/>
        <div style={{
          position: 'absolute', top: '50%', transform: `translateX(-50%) translateY(-50%)`,
          left: pct + '%',
          width: 16, height: 16, borderRadius: 99,
          background: 'var(--ns-bg-card)', border: '2px solid var(--ns-accent)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          transition: 'left 0.1s',
        }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="mono dim" style={{ fontSize: 10 }}>{format ? format(min) : min}</span>
        <span className="mono dim" style={{ fontSize: 10 }}>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

// ─────── Desktop: FIRE Calculator ───────
function NSDesktopFireCalc({ onNavigate } = {}) {
  const [p, setP] = React.useState({
    currentAge:    30,
    retireAge:     50,
    currentAssets: 8_452_000,
    annualSaving:  580_000,
    cagr:          0.072,
    annualSpend:   1_400_000,
    swr:           0.04,
  });
  const set = (k) => (v) => setP((prev) => ({ ...prev, [k]: v }));
  const fmt = {
    money: (v) => 'NT$' + (v >= 1_000_000 ? (v/1_000_000).toFixed(2) + 'M' : v.toLocaleString()),
    pct:   (v) => (v * 100).toFixed(1) + '%',
    age:   (v) => v + ' 歲',
  };

  const base   = fireProjection({ ...p });
  const bear   = fireProjection({ ...p, cagr: p.cagr - 0.025 });
  const bull   = fireProjection({ ...p, cagr: p.cagr + 0.025 });

  const allPoints = base.points;
  const max = Math.max(...allPoints.map((d) => d.v), base.fireTarget) * 1.08;
  const w = 900, h = 280, padL = 12, padR = 16, padT = 20, padB = 28;
  const ix = (y) => padL + (y / (allPoints.length - 1)) * (w - padL - padR);
  const iy = (v) => padT + (1 - v / max) * (h - padT - padB);

  const makePath = (pts) => pts.map((d, i) => (i === 0 ? 'M' : 'L') + ix(d.y).toFixed(1) + ',' + iy(d.v).toFixed(1)).join(' ');
  const makeArea = (pts) => makePath(pts) + ` L${ix(pts.length-1)},${h - padB} L${ix(0)},${h-padB} Z`;

  const fireY = ix(base.fireYear ?? allPoints.length - 1);
  const fireX = iy(base.fireTarget);

  return (
    <NSDesktopShell active="goals" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Interactive · 即時更新</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>FIRE Calculator</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="download" size={14}/>匯出報告</button>
            <button className="ns-btn primary"><NSIcon name="star" size={14}/>存為目標</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ns-card" style={{ padding: 22 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>個人設定</div>
              <CalcSlider label="目前年齡" value={p.currentAge} min={20} max={65} format={fmt.age} onChange={set('currentAge')}/>
              <CalcSlider label="目標退休年齡" value={p.retireAge} min={p.currentAge + 1} max={75} format={fmt.age} onChange={set('retireAge')} accent/>
            </div>

            <div className="ns-card" style={{ padding: 22 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>財務狀況</div>
              <CalcSlider label="目前資產" value={p.currentAssets} min={0} max={30_000_000} step={100_000} format={fmt.money} onChange={set('currentAssets')}/>
              <CalcSlider label="年儲蓄 / 投入" value={p.annualSaving} min={0} max={3_000_000} step={50_000} format={fmt.money} onChange={set('annualSaving')} accent/>
            </div>

            <div className="ns-card" style={{ padding: 22 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>退休後支出</div>
              <CalcSlider label="年支出（退休後）" value={p.annualSpend} min={600_000} max={5_000_000} step={50_000} format={fmt.money} onChange={set('annualSpend')}/>
              <CalcSlider label="安全提領率 SWR" value={p.swr} min={0.02} max={0.06} step={0.001} format={fmt.pct} onChange={set('swr')} accent/>
            </div>

            <div className="ns-card" style={{ padding: 22 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>投資報酬</div>
              <CalcSlider label="預期年化報酬 (CAGR)" value={p.cagr} min={0.02} max={0.15} step={0.001} format={fmt.pct} onChange={set('cagr')} accent/>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                悲觀：{fmt.pct(p.cagr - 0.025)} · 基準：{fmt.pct(p.cagr)} · 樂觀：{fmt.pct(p.cagr + 0.025)}
              </div>
            </div>
          </div>

          {/* Chart + results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Result cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                ['FIRE 目標', fmt.money(base.fireTarget), null, 'NT$35M = 1× 年支出 × 25'],
                ['達成年份', base.fireYear != null ? `+${base.fireYear}y · ${p.currentAge + base.fireYear}歲` : '圖表外', base.fireYear != null ? 'pos' : 'neg', null],
                ['Coast-FIRE', base.coastYear != null ? `+${base.coastYear}y · ${p.currentAge + base.coastYear}歲` : '—', base.coastYear != null ? 'pos' : null, '屆時停止儲蓄仍可達成'],
                ['每月需存', fmt.money(Math.round(p.annualSaving / 12)), null, '= 年薪的 ' + (p.annualSaving / 2_160_000 * 100).toFixed(0) + '%（估計）'],
              ].map(([l, v, c, sub]) => (
                <div className="ns-card" key={l} style={{ padding: '20px 22px' }}>
                  <div className="ns-eyebrow" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {l}
                    {l === 'Coast-FIRE' && (
                      <span title="Coast FIRE：達到此金額後，即使完全停止額外儲蓄，現有資產以預期報酬率自然複利增長，仍可達成 FIRE 目標。" style={{ cursor: 'help', fontSize: 13, opacity: 0.5 }}>ⓘ</span>
                    )}
                  </div>
                  <div className={'num ' + (c || '')} style={{ fontSize: 18, fontWeight: 600, marginBlock: '4px 6px' }}>{v}</div>
                  {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
                </div>
              ))}
            </div>

            {/* Main projection chart */}
            <div className="ns-card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Projection · 拖動滑桿即時更新</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span className="ns-num-md">{base.fireYear != null ? base.fireYear + ' years' : '—'}</span>
                    <span className="muted mono" style={{ fontSize: 13 }}>to FIRE · age {p.currentAge + (base.fireYear ?? 0)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11.5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 12, height: 2, background: 'var(--ns-fg-dim)' }}/>
                    <span className="muted">FIRE goal</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 12, height: 2, background: 'var(--ns-fg-dim)', opacity: 0.4 }}/>
                    <span className="dim">Bear {fmt.pct(p.cagr - 0.025)}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 12, height: 2, background: 'var(--ns-accent)' }}/>
                    <span>Base {fmt.pct(p.cagr)}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 12, height: 2, background: 'var(--ns-chart-2)' }}/>
                    <span className="muted">Bull {fmt.pct(p.cagr + 0.025)}</span>
                  </span>
                </div>
              </div>

              <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="fire-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ns-accent)" stopOpacity="0.22"/>
                    <stop offset="100%" stopColor="var(--ns-accent)" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="fire-bear-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ns-fg-dim)" stopOpacity="0.08"/>
                    <stop offset="100%" stopColor="var(--ns-fg-dim)" stopOpacity="0"/>
                  </linearGradient>
                </defs>

                {/* Grid */}
                {[0.25, 0.5, 0.75].map((g, i) => {
                  const y = padT + g * (h - padT - padB);
                  const v = max * (1 - g);
                  return (
                    <g key={i}>
                      <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--ns-border)" strokeDasharray="2 3"/>
                      <text x={w - padR - 2} y={y - 4} fill="var(--ns-fg-dim)" fontSize="11" textAnchor="end" fontFamily="var(--ns-font-mono)">
                        {fmt.money(v)}
                      </text>
                    </g>
                  );
                })}

                {/* FIRE target line */}
                <line x1={padL} x2={w - padR} y1={iy(base.fireTarget)} y2={iy(base.fireTarget)}
                      stroke="var(--ns-fg-muted)" strokeDasharray="5 3" strokeWidth="1.2"/>
                <text x={w - padR - 2} y={iy(base.fireTarget) - 4} fill="var(--ns-fg-muted)" fontSize="11" textAnchor="end" fontFamily="var(--ns-font-mono)">
                  FIRE {fmt.money(base.fireTarget)}
                </text>

                {/* Bear range fill */}
                <path d={makeArea(bear.points)} fill="url(#fire-bear-grad)"/>
                <path d={makePath(bear.points)} stroke="var(--ns-fg-dim)" strokeWidth="1" fill="none" strokeDasharray="3 2" opacity="0.45"/>

                {/* Bull line */}
                <path d={makePath(bull.points)} stroke="var(--ns-chart-2)" strokeWidth="1.2" fill="none" strokeDasharray="5 2" opacity="0.6"/>

                {/* Base area + line */}
                <path d={makeArea(base.points)} fill="url(#fire-grad)"/>
                <path d={makePath(base.points)} stroke="var(--ns-accent)" strokeWidth="2" fill="none"/>

                {/* FIRE crossing marker */}
                {base.fireYear != null && (
                  <g>
                    <line x1={fireY} x2={fireY} y1={padT} y2={h - padB} stroke="var(--ns-accent)" strokeDasharray="3 2" strokeWidth="1"/>
                    <circle cx={fireY} cy={iy(base.fireTarget)} r="5" fill="var(--ns-bg)" stroke="var(--ns-accent)" strokeWidth="2"/>
                    <rect x={fireY + 8} y={iy(base.fireTarget) - 28} width={130} height={38} rx="5" fill="var(--ns-bg-card)" stroke="var(--ns-border)"/>
                    <text x={fireY + 16} y={iy(base.fireTarget) - 14} fill="var(--ns-fg-muted)" fontSize="10" fontFamily="var(--ns-font-mono)" letterSpacing="0.06">
                      FIRE ACHIEVED
                    </text>
                    <text x={fireY + 16} y={iy(base.fireTarget) + 2} fill="var(--ns-fg)" fontSize="12" fontFamily="var(--ns-font-mono)" fontWeight="500">
                      +{base.fireYear}y · Age {p.currentAge + base.fireYear}
                    </text>
                  </g>
                )}

                {/* X axis labels */}
                {allPoints.filter((_, i) => i % 5 === 0).map((d) => (
                  <text key={d.y} x={ix(d.y)} y={h - 6} fill="var(--ns-fg-dim)" fontSize="11" textAnchor="middle" fontFamily="var(--ns-font-mono)">
                    {d.age}歲
                  </text>
                ))}
              </svg>

              <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                陰影區間：悲觀 ↔ 樂觀 ±2.5% · Coast-FIRE 達成於 +{base.coastYear ?? '—'}y（可停止儲蓄後仍能自然成長到 FIRE）
              </div>
            </div>

            {/* Monthly breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="ns-card" style={{ padding: 20 }}>
                <div className="ns-eyebrow" style={{ marginBottom: 12 }}>FIRE 三種型態</div>
                {[
                  ['Lean FIRE', p.annualSpend * 0.7, p.swr, 'var(--ns-chart-3)'],
                  ['Regular FIRE', p.annualSpend, p.swr, 'var(--ns-accent)'],
                  ['Fat FIRE', p.annualSpend * 1.5, p.swr, 'var(--ns-chart-2)'],
                ].map((r) => {
                  const target = r[1] / r[2];
                  const yr = Math.round(Math.log((target - p.annualSaving / p.cagr) / (p.currentAssets - p.annualSaving / p.cagr)) / Math.log(1 + p.cagr));
                  return (
                    <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ns-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: r[3] }}/>
                        <span style={{ fontSize: 13 }}>{r[0]}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{fmt.money(target)}</div>
                        <div className="dim mono" style={{ fontSize: 10.5 }}>+{yr > 0 ? yr : '?'}y</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="ns-card" style={{ padding: 20 }}>
                <div className="ns-eyebrow" style={{ marginBottom: 12 }}>達成敏感度</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>儲蓄率每增加 10%，退休提前：</div>
                {[
                  ['目前儲蓄率', ((p.annualSaving / (p.annualSaving + p.annualSpend)) * 100).toFixed(0) + '%', null],
                  ['多存 10%', fmt.money(p.annualSaving * 1.1) + '/yr', 'pos'],
                  ['SWR 3% vs 4%', '+' + (p.annualSpend / 0.03 / 1_000_000).toFixed(1) + 'M target', null],
                  ['報酬多 1%', '約提早 2-3 年', 'pos'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ns-border)', fontSize: 12.5 }}>
                    <span className="muted">{l}</span>
                    <span className={'num ' + (c || '')}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Mobile: FIRE Calculator (simplified) ───────
function NSMobileFireCalc() {
  const [saving, setSaving] = React.useState(580_000);
  const [retireAge, setRetireAge] = React.useState(50);
  const base = fireProjection({ currentAge: 30, retireAge, currentAssets: 8_452_000, annualSaving: saving, cagr: 0.072, annualSpend: 1_400_000, swr: 0.04 });

  return (
    <NSMobileShell active="me">
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>FIRE Calculator</h1>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 100px' }}>
        {/* Result hero */}
        <div className="ns-card" style={{ padding: 20, marginBottom: 14, textAlign: 'center' }}>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>預估達成 FIRE</div>
          <div className="ns-num-lg">{base.fireYear != null ? `+${base.fireYear}y` : '—'}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Age {30 + (base.fireYear ?? 0)} · Target NT${(base.fireTarget / 1_000_000).toFixed(1)}M</div>
          <div style={{ marginTop: 14, height: 90, marginLeft: -8, marginRight: -8 }}>
            <NSAreaChart
              data={base.points.map((d) => d.v)}
              w={360} h={90} padLeft={4} padRight={4} padTop={6} padBot={14}
              yFormat={(v) => (v / 1_000_000).toFixed(0) + 'M'}
            />
          </div>
        </div>

        {/* Sliders */}
        <div className="ns-card" style={{ padding: 18 }}>
          <CalcSlider label="目標退休年齡" value={retireAge} min={35} max={70}
                      format={(v) => v + ' 歲'} onChange={setRetireAge} accent/>
          <CalcSlider label="年儲蓄 / 投入" value={saving} min={0} max={3_000_000} step={50_000}
                      format={(v) => 'NT$' + (v / 10000).toFixed(0) + 'K'} onChange={setSaving} accent/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          {[
            ['FIRE 目標', 'NT$' + (base.fireTarget / 1_000_000).toFixed(1) + 'M'],
            ['Coast-FIRE', base.coastYear != null ? `+${base.coastYear}y` : '—'],
            ['儲蓄率', ((saving / (saving + 1_400_000)) * 100).toFixed(0) + '%'],
            ['月需存', 'NT$' + Math.round(saving / 12).toLocaleString()],
          ].map(([l, v]) => (
            <div className="ns-card" key={l} style={{ padding: 14 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{l}</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </NSMobileShell>
  );
}

Object.assign(window, { NSDesktopFireCalc, NSMobileFireCalc, NSMobileCategoryMgmt });
