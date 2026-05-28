// northstar-extra.jsx — Additional screens: Goals/FIRE, Connect/Settings, Onboarding

// ─────── Goals · FIRE (Desktop) ───────
function NSDesktopGoals({ onNavigate } = {}) {
  const yearsProjection = Array.from({ length: 28 }, (_, i) => {
    // simple compound: 8% return on portfolio, contribute 600k/year
    const start = 8_452_000;
    const cagr = 0.072;
    const annualSaving = 580_000;
    let v = start;
    for (let y = 0; y < i; y++) v = v * (1 + cagr) + annualSaving;
    return v;
  });
  const fireTarget = 35_000_000; // 1M USD ~ NT$31.5M
  const fireYear = yearsProjection.findIndex((v) => v >= fireTarget);
  const labels = Array.from({ length: 28 }, (_, i) => `+${i}y`);

  const goals = [
    { name: '緊急預備金', icon: '🚨', color: 'var(--ns-chart-2)', target: 360_000, current: 360_000, pct: 100, eta: '已達成', sub: '6 個月支出 · NTD' },
    { name: 'FIRE · 財務獨立', icon: '⭐', color: 'var(--ns-chart-1)', target: 35_000_000, current: 8_452_000, pct: 24.1, eta: '預估 2042 · 16 年後', sub: '目標 25× 年支出' },
    { name: '小孩教育金', icon: '🎓', color: 'var(--ns-chart-3)', target: 3_000_000, current: 820_000, pct: 27.3, eta: '預估 2034', sub: '台大 4 年 + 留學' },
    { name: '頭期款 · 信義區', icon: '🏠', color: 'var(--ns-chart-4)', target: 6_000_000, current: 2_140_000, pct: 35.7, eta: '預估 2030', sub: '40% 頭期 / 1500 萬' },
    { name: '日本旅行', icon: '🗾', color: 'var(--ns-chart-5)', target: 150_000, current: 92_000, pct: 61.3, eta: '2026 秋' , sub: '京都 + 滋賀' },
  ];

  return (
    <NSDesktopShell active="goals" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Long-term progress</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Goals & FIRE</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="settings" size={14}/>調整參數</button>
            <button className="ns-btn" onClick={() => onNavigate && onNavigate('fire-calc')}><NSIcon name="sparkle" size={14}/>FIRE Calculator</button>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新目標</button>
          </div>
        </div>

        {/* FIRE hero */}
        <div className="ns-card" style={{ padding: 28, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'center' }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>FIRE · 25× 年支出</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="ns-num-lg">NT$8.45M</span>
                <span className="muted mono" style={{ fontSize: 13 }}>/ NT$35M</span>
              </div>
              <div style={{ marginTop: 14, marginBottom: 6, height: 10, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                <div style={{ width: '24.1%', height: '100%', background: 'linear-gradient(90deg, var(--ns-accent), var(--ns-chart-2))' }}/>
              </div>
              <div className="mono dim" style={{ fontSize: 11 }}>24.1% · 預估 16 年後達成 (2042)</div>

              <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <div className="muted">年儲蓄</div>
                  <div className="num" style={{ fontSize: 17, fontWeight: 500 }}>NT$580K</div>
                </div>
                <div>
                  <div className="muted">假設報酬率</div>
                  <div className="num" style={{ fontSize: 17, fontWeight: 500 }}>7.2%</div>
                </div>
                <div>
                  <div className="muted">年支出基準</div>
                  <div className="num" style={{ fontSize: 17, fontWeight: 500 }}>NT$1.4M</div>
                </div>
                <div>
                  <div className="muted">SWR</div>
                  <div className="num" style={{ fontSize: 17, fontWeight: 500 }}>4.0%</div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="ns-eyebrow">Projection · 28 年</span>
                <div className="ns-seg">
                  <button aria-selected>保守 5%</button>
                  <button aria-selected>基準 7.2%</button>
                  <button>樂觀 10%</button>
                </div>
              </div>
              <NSAreaChart
                data={yearsProjection} w={780} h={220} xLabels={labels}
                yFormat={(v) => 'NT$' + (v / 1_000_000).toFixed(1) + 'M'}
                highlightIdx={fireYear >= 0 ? fireYear : null}
              />
              <div style={{ display: 'flex', gap: 18, fontSize: 11.5, marginTop: 8 }}>
                <span className="muted">⭐ FIRE 達成於 +{fireYear}y · 2042</span>
                <span className="muted">Coast-FIRE 在 +6y 達成 (NT$13M)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Goal list */}
        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>5 active goals</h3>
            <div style={{ flex: 1 }}/>
            <div className="ns-seg">
              <button aria-selected>All</button>
              <button>Short-term</button>
              <button>Mid-term</button>
              <button>Long-term</button>
            </div>
          </div>
          {goals.map((g, i) => {
            const done = g.pct >= 100;
            return (
              <div key={g.name} style={{
                display: 'grid', gridTemplateColumns: '44px 1.4fr 1fr 1.4fr 1fr 24px',
                gap: 16, alignItems: 'center', padding: '18px 22px',
                borderTop: i ? '1px solid var(--ns-border)' : 'none',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 'var(--ns-r-sm)',
                  background: 'color-mix(in srgb, ' + g.color + ' 18%, var(--ns-bg-elev))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>{g.icon}</div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{g.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{g.sub}</div>
                </div>
                <div>
                  <div className="num" style={{ fontSize: 14.5 }}>NT${g.current.toLocaleString()}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>/ NT${g.target.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                    <div style={{ width: Math.min(g.pct, 100) + '%', height: '100%', background: g.color, borderRadius: 99 }}/>
                  </div>
                  <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>{g.pct.toFixed(1)}%</div>
                </div>
                <div>
                  {done ? (
                    <span className="ns-pill solid-pos"><NSIcon name="check" size={11} strokeWidth={2.2}/>達成</span>
                  ) : (
                    <span className="muted mono" style={{ fontSize: 12 }}>{g.eta}</span>
                  )}
                </div>
                <NSIcon name="chevRight" size={14}/>
              </div>
            );
          })}
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Connect / Settings (Desktop) ───────
function NSDesktopConnect({ onNavigate } = {}) {
  const settingsTabs = [
    { id: 'account',  label: 'Account', icon: 'users' },
    { id: 'connect',  label: 'Connect & Sync', icon: 'refresh', active: true },
    { id: 'household',label: 'Household', icon: 'users' },
    { id: 'recovery', label: 'Recovery Kit', icon: 'lock' },
    { id: 'privacy',  label: 'Privacy', icon: 'eye' },
    { id: 'data',     label: 'Data · Import/Export', icon: 'download' },
    { id: 'fx',       label: 'Currencies & FX', icon: 'transfer' },
  ];

  return (
    <NSDesktopShell active="connect" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28 }}>
        <aside>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 18 }}>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 22, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Settings</h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {settingsTabs.map((t) => (
              <div key={t.id} className={'ns-nav-link' + (t.active ? ' active' : '')}>
                <NSIcon name={t.icon} size={14}/><span style={{ fontSize: 13 }}>{t.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <div>
          <div style={{ marginBottom: 24, marginTop: 32 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Connect · Sync</div>
            <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 26, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>End-to-end encrypted sync</h2>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6, maxWidth: 600 }}>
              你的資料只在已信任的裝置上能解密。伺服器只看見密文與時間戳記。
            </p>
          </div>

          {/* Plan card */}
          <div className="ns-card" style={{ padding: 22, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Current plan</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600 }}>Connect Duo</h3>
                  <span className="ns-pill solid-pos">Active · 月繳</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Household 共享 · 加密 sync · 雲端附件備份</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ns-btn">Manage plan</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid var(--ns-border)', paddingTop: 14, marginTop: 6 }}>
              {[
                ['Sync status', 'Up to date · 2m ago', 'pos'],
                ['Encrypted records', '14,820 envelopes', 'fg'],
                ['Conflicts', '0 pending', 'fg'],
                ['Outbox', '0 pending', 'fg'],
              ].map((r, i) => (
                <div key={i}>
                  <div className="ns-eyebrow" style={{ marginBottom: 4 }}>{r[0]}</div>
                  <div className={'num ' + (r[2] === 'pos' ? 'pos' : '')} style={{ fontSize: 15, fontWeight: 500 }}>{r[1]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Devices */}
          <div className="ns-card" style={{ padding: 0, marginBottom: 18 }}>
            <div style={{ padding: '16px 22px 12px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>Trusted devices · 3</h3>
              <div style={{ flex: 1 }}/>
              <button className="ns-btn"><NSIcon name="plus" size={13} strokeWidth={2}/>Pair new device</button>
            </div>
            {[
              { name: 'MacBook Pro · 家瑋',     sub: 'macOS 26 · 此裝置 · 上次活動 剛剛', tag: 'This device', tagAccent: true },
              { name: 'iPhone 17 · 家瑋',       sub: 'iOS 26 · 上次活動 2 小時前', tag: 'Mobile' },
              { name: 'iPad Air · 共用',         sub: 'iPadOS 26 · 上次活動 3 天前', tag: 'Shared' },
            ].map((d, i) => (
              <div key={i} className="ns-row" style={{ gap: 14 }}>
                <NSMark label={d.name.includes('Mac') ? '⌥' : d.name.includes('iPhone') ? '◆' : '▭'} color="var(--ns-chart-2)" size={36}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</span>
                    <span className={'ns-pill' + (d.tagAccent ? ' solid-accent' : '')} style={{ fontSize: 10.5 }}>{d.tag}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{d.sub}</div>
                </div>
                <button className="ns-btn ghost">Manage</button>
              </div>
            ))}
          </div>

          {/* Recovery Kit */}
          <div className="ns-card" style={{ padding: 22, marginBottom: 18, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <div style={{
              width: 46, height: 46, borderRadius: 'var(--ns-r-md)', flexShrink: 0,
              background: 'var(--ns-accent-soft)', color: 'var(--ns-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <NSIcon name="lock" size={20}/>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recovery Kit</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 17, fontWeight: 500 }}>已建立 · 2025/11/12</h3>
                <span className="ns-pill solid-pos"><NSIcon name="check" size={10} strokeWidth={2.2}/>Confirmed</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: 0, maxWidth: 580 }}>
                Recovery Kit 是你唯一的後備鑰匙。如果信任的裝置全部遺失，這份 24 字組合是復原帳號的唯一方式。
                Northstar 不保留這份資料。
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <button className="ns-btn"><NSIcon name="download" size={13}/>下載 PDF</button>
              <button className="ns-btn ghost" style={{ fontSize: 12 }}>重新產生</button>
            </div>
          </div>

          {/* Household */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{ padding: '16px 22px 12px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>Household · 陳家</h3>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>使用獨立 Household Space Key · 你的私人 vault 不會被分享</div>
              </div>
              <div style={{ flex: 1 }}/>
              <button className="ns-btn"><NSIcon name="plus" size={13} strokeWidth={2}/>邀請成員</button>
            </div>
            {[
              { name: '家瑋', sub: 'you · owner · joined 2024/03', mark: '家', color: 'var(--ns-chart-1)', tag: 'Owner' },
              { name: '佩琪', sub: 'partner · joined 2024/05 · 2 shared accounts', mark: '佩', color: 'var(--ns-chart-4)' },
            ].map((m, i) => (
              <div key={i} className="ns-row" style={{ gap: 14 }}>
                <NSMark label={m.mark} color={m.color} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</span>
                    {m.tag && <span className="ns-pill solid-accent" style={{ fontSize: 10.5 }}>{m.tag}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.sub}</div>
                </div>
                <button className="ns-btn ghost"><NSIcon name="dots" size={14}/></button>
              </div>
            ))}
            <div style={{
              padding: '12px 22px', borderTop: '1px solid var(--ns-border)',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ns-fg-muted)',
            }}>
              <NSIcon name="lock" size={12}/>
              共享 2 個帳戶：玉山活儲、Cathay World Card。私人 vault 不會出現在 household 視圖。
            </div>
          </div>
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Onboarding (Desktop) ───────
function NSDesktopOnboarding({ onNavigate } = {}) {
  const [step, setStep] = React.useState(2);
  const steps = ['歡迎', '加入帳戶', '初次同步', '完成'];

  return (
    <div className="ns-board" style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Top bar */}
      <header style={{
        padding: '20px 32px', display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--ns-border)',
      }}>
        <NSLogo />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center' }}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: i < step ? 'var(--ns-accent)' : i === step ? 'var(--ns-fg)' : 'var(--ns-bg-hover)',
                  color: i <= step ? 'var(--ns-accent-fg)' : 'var(--ns-fg-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--ns-font-mono)', fontWeight: 600, fontSize: 11,
                }}>
                  {i < step ? <NSIcon name="check" size={11} strokeWidth={2.5}/> : i + 1}
                </div>
                <span style={{ fontSize: 13, fontWeight: i === step ? 500 : 400, color: i === step ? 'var(--ns-fg)' : 'var(--ns-fg-dim)' }}>{s}</span>
              </div>
              {i < steps.length - 1 && <span className="dim" style={{ fontSize: 12 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <button className="ns-btn ghost">略過</button>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ maxWidth: 760, width: '100%' }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8, color: 'var(--ns-accent)' }}>Step 2 of 4</div>
          <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 36, margin: '0 0 12px', letterSpacing: -0.025, fontWeight: 600 }}>
            加入你的帳戶
          </h1>
          <p className="muted" style={{ fontSize: 15, margin: '0 0 28px', maxWidth: 540, lineHeight: 1.55 }}>
            Northstar 不會自動連線到你的銀行。你可以選擇匯入 CSV、手動建立、或先用示範資料逛逛。
            所有資料只存在你的本機。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
            {[
              { icon: 'upload',  title: '匯入 CSV', sub: '從券商或記帳 app 匯出交易紀錄。Northstar 自動辨識欄位。', tag: '推薦' },
              { icon: 'plus',    title: '手動新增', sub: '一張表單建立第一個帳戶。最快 30 秒。', tag: null },
              { icon: 'sparkle', title: '示範資料', sub: '載入虛擬家庭資料逛一圈。隨時可清除。', tag: 'Demo' },
            ].map((o, i) => (
              <div key={i} className="ns-card" style={{
                padding: 22, cursor: 'pointer',
                outline: i === 0 ? '1.5px solid var(--ns-accent)' : 'none',
                outlineOffset: -1,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--ns-r-sm)',
                  background: i === 0 ? 'var(--ns-accent)' : 'var(--ns-bg-elev)',
                  color: i === 0 ? 'var(--ns-accent-fg)' : 'var(--ns-fg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <NSIcon name={o.icon} size={18}/>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 600 }}>{o.title}</h3>
                  {o.tag && <span className="ns-pill" style={{ fontSize: 10.5 }}>{o.tag}</span>}
                </div>
                <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{o.sub}</p>
              </div>
            ))}
          </div>

          {/* CSV preview */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 14, fontWeight: 500 }}>fubon-2026-05.csv · 預覽 3/142 列</h3>
              <span className="ns-pill solid-pos" style={{ marginLeft: 12, fontSize: 10.5 }}>欄位已對應</span>
              <div style={{ flex: 1 }}/>
              <a className="muted" style={{ fontSize: 12 }}>重新對應欄位</a>
            </div>
            <div style={{ padding: '6px 22px 6px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0,
                          fontFamily: 'var(--ns-font-mono)', fontSize: 11, color: 'var(--ns-fg-dim)',
                          letterSpacing: 0.06, textTransform: 'uppercase' }}>
              <span>Date</span><span>Symbol</span><span>Side</span><span>Qty</span><span>Price</span>
            </div>
            {[
              ['2026-05-22', '2330.TW', 'BUY',  '100', '1042.00'],
              ['2026-05-15', '0050.TW', 'BUY',  '500', '169.30'],
              ['2026-05-08', 'AAPL',    'SELL', '5',   '198.45'],
            ].map((r, i) => (
              <div key={i} style={{
                padding: '10px 22px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                borderTop: '1px solid var(--ns-border)', fontSize: 13,
                fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums',
              }}>
                <span className="muted">{r[0]}</span>
                <span>{r[1]}</span>
                <span className={r[2] === 'BUY' ? 'pos' : 'neg'}>{r[2]}</span>
                <span style={{ textAlign: 'left' }}>{r[3]}</span>
                <span>{r[4]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        padding: '16px 32px', display: 'flex', alignItems: 'center',
        borderTop: '1px solid var(--ns-border)',
      }}>
        <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <NSIcon name="lock" size={12}/> 你的資料只存在這台電腦
        </div>
        <div style={{ flex: 1 }}/>
        <button className="ns-btn ghost" onClick={() => setStep(Math.max(0, step - 1))}>← 上一步</button>
        <button className="ns-btn primary" onClick={() => setStep(Math.min(3, step + 1))} style={{ marginLeft: 8 }}>
          匯入 142 筆 →
        </button>
      </footer>
    </div>
  );
}

// ─────── Mobile Goals ───────
function NSMobileGoals() {
  const goals = [
    { name: 'FIRE · 財務獨立', icon: '⭐', color: 'var(--ns-chart-1)', target: 35_000_000, current: 8_452_000, pct: 24.1, eta: '預估 +16y · 2042' },
    { name: '緊急預備金', icon: '🚨', color: 'var(--ns-chart-2)', target: 360_000, current: 360_000, pct: 100, eta: '已達成' },
    { name: '頭期款 · 信義區', icon: '🏠', color: 'var(--ns-chart-4)', target: 6_000_000, current: 2_140_000, pct: 35.7, eta: '預估 +4y · 2030' },
    { name: '小孩教育金', icon: '🎓', color: 'var(--ns-chart-3)', target: 3_000_000, current: 820_000, pct: 27.3, eta: '預估 +8y' },
    { name: '日本旅行', icon: '🗾', color: 'var(--ns-chart-5)', target: 150_000, current: 92_000, pct: 61.3, eta: '2026 秋' },
  ];
  return (
    <NSMobileShell active="me">
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="ns-eyebrow">5 active goals</div>
          <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--ns-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>Goals</h1>
        </div>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="plus" size={16} strokeWidth={2}/></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 100px' }}>
        {/* FIRE hero card */}
        <div className="ns-card" style={{ padding: 20, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>FIRE · Financial Independence</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span className="ns-num-md">24.1%</span>
            <span className="muted mono" style={{ fontSize: 12 }}>NT$8.45M / 35M</span>
          </div>
          <div style={{ marginTop: 12, height: 10, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
            <div style={{ width: '24.1%', height: '100%', background: 'linear-gradient(90deg, var(--ns-accent), var(--ns-chart-2))' }}/>
          </div>
          <div className="dim mono" style={{ fontSize: 11, marginTop: 6 }}>達成於 2042 · +16y · 假設 7.2% / 年</div>

          <div style={{ marginTop: 14, height: 90, marginLeft: -8, marginRight: -8 }}>
            <NSAreaChart
              data={Array.from({ length: 28 }, (_, i) => {
                const cagr = 0.072; const ann = 580000;
                let v = 8_452_000; for (let y = 0; y < i; y++) v = v * (1+cagr) + ann;
                return v;
              })}
              w={360} h={90} padLeft={4} padRight={4} padTop={6} padBot={14}
              yFormat={(v) => (v/1_000_000).toFixed(0)+'M'}
            />
          </div>
        </div>

        {goals.slice(1).map((g) => (
          <div key={g.name} className="ns-card" style={{ padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ns-r-sm)',
                background: 'color-mix(in srgb, ' + g.color + ' 18%, var(--ns-bg-elev))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>{g.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</div>
                <div className="muted mono" style={{ fontSize: 11 }}>{g.eta}</div>
              </div>
              {g.pct >= 100 ? (
                <span className="ns-pill solid-pos"><NSIcon name="check" size={10} strokeWidth={2.2}/></span>
              ) : (
                <span className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{g.pct.toFixed(0)}%</span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
              <div style={{ width: Math.min(g.pct, 100) + '%', height: '100%', background: g.color }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 11 }}>NT${g.current.toLocaleString()}</span>
              <span className="mono dim" style={{ fontSize: 11 }}>/ NT${g.target.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </NSMobileShell>
  );
}

// ─────── Mobile Onboarding ───────
function NSMobileOnboarding() {
  return (
    <div className="ns-board" style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 52 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 22px 16px', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
          {[0,1,2,3].map((i) => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 99,
              background: i <= 1 ? 'var(--ns-accent)' : 'var(--ns-bg-hover)',
            }}/>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8, color: 'var(--ns-accent)' }}>STEP 2 OF 4</div>
          <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: '0 0 10px', letterSpacing: -0.025, fontWeight: 600, lineHeight: 1.1 }}>
            選一個方式
            <br/>加入第一個帳戶
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
            資料全部在這支手機。你的銀行或券商不會被連線。
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: 'upload',  title: '匯入 CSV',   sub: '從券商 / 記帳 app 匯出', tag: '推薦' },
              { icon: 'plus',    title: '手動新增',   sub: '最快 30 秒' },
              { icon: 'sparkle', title: '示範資料',   sub: '先用虛擬資料逛逛' },
            ].map((o, i) => (
              <div key={o.title} className="ns-card" style={{
                padding: 18, display: 'flex', alignItems: 'center', gap: 14,
                outline: i === 0 ? '1.5px solid var(--ns-accent)' : 'none',
                outlineOffset: -1,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--ns-r-sm)',
                  background: i === 0 ? 'var(--ns-accent)' : 'var(--ns-bg-elev)',
                  color: i === 0 ? 'var(--ns-accent-fg)' : 'var(--ns-fg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <NSIcon name={o.icon} size={18}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 500 }}>{o.title}</span>
                    {o.tag && <span className="ns-pill" style={{ fontSize: 10.5 }}>{o.tag}</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{o.sub}</div>
                </div>
                <NSIcon name="chevRight" size={14}/>
              </div>
            ))}
          </div>
        </div>

        <div style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--ns-fg-muted)' }}>
          <NSIcon name="lock" size={12}/> 你的資料只存在這支手機
        </div>
      </div>

      <div style={{ padding: '12px 22px 30px', borderTop: '1px solid var(--ns-border)', display: 'flex', gap: 10 }}>
        <button className="ns-btn" style={{ flex: '0 0 80px', justifyContent: 'center', padding: '14px 0', borderRadius: 999 }}>上一步</button>
        <button className="ns-btn primary" style={{ flex: 1, justifyContent: 'center', padding: '14px 0', borderRadius: 999 }}>繼續 →</button>
      </div>
    </div>
  );
}

Object.assign(window, { NSDesktopGoals, NSDesktopConnect, NSDesktopOnboarding, NSMobileGoals, NSMobileOnboarding });
