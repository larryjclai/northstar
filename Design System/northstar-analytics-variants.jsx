// northstar-analytics-variants.jsx
// Three full-page directions for the Holdings → Analytics redesign.
// All dark, NorthStar lime-native. Green = gain, red = loss.

// Contribution data (報酬貢獻) derived from holdings
const nsAnContrib = [
  { label: '0050.TW', v: 1431488 }, { label: '台積電 2330', v: 958917 },
  { label: '京元電子 2449', v: 372110 }, { label: 'CEG', v: 364610 },
  { label: 'MU', v: 278001 }, { label: '強茂 2481', v: -193335 },
  { label: '其他 80 檔', v: 3636782 },
];
const nsContribFmt = v => (v >= 0 ? '+' : '−') + 'NT$' + Math.abs(Math.round(v / 1000)) + 'K';

const SECTION = { marginTop: 40 };

// ═══════════════════════════════════════════════════════════════════════════
// VARIANT A — Editorial.  Spacious; dark feature bands host the hero visuals.
// ═══════════════════════════════════════════════════════════════════════════
function NSAnVariantA() {
  return (
    <NSAnPageShell badge="NorthStar · 編輯感方向">

      {/* Hero: equity curve + three returns */}
      <div className="ns-card" style={{ padding: 34 }}>
        <NSAnEquityHero />
        <div style={{ marginTop: 28 }}><NSAnThreeReturns /></div>
      </div>

      {/* Feature band — Treemap hero */}
      <div style={SECTION}>
        <NSAnBand deep>
          <NSAnHead kicker="持倉熱度 · HOLDINGS HEATMAP"
            title="你的錢放在哪、誰在發動"
            accent="var(--ns-accent)"
            right={<span className="mono dim" style={{ fontSize: 12 }}>方塊大小＝市值　顏色＝1Y 報酬</span>} />
          <NSTreemap data={nsAnHoldings} w={1080} h={400} />
          <p style={{ margin: '20px 0 0', fontSize: 13, color: 'var(--ns-fg-muted)', lineHeight: 1.6, maxWidth: 720 }}>
            前兩大持倉（0050、台積電）佔組合 <span style={{ color: 'var(--ns-fg)', fontWeight: 600 }}>33.6%</span>，
            且皆為深綠 — 是本期報酬的主引擎。<span className="neg" style={{ fontWeight: 600 }}>強茂 2481</span>、
            <span className="neg" style={{ fontWeight: 600 }}>Bitcoin</span> 為僅有的兩塊紅區，拖累有限。
          </p>
        </NSAnBand>
      </div>

      {/* Alpha (KEEP) */}
      <div style={SECTION} className="ns-card">
        <div style={{ padding: 34 }}>
          <NSAnHead kicker="績效比較 · vs 指標" title="投資組合 vs 0050.TW"
            right={<div className="ns-seg" style={{ fontSize: 11 }}>
              {['3M', '6M', 'YTD', '1Y', 'ALL'].map(v => (
                <button key={v} aria-selected={v === '1Y'}>{v}</button>))}
            </div>} />
          <NSAnAlpha />
        </div>
      </div>

      {/* Feature band — allocation vertical bars */}
      <div style={SECTION}>
        <NSAnBand deep>
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'start' }}>
            <div>
              <NSAnHead kicker="配置 · ALLOCATION" title="產業曝險" />
              <NSAllocBars data={nsAnSectors} h={120} onPick={() => {}} />
            </div>
            <div>
              <NSAnHead kicker="幣別曝險 · CURRENCY" title="持倉的幣別分布" />
              <NSAnCurrency />
              <div style={{ marginTop: 26 }}>
                <NSAnHead kicker="集中度 · CONCENTRATION" title="最大單一持倉" />
                <div style={{ display: 'flex', gap: 28 }}>
                  <div><div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>最大資產類別</div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>股票 63.1%</div></div>
                  <div><div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>最大單一持倉</div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>0050.TW 18.3%</div></div>
                </div>
              </div>
            </div>
          </div>
        </NSAnBand>
      </div>

      {/* Calendar heatmap */}
      <div style={SECTION} className="ns-card">
        <div style={{ padding: 34 }}>
          <NSAnHead kicker="報酬節奏 · DAILY RETURNS" title="一整年的賺賠日曆"
            right={<span className="mono dim" style={{ fontSize: 12 }}>每格＝單日報酬</span>} />
          <NSCalendarHeatmap scale={2.6} cell={16} gap={4} />
        </div>
      </div>

      {/* Dividends (KEEP, multi-year) + Risk */}
      <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="ns-card" style={{ padding: 34 }}>
          <NSAnHead kicker="股利所得 · DIVIDENDS" title="逐年配息成長"
            right={<span className="ns-pill solid-pos" style={{ fontSize: 11 }}>5 年 +79%</span>} />
          <NSAnDividendStats />
          <div style={{ marginTop: 26 }}><NSDividendYears h={170} /></div>
          <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 12 }}>
            <span className="muted">主要來源：<span style={{ color: 'var(--ns-fg)' }}>強茂 2481 · NT$530</span></span>
            <span className="muted">CEG · NT$28</span>
          </div>
        </div>
        <div className="ns-card" style={{ padding: 34 }}>
          <NSAnHead kicker="風險 · RISK" title="波動、下跌與報酬品質" />
          <NSAnRiskKpis cols={2} />
          <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 'var(--ns-r-md)',
            background: 'var(--ns-neg-soft)', border: '1px solid color-mix(in srgb, var(--ns-neg) 30%, transparent)',
            fontSize: 12.5, lineHeight: 1.55 }}>
            <span className="neg" style={{ fontWeight: 600 }}>回撤提醒 · </span>
            <span className="muted">8 月曾回撤 −18.4%，約 7 個交易日後恢復。Sharpe 1.42 顯示承擔的風險獲得合理補償。</span>
          </div>
        </div>
      </div>
    </NSAnPageShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIANT B — Pro Terminal.  Dense 12-col grid; everything visible at once.
