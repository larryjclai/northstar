// northstar-interactions.jsx — Standalone interaction showcases

// Big numpad close-up + quick-add bar variants
function NSInteractionNumpad() {
  return (
    <div className="ns-board" style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="ns-eyebrow">Interaction · 01</div>
        <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, margin: '6px 0 8px', letterSpacing: -0.02, fontWeight: 600 }}>
          Calculator quick-add
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 520 }}>
          記帳的核心動作。Amount → Category → Account 三步搞定。支援表達式 (<span className="mono">120+85+30</span>)，
          按鍵採等寬數字，類別卡片可長按重新排序。
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Step diagram */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { n: 1, title: '輸入金額', body: '點 + 鍵彈出 numpad，可直接輸入表達式（120+85）即時運算' },
            { n: 2, title: '選類別', body: '6 格快速分類；可長按開展全 24 類；新類別記住排序' },
            { n: 3, title: '選帳戶', body: '預設用上次的帳戶；信用卡顯示本期應繳餘額即時更新' },
          ].map((s) => (
            <div key={s.n} className="ns-card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 999,
                background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--ns-font-mono)', fontWeight: 600, fontSize: 13,
              }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Numpad visual */}
        <div style={{ width: 280, background: 'var(--ns-bg-elev)', borderRadius: 'var(--ns-r-lg)', border: '1px solid var(--ns-border)', padding: 16 }}>
          <div className="ns-eyebrow" style={{ textAlign: 'center', marginBottom: 8 }}>金額 · TWD</div>
          <div className="mono" style={{ fontSize: 36, fontWeight: 500, textAlign: 'center', letterSpacing: -0.04, marginBottom: 4 }}>
            <span className="dim">−</span>120<span className="dim">+</span>85
          </div>
          <div className="dim mono" style={{ textAlign: 'center', fontSize: 11, marginBottom: 14 }}>= 205</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {['7','8','9','+','4','5','6','−','1','2','3','=','.','0','←','✓'].map((k) => {
              const op = ['+','−','=','←'].includes(k);
              const ok = k === '✓';
              return (
                <button key={k} style={{
                  fontFamily: 'var(--ns-font-mono)', fontSize: 18, fontWeight: 500,
                  height: 40, borderRadius: 'var(--ns-r-sm)', cursor: 'pointer',
                  background: ok ? 'var(--ns-accent)' : 'var(--ns-bg-card)',
                  color: ok ? 'var(--ns-accent-fg)' : op ? 'var(--ns-fg-muted)' : 'var(--ns-fg)',
                  border: '1px solid var(--ns-border)',
                }}>{k}</button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function NSInteractionQuickBar() {
  const variants = [
    { kind: 'Default', text: '', ph: 'Quick add · 試試「拿鐵 120 信用卡」或「買 2330.TW 5股」' },
    { kind: 'NL parsed · expense', text: '拿鐵 120 信用卡', parsed: true, type: 'expense' },
    { kind: 'NL parsed · investment', text: '買 2330.TW 5 股 @ 1042', parsed: true, type: 'invest' },
    { kind: 'Confirm transfer', text: '轉 USD 1500 from 玉山 to BoA', parsed: true, type: 'transfer' },
  ];
  return (
    <div className="ns-board" style={{ padding: 40 }}>
      <div>
        <div className="ns-eyebrow">Interaction · 02</div>
        <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, margin: '6px 0 8px', letterSpacing: -0.02, fontWeight: 600 }}>
          Quick-add bar · desktop
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 580 }}>
          永遠浮在主畫面底部，⌘N 拉焦點。自然語句解析 → 顯示解讀結果 → Enter 確認。Confirm 後才寫入資料庫。
        </p>
      </div>

      <div style={{ marginTop: 28, display: 'grid', gap: 16 }}>
        {variants.map((v) => (
          <div key={v.kind}>
            <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{v.kind}</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--ns-bg-card)',
              border: '1px solid ' + (v.parsed ? 'var(--ns-accent)' : 'var(--ns-border)'),
              boxShadow: v.parsed ? '0 0 0 3px var(--ns-accent-soft), var(--ns-shadow-2)' : 'var(--ns-shadow-2)',
              borderRadius: 999,
              padding: '6px 6px 6px 18px',
            }}>
              <NSIcon name="plus" size={16} strokeWidth={2}/>
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ns-fg)', padding: '8px 8px' }}>
                {v.text || <span className="dim">{v.ph}</span>}
              </span>

              {v.type === 'expense' && (
                <>
                  <span className="ns-pill"><NSIcon name="tag" size={11}/>食物</span>
                  <span className="ns-pill"><span className="mono">−120 TWD</span></span>
                  <span className="ns-pill">Cathay 信用卡</span>
                </>
              )}
              {v.type === 'invest' && (
                <>
                  <span className="ns-pill solid-accent"><NSIcon name="chart" size={11}/><span className="mono">買 5 股 @ 1042</span></span>
                  <span className="ns-pill"><span className="mono">2330.TW</span></span>
                  <span className="ns-pill">富邦證券</span>
                </>
              )}
              {v.type === 'transfer' && (
                <>
                  <span className="ns-pill"><NSIcon name="transfer" size={11}/>1,500 USD</span>
                  <span className="ns-pill"><span className="mono">@31.62</span></span>
                </>
              )}

              <span className="ns-pill" style={{ fontSize: 10.5 }}><span className="mono">⏎</span></span>
              <button className="ns-btn primary" style={{ padding: '8px 16px', borderRadius: 999 }}>
                {v.parsed ? 'Confirm' : 'Add'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 28 }}>
        Tip · 解析失敗時降級為 manual sheet，輸入內容不會丟失。
      </div>
    </div>
  );
}

