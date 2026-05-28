// northstar-cashflow-detail.jsx — Cash Flow detail + Category management

// ─────── Desktop: Cash Flow Detail (transaction clicked) ───────
function NSDesktopCashFlowDetail({ onNavigate } = {}) {
  const [editing, setEditing] = React.useState(false);

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(4px)', zIndex: 10 }}/>

      {/* Side sheet */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, zIndex: 11,
        background: 'var(--ns-bg-elev)', borderLeft: '1px solid var(--ns-border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <NSMark label="UB" color="var(--ns-chart-4)" size={40}/>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 600 }}>Uber</h2>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>今天 09:10 · 信用卡 · 支出</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ns-btn icon" onClick={() => setEditing(!editing)}><NSIcon name="settings" size={14}/></button>
            <button className="ns-btn icon"><NSIcon name="dots" size={14}/></button>
            <button className="ns-btn ghost icon" onClick={() => onNavigate && onNavigate('cashflow')}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {/* Amount hero */}
          <div style={{ textAlign: 'center', padding: '16px 0 22px', borderBottom: '1px solid var(--ns-border)', marginBottom: 20 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>支出 · TWD</div>
            <div className="mono" style={{ fontSize: 52, fontWeight: 500, letterSpacing: -0.04 }}>
              <span className="dim">−NT$</span>250
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: '日期時間', value: '2026-05-27  09:10', icon: 'calendar' },
              { label: '帳戶',     value: 'Cathay World Card · 信用卡',   icon: 'wallet' },
              { label: '分類',     value: '交通',                           icon: 'tag', pill: true },
              { label: '備註',     value: 'UberX to 台北車站',              icon: 'dots' },
            ].map((f) => (
              <div key={f.label} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px', borderRadius: 'var(--ns-r-md)',
                background: 'var(--ns-bg-card)', border: '1px solid var(--ns-border)',
              }}>
                <NSIcon name={f.icon} size={15}/>
                <div style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 11 }}>{f.label}</div>
                  {f.pill
                    ? <span className="ns-pill" style={{ marginTop: 4, display: 'inline-flex' }}>{f.value}</span>
                    : <div style={{ fontSize: 14, marginTop: 2 }}>{f.value}</div>}
                </div>
                {editing && <NSIcon name="chevRight" size={13}/>}
              </div>
            ))}

            {/* Recurring toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 'var(--ns-r-md)',
              background: 'var(--ns-bg-card)', border: '1px solid var(--ns-border)',
            }}>
              <NSIcon name="refresh" size={15}/>
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ fontSize: 11 }}>Recurring</div>
                <div style={{ fontSize: 14, marginTop: 2 }}>不重複</div>
              </div>
              <div style={{
                width: 32, height: 18, borderRadius: 99,
                background: 'var(--ns-bg-hover)', position: 'relative',
                cursor: 'pointer',
              }}>
                <div style={{ width: 14, height: 14, background: 'var(--ns-fg-dim)', borderRadius: 99, position: 'absolute', top: 2, left: 2 }}/>
              </div>
            </div>

            {/* Similar transactions */}
            <div style={{ marginTop: 6 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 10 }}>Similar · past 30 days</div>
              <div className="ns-card" style={{ padding: 0 }}>
                {[
                  { date: '5/22', amt: 180, note: 'UberX to 南港' },
                  { date: '5/19', amt: 310, note: 'UberX to 信義' },
                  { date: '5/14', amt: 220, note: 'UberX to 松山機場' },
                ].map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', padding: '10px 14px', gap: 12, alignItems: 'center',
                    borderTop: i ? '1px solid var(--ns-border)' : 'none',
                  }}>
                    <span className="mono muted" style={{ fontSize: 12.5, minWidth: 36 }}>{r.date}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{r.note}</span>
                    <span className="num" style={{ fontSize: 13.5 }}>−NT${r.amt}</span>
                  </div>
                ))}
                <div style={{
                  padding: '8px 14px', borderTop: '1px solid var(--ns-border)',
                  display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ns-fg-muted)',
                }}>
                  <span>4 次 · 本月 交通 總計</span>
                  <span className="num">NT$4,520</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--ns-border)', display: 'flex', gap: 8 }}>
          <button className="ns-btn" style={{ color: 'var(--ns-neg)', borderColor: 'var(--ns-neg-soft)', flex: 1, justifyContent: 'center' }}>
            <NSIcon name="backspace" size={14}/>刪除
          </button>
          <button className="ns-btn primary" style={{ flex: 2, justifyContent: 'center' }}>
            <NSIcon name="check" size={14} strokeWidth={2}/>儲存變更
          </button>
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Desktop: Category Management ───────
function NSDesktopCategoryMgmt({ onNavigate } = {}) {
  const cats = [
    { name: '食物', icon: '🍱', color: '#f0c050', budget: 8000,  spent: 8240,  txns: 42 },
    { name: '交通', icon: '🚖', color: '#6fb3ff', budget: 5000,  spent: 4520,  txns: 18 },
    { name: '娛樂', icon: '🎮', color: '#a99cff', budget: 3000,  spent: 3110,  txns: 9  },
    { name: '訂閱', icon: '📺', color: '#6ee49a', budget: 2500,  spent: 2280,  txns: 6  },
    { name: '居家', icon: '🏠', color: '#ff7d6b', budget: 5000,  spent: 2850,  txns: 5  },
    { name: '醫療', icon: '💊', color: '#34c5b0', budget: 2000,  spent: 680,   txns: 2  },
    { name: '教育', icon: '📚', color: '#f0a050', budget: 3000,  spent: 1200,  txns: 3  },
    { name: '其他', icon: '⋯',  color: '#868685', budget: null,  spent: 3220,  txns: 11 },
  ];

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      <div style={{ padding: '24px 32px 100px', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>May 2026 · 8 categories</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Categories</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="ns-seg">
              <button aria-selected>本月</button>
              <button>YTD</button>
              <button>自訂</button>
            </div>
            <button className="ns-btn primary"><NSIcon name="plus" size={14} strokeWidth={2}/>新增分類</button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            ['已消費', 'NT$26,100', null],
            ['預算合計', 'NT$28,500', null],
            ['預算使用率', '91.6%', 'warn'],
            ['超支分類', '1 (食物)', 'neg'],
          ].map(([l, v, c]) => (
            <div className="ns-card" key={l} style={{ padding: 18 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{l}</div>
              <div className={'num ' + (c === 'warn' ? 'warn' : c === 'neg' ? 'neg' : '')} style={{ fontSize: 22, fontWeight: 500 }}>
                {v}
              </div>
            </div>
          ))}
        </div>

        {/* Donut + category list */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
          {/* Donut */}
          <div className="ns-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
            <NSDonut size={200} thickness={26}
              data={cats.map((c) => ({ label: c.name, v: c.spent, color: c.color }))}
            />
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
              {cats.map((c) => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }}/>
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="ns-card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 22px 10px', borderBottom: '1px solid var(--ns-border)',
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 60px',
                fontSize: 11, color: 'var(--ns-fg-dim)', fontFamily: 'var(--ns-font-mono)',
                letterSpacing: 0.06, textTransform: 'uppercase' }}>
              <span>Category</span>
              <span style={{ textAlign: 'right' }}>Spent</span>
              <span style={{ textAlign: 'right' }}>Budget</span>
              <span style={{ textAlign: 'right', paddingRight: 8 }}>Usage</span>
              <span/>
            </div>
            {cats.map((c, i) => {
              const over = c.budget && c.spent > c.budget;
              const pct = c.budget ? Math.min(c.spent / c.budget, 1) : 0.5;
              return (
                <div key={c.name} style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 60px',
                  alignItems: 'center', padding: '14px 22px',
                  borderTop: i ? '1px solid var(--ns-border)' : 'none',
                  cursor: 'pointer',
                }} >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--ns-r-sm)', fontSize: 18,
                      background: c.color + '28', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{c.icon}</div>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 500 }}>{c.name}</div>
                      <div className="muted mono" style={{ fontSize: 11 }}>{c.txns} 筆</div>
                    </div>
                  </div>
                  <span className={'num ' + (over ? 'neg' : '')} style={{ textAlign: 'right', fontSize: 14.5, fontWeight: over ? 600 : 400 }}>
                    NT${c.spent.toLocaleString()}
                  </span>
                  <span className="num muted" style={{ textAlign: 'right', fontSize: 13.5 }}>
                    {c.budget ? 'NT$' + c.budget.toLocaleString() : '—'}
                  </span>
                  <div style={{ paddingRight: 8 }}>
                    <div style={{ height: 8, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ width: (pct * 100) + '%', height: '100%', background: over ? 'var(--ns-neg)' : c.color, borderRadius: 99 }}/>
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: over ? 'var(--ns-neg)' : 'var(--ns-fg-dim)' }}>
                      {c.budget ? (c.spent / c.budget * 100).toFixed(0) + '%' : '無上限'}
                      {over ? ' · 超支 NT$' + (c.spent - c.budget).toLocaleString() : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="ns-btn ghost icon"><NSIcon name="settings" size={13}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Mobile: Category Management ───────
function NSMobileCategoryMgmt() {
  const cats = [
    { name: '食物', icon: '🍱', color: '#f0c050', budget: 8000, spent: 8240 },
    { name: '交通', icon: '🚖', color: '#6fb3ff', budget: 5000, spent: 4520 },
    { name: '娛樂', icon: '🎮', color: '#a99cff', budget: 3000, spent: 3110 },
    { name: '訂閱', icon: '📺', color: '#6ee49a', budget: 2500, spent: 2280 },
    { name: '居家', icon: '🏠', color: '#ff7d6b', budget: 5000, spent: 2850 },
    { name: '其他', icon: '⋯',  color: '#868685', budget: null, spent: 3220 },
  ];
  return (
    <NSMobileShell active="coin">
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>分類管理</h1>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="plus" size={16} strokeWidth={2}/></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 100px' }}>
        {/* Month bar */}
        <div className="ns-card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="ns-eyebrow">5 月預算使用</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>NT$26,100 / 28,500</span>
          </div>
          <div style={{ height: 10, borderRadius: 99, overflow: 'hidden', background: 'var(--ns-bg-hover)' }}>
            <div style={{ width: '91.6%', height: '100%', background: 'linear-gradient(90deg, var(--ns-accent), var(--ns-chart-2))' }}/>
          </div>
          <div className="mono dim" style={{ fontSize: 10.5, marginTop: 4 }}>91.6% · 剩 NT$2,400 · 還有 3 天</div>
        </div>

        <div className="ns-card" style={{ padding: 0 }}>
          {cats.map((c, i) => {
            const over = c.budget && c.spent > c.budget;
            const pct = c.budget ? c.spent / c.budget : 0;
            return (
              <div key={c.name} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderTop: i ? '1px solid var(--ns-border)' : 'none',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--ns-r-sm)', fontSize: 20,
                  background: c.color + '28', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{c.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                    <span className={'num ' + (over ? 'neg' : '')} style={{ fontSize: 13.5 }}>
                      NT${c.spent.toLocaleString()}{c.budget ? ` / ${c.budget.toLocaleString()}` : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden' }}>
                    <div style={{ width: Math.min(pct * 100, 100) + '%', height: '100%', background: over ? 'var(--ns-neg)' : c.color }}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </NSMobileShell>
  );
}

Object.assign(window, { NSDesktopCashFlowDetail, NSDesktopCategoryMgmt, NSMobileCategoryMgmt });