// ═══════════════════════════════════════════════════════════════════════════
function NSAnVariantB() {
  return (
    <NSAnPageShell badge="NorthStar · 專業終端方向">
      {/* Top rail: compact hero + 4 risk KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="ns-card" style={{ padding: 24 }}><NSAnEquityHero compact /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
            border: '1px solid var(--ns-border)', borderRadius: 'var(--ns-r-md)', overflow: 'hidden' }}>
            {[
              { l: '期間 TWR', v: `+${nsAn.twr}%`, c: 'var(--ns-pos)' },
              { l: '年化 XIRR', v: `+${nsAn.xirr}%`, c: 'var(--ns-pos)' },
              { l: 'Alpha', v: `${nsAn.alpha}%`, c: 'var(--ns-neg)' },
            ].map((s, i) => (
              <div key={s.l} style={{ padding: '14px 16px', background: 'var(--ns-bg-card)',
                borderLeft: i ? '1px solid var(--ns-border)' : 'none' }}>
                <div className="ns-eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>{s.l}</div>
                <div className="num" style={{ fontSize: 21, fontWeight: 600, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
          <NSAnRiskKpis cols={2} />
        </div>
      </div>

      {/* Mid: treemap (wide) + calendar (stacked right) */}
      <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div className="ns-card" style={{ padding: 24 }}>
          <NSAnHead kicker="持倉熱度 · HEATMAP" title="持倉 · 市值 × 報酬"
            right={<span className="mono dim" style={{ fontSize: 11 }}>大小＝市值　色＝報酬</span>} />
          <NSTreemap data={nsAnHoldings} w={680} h={420} gap={3} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ns-card" style={{ padding: 24 }}>
            <NSAnHead kicker="報酬節奏" title="賺賠日曆" />
            <NSCalendarHeatmap scale={2.6} cell={11} gap={2.5} />
          </div>
          <div className="ns-card" style={{ padding: 24 }}>
            <NSAnHead kicker="幣別曝險" title="幣別分布" />
            <NSAnCurrency />
          </div>
        </div>
      </div>

      {/* Alpha (KEEP) + contribution */}
      <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div className="ns-card" style={{ padding: 24 }}>
          <NSAnHead kicker="績效比較 · vs 指標" title="投資組合 vs 0050.TW" />
          <NSAnAlpha compact />
        </div>
        <div className="ns-card" style={{ padding: 24 }}>
          <NSAnHead kicker="報酬貢獻" title="哪些持倉驅動了報酬" />
          <NSDivergeBars items={nsAnContrib} fmt={nsContribFmt} h={34} />
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--ns-border)',
            display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12 }}>期間合計</span>
            <span className="num pos" style={{ fontSize: 14, fontWeight: 600 }}>+NT$7,227,243</span>
          </div>
        </div>
      </div>

      {/* Bottom: allocation + dividends */}
      <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="ns-card" style={{ padding: 24 }}>
          <NSAnHead kicker="配置 · ALLOCATION" title="產業曝險" />
          <NSAllocBars data={nsAnSectors} h={88} />
        </div>
        <div className="ns-card" style={{ padding: 24 }}>
          <NSAnHead kicker="股利所得" title="逐年配息"
            right={<span className="ns-pill solid-pos" style={{ fontSize: 11 }}>5 年 +79%</span>} />
          <NSAnDividendStats />
          <div style={{ marginTop: 22 }}><NSDividendYears h={150} /></div>
        </div>
      </div>
    </NSAnPageShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIANT C — Guided.  Plain-language insights for ordinary investors.