// Chart richness showcase
function NSInteractionChart() {
  return (
    <div className="ns-board" style={{ padding: 40 }}>
      <div>
        <div className="ns-eyebrow">Interaction · 03</div>
        <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, margin: '6px 0 8px', letterSpacing: -0.02, fontWeight: 600 }}>
          Chart hover & compare
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 580 }}>
          滑鼠移到圖表上 → 出現 crosshair + 標籤 + 對應日期，virtual benchmark 線可疊加比較。雙擊放大區間。
        </p>
      </div>

      <div className="ns-card" style={{ marginTop: 24, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Holdings · vs benchmark</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="ns-num-md">+43.78%</span>
              <span className="dim mono" style={{ fontSize: 12 }}>1Y · IRR 16.4%</span>
            </div>
          </div>
          <div className="ns-seg">
            {['1D','1W','1M','3M','YTD','1Y','ALL'].map((v) => (
              <button key={v} aria-selected={v === '1Y'}>{v}</button>
            ))}
          </div>
        </div>

        <NSAreaChart
          data={nsSeries(220, 100, 0.018, 0.0028)}
          secondary={nsSeries(220, 100, 0.012, 0.0014)}
          w={1080} h={300}
          xLabels={Array.from({ length: 220 }, (_, i) => `D${i+1}`)}
          yFormat={(v) => '+' + (v - 100).toFixed(0) + '%'}
          highlightIdx={160}
        />

        <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12.5 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, background: 'var(--ns-accent)' }}/>
            <span>Portfolio</span> <span className="mono pos">+43.78%</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, background: 'var(--ns-fg-dim)', borderStyle: 'dashed' }}/>
            <span>0050.TW</span> <span className="mono">+22.10%</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, background: 'var(--ns-fg-dim)' }}/>
            <span>S&P 500</span> <span className="mono">+19.84%</span>
          </span>
          <span style={{ flex: 1 }}/>
          <button className="ns-btn ghost" style={{ fontSize: 12 }}><NSIcon name="plus" size={12} strokeWidth={2}/>Add benchmark</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NSInteractionNumpad, NSInteractionQuickBar, NSInteractionChart });