// ═══════════════════════════════════════════════════════════════════════════
function NSAnInsight({ icon, tone, children }) {
  const c = tone === 'pos' ? 'var(--ns-pos)' : tone === 'neg' ? 'var(--ns-neg)' : 'var(--ns-accent)';
  return (
    <div style={{ display: 'flex', gap: 14, padding: '18px 20px', borderRadius: 'var(--ns-r-lg)',
      background: 'var(--ns-bg-card)', border: '1px solid var(--ns-border)' }}>
      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--ns-r-md)',
        background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <NSIcon name={icon} size={20} />
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.6, alignSelf: 'center' }}>{children}</div>
    </div>
  );
}

function NSAnVariantC() {
  const heroRet = React.useMemo(() => {
    const s = nsSeries(180, 100, 0.022, 0.0035);
    return s.map(v => (v / s[0] - 1) * 100);
  }, []);
  return (
    <NSAnPageShell badge="NorthStar · 引導式方向">

      {/* Headline number, friendly */}
      <div className="ns-card" style={{ padding: 36, textAlign: 'center',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--ns-pos) 10%, var(--ns-bg-card)), var(--ns-bg-card))' }}>
        <div className="ns-eyebrow" style={{ marginBottom: 14 }}>過去一年，你的投資組合</div>
        <div className="num" style={{ fontSize: 84, fontWeight: 600, color: 'var(--ns-pos)',
          letterSpacing: '-0.03em', lineHeight: 0.95 }}>+{nsAn.retPct}%</div>
        <div style={{ marginTop: 16, fontSize: 16, color: 'var(--ns-fg-muted)' }}>
          市值從 <span style={{ color: 'var(--ns-fg)', fontWeight: 600 }}>{nsMoney(nsAn.startVal)}</span> 成長到
          <span style={{ color: 'var(--ns-fg)', fontWeight: 600 }}> {nsMoney(nsAn.endVal)}</span>，
          多了 <span className="pos" style={{ fontWeight: 600 }}>{nsMoney(nsAn.change)}</span>。
        </div>
        <div style={{ height: 150, marginTop: 24 }}>
          <NSAreaChart data={heroRet}
            w={760} h={150} color="var(--ns-pos)" yFormat={v => v.toFixed(0) + '%'} />
        </div>
      </div>

      {/* Plain-language insights */}
      <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <NSAnInsight icon="sparkle" tone="pos">
          表現最好的是 <strong>台積電（+42%）</strong> 和 <strong>CEG（+52%）</strong>，兩檔合計貢獻超過 NT$130 萬。
        </NSAnInsight>
        <NSAnInsight icon="chart" tone="neg">
          同期 <strong>0050 指標漲了 116%</strong>，你落後 16.7% — 主因是過度集中、且少了幾檔大權值股。
        </NSAnInsight>
        <NSAnInsight icon="coin" tone="pos">
          這一年領到 <strong>NT$558 股利</strong>，且配息已連續 5 年成長，是穩定的被動收入。
        </NSAnInsight>
        <NSAnInsight icon="target" tone="warn">
          最深一次下跌是 <strong>−18.4%</strong>（8 月），約兩週就恢復 — 波動在可承受範圍。
        </NSAnInsight>
      </div>

      {/* Treemap with guidance */}
      <div style={{ ...SECTION }} className="ns-card">
        <div style={{ padding: 30 }}>
          <NSAnHead kicker="你的持倉地圖" title="哪幾檔撐起你的組合？" />
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--ns-fg-muted)', lineHeight: 1.6, maxWidth: 640 }}>
            方塊愈大代表投入愈多錢，<span className="pos" style={{ fontWeight: 600 }}>愈綠</span>代表這一年漲愈多、
            <span className="neg" style={{ fontWeight: 600 }}>愈紅</span>代表跌愈多。一眼看出你重壓在哪、誰在幫你賺錢。
          </p>
          <NSTreemap data={nsAnHoldings} w={1040} h={360} />
        </div>
      </div>

      {/* Simple allocation + dividends */}
      <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="ns-card" style={{ padding: 30 }}>
          <NSAnHead kicker="你買了哪些產業" title="產業分布" />
          <NSAllocBars data={nsAnSectors} h={96} />
        </div>
        <div className="ns-card" style={{ padding: 30 }}>
          <NSAnHead kicker="被動收入" title="每年領到的股利" />
          <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--ns-fg-muted)', lineHeight: 1.6 }}>
            股利就是公司分給你的現金。你的配息逐年增加，今年領到 <span className="pos" style={{ fontWeight: 600 }}>NT$558</span>。
          </p>
          <NSDividendYears h={160} />
        </div>
      </div>

      {/* Alpha kept, framed gently */}
      <div style={{ ...SECTION }} className="ns-card">
        <div style={{ padding: 30 }}>
          <NSAnHead kicker="跟大盤比一比" title="你 vs 0050 台灣 50 指標" />
          <NSAnAlpha compact />
        </div>
      </div>
    </NSAnPageShell>
  );
}

Object.assign(window, { NSAnVariantA, NSAnVariantB, NSAnVariantC });
