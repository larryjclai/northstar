// northstar-cashflow-detail.jsx — Cash Flow detail + Category management

// ─────── Desktop: Cash Flow Detail (transaction clicked) ───────
function NSDesktopCashFlowDetail({ onNavigate } = {}) {
  const [editing, setEditing] = React.useState(false);
  const [txName, setTxName] = React.useState('計程車');
  const [merchant, setMerchant] = React.useState('UBER');
  const [editingName, setEditingName] = React.useState(false);
  const [editingMerchant, setEditingMerchant] = React.useState(false);
  const [txType, setTxType] = React.useState('expense');
  const txTypes = [
    { id: 'expense',  label: '支出',    color: 'var(--ns-neg)'     },
    { id: 'income',   label: '收入',    color: 'var(--ns-pos)'     },
    { id: 'transfer', label: '轉帳',    color: 'var(--ns-accent)'  },
    { id: 'ar',       label: '應收帳款', color: 'var(--ns-chart-3)' },
    { id: 'ap',       label: '應付帳款', color: 'var(--ns-chart-5)' },
  ];
  const currentType = txTypes.find(t => t.id === txType);

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
            <h2 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 600 }}>{txName || merchant}</h2>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{merchant} · 今天 09:10 · 信用卡 · 支出</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="ns-btn icon" onClick={() => setEditing(!editing)}><NSIcon name="settings" size={14}/></button>
            <button className="ns-btn icon"><NSIcon name="dots" size={14}/></button>
            <button className="ns-btn ghost icon" onClick={() => onNavigate && onNavigate('cashflow')}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {/* Amount hero */}
          <div style={{ textAlign: 'center', padding: '16px 0 18px', borderBottom: '1px solid var(--ns-border)', marginBottom: 16 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{currentType.label} · TWD</div>
            <div className="mono" style={{ fontSize: 52, fontWeight: 500, letterSpacing: -0.04, color: currentType.color }}>
              <span style={{ opacity: 0.45 }}>{txType === 'income' || txType === 'ar' ? '+' : txType === 'transfer' ? '' : '−'}NT$</span>250
            </div>
          </div>

          {/* Type selector */}
          <div style={{ marginBottom: 16 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 8 }}>交易類型</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {txTypes.map(t => (
                <button key={t.id} onClick={() => setTxType(t.id)} style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500,
                  border: txType === t.id ? 'none' : '1px solid var(--ns-border)',
                  background: txType === t.id ? t.color : 'var(--ns-bg-card)',
                  color: txType === t.id ? '#fff' : 'var(--ns-fg-dim)',
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── 名稱（可編輯）── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 'var(--ns-r-md)',
              background: 'var(--ns-bg-card)', border: editingName ? '1px solid var(--ns-accent)' : '1px solid var(--ns-border)',
              transition: 'border-color 0.15s',
            }}>
              <NSIcon name="tag" size={15}/>
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ fontSize: 11 }}>名稱</div>
                {editingName ? (
                  <input
                    autoFocus
                    className="ns-input"
                    value={txName}
                    onChange={(e) => setTxName(e.target.value)}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                    style={{ marginTop: 2, padding: '2px 6px', fontSize: 14, height: 28, borderRadius: 'var(--ns-r-sm)' }}
                  />
                ) : (
                  <div style={{ fontSize: 14, marginTop: 2 }}>{txName || <span className="muted">未命名</span>}</div>
                )}
              </div>
              <button
                className="ns-btn ghost icon"
                onClick={() => setEditingName(true)}
                style={{ opacity: 0.6 }}
              >
                <NSIcon name="settings" size={13}/>
              </button>
            </div>

            {/* ── 商家（可編輯）── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderRadius: 'var(--ns-r-md)',
              background: 'var(--ns-bg-card)', border: editingMerchant ? '1px solid var(--ns-accent)' : '1px solid var(--ns-border)',
              transition: 'border-color 0.15s',
            }}>
              <NSIcon name="wallet" size={15}/>
              <div style={{ flex: 1 }}>
                <div className="muted" style={{ fontSize: 11 }}>商家</div>
                {editingMerchant ? (
                  <input
                    autoFocus
                    className="ns-input"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    onBlur={() => setEditingMerchant(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingMerchant(false)}
                    style={{ marginTop: 2, padding: '2px 6px', fontSize: 14, height: 28, borderRadius: 'var(--ns-r-sm)' }}
                  />
                ) : (
                  <div style={{ fontSize: 14, marginTop: 2 }}>{merchant || <span className="muted">未指定商家</span>}</div>
                )}
              </div>
              <button
                className="ns-btn ghost icon"
                onClick={() => setEditingMerchant(true)}
                style={{ opacity: 0.6 }}
              >
                <NSIcon name="settings" size={13}/>
              </button>
            </div>

            {/* ── 其他欄位 ── */}
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

// ─────── Desktop: New Transaction Sheet ───────
function NSDesktopNewTxSheet({ onNavigate } = {}) {
  const [type, setType] = React.useState('expense');
  const [amt, setAmt] = React.useState('');
  const [note, setNote] = React.useState('');
  const [txName, setTxName] = React.useState('');
  const [merchant, setMerchant] = React.useState('');
  const [counterparty, setCounterparty] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [activecat, setActivecat] = React.useState('食物');
  const [subcat, setSubcat] = React.useState(null);
  const [recurring, setRecurring] = React.useState('none');

  const catTree = {
    expense: [
      { name: '食物', icon: '🍱', color: 'var(--ns-chart-3)', subs: ['餐廳', '外送', '超市', '早餐', '咖啡', '夜市'] },
      { name: '交通', icon: '🚖', color: 'var(--ns-chart-4)', subs: ['計程車', '捷運/公車', '停車', '油費', '高鐵', 'YouBike'] },
      { name: '娛樂', icon: '🎮', color: 'var(--ns-chart-5)', subs: ['電影', '遊戲', '演唱會', '書籍', '旅遊', '運動'] },
      { name: '訂閱', icon: '📺', color: 'var(--ns-chart-2)', subs: ['串流影音', '音樂', '軟體', '新聞', '健身', '其他'] },
      { name: '居家', icon: '🏠', color: 'var(--ns-chart-1)', subs: ['租金', '水電瓦斯', '網路', '家具', '清潔', '修繕'] },
      { name: '醫療', icon: '💊', color: '#34c5b0',           subs: ['門診', '藥品', '健身', '牙科', '眼鏡', '其他'] },
      { name: '教育', icon: '📚', color: '#f0a050',           subs: ['學費', '課程', '書籍', '補習', '考試', '其他'] },
      { name: '其他', icon: '⋯',  color: 'var(--ns-fg-dim)', subs: ['禮品', '保險', '稅金', '捐款', '其他'] },
    ],
    income: [
      { name: '薪資', icon: '💼', color: 'var(--ns-pos)',     subs: ['本薪', '加班費', '績效', '年終'] },
      { name: '投資', icon: '📈', color: 'var(--ns-chart-1)', subs: ['股票', '配息', '基金', '利息'] },
      { name: '兼職', icon: '🛠', color: 'var(--ns-chart-4)', subs: ['接案', '打工', '自媒體', '其他'] },
      { name: '租金', icon: '🏠', color: 'var(--ns-chart-2)', subs: ['房租', '車位', '設備', '其他'] },
      { name: '獎金', icon: '🎁', color: 'var(--ns-chart-3)', subs: ['績效', '年終', '比賽', '其他'] },
      { name: '其他', icon: '⋯',  color: 'var(--ns-fg-dim)', subs: ['退稅', '補助', '贈與', '其他'] },
    ],
  };

  const recurringOpts = [
    { id: 'none', label: '不重複' },
    { id: 'daily', label: '每日' },
    { id: 'weekly', label: '每週' },
    { id: 'monthly', label: '每月' },
    { id: 'yearly', label: '每年' },
  ];
  const nextMap = { daily: '明天', weekly: '下週一', monthly: '6/28', yearly: '2027/5/28' };

  const types = [
    { id: 'expense',  label: '支出',    color: 'var(--ns-neg)',     sign: '−', eyebrow: '支出金額' },
    { id: 'income',   label: '收入',    color: 'var(--ns-pos)',     sign: '+', eyebrow: '收入金額' },
    { id: 'transfer', label: '轉帳',    color: 'var(--ns-accent)',  sign: '',  eyebrow: '轉帳金額' },
    { id: 'ar',       label: '應收帳款', color: 'var(--ns-chart-3)', sign: '+', eyebrow: '應收金額' },
    { id: 'ap',       label: '應付帳款', color: 'var(--ns-chart-5)', sign: '−', eyebrow: '應付金額' },
  ];
  const current = types.find(t => t.id === type);

  const expenseCats = ['食物','交通','娛樂','訂閱','居家','醫療','教育','其他'];
  const incomeCats  = ['薪資','投資','獎金','租金','兼職','其他'];
  const cats = type === 'income' ? incomeCats : expenseCats;

  const Field = ({ label, children, required }) => (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, color: 'var(--ns-fg-muted)', marginBottom: 6, letterSpacing: 0.04, textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: 'var(--ns-neg)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(4px)', zIndex: 10 }}/>
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 500, zIndex: 11,
        background: 'var(--ns-bg-elev)', borderLeft: '1px solid var(--ns-border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--ns-r-sm)', background: current.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <NSIcon name="plus" size={15} strokeWidth={2.2}/>
          </div>
          <h2 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 600 }}>新增交易</h2>
          <div style={{ flex: 1 }}/>
          <button className="ns-btn ghost icon" onClick={() => onNavigate && onNavigate('cashflow')}>✕</button>
        </div>

        {/* Type selector */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {types.map(t => (
              <button key={t.id} onClick={() => setType(t.id)} style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                border: type === t.id ? 'none' : '1px solid var(--ns-border)',
                background: type === t.id ? t.color : 'var(--ns-bg-card)',
                color: type === t.id ? '#fff' : 'var(--ns-fg-dim)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Amount */}
          <Field label={current.eyebrow + ' · TWD'} required>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: current.color, fontFamily: 'var(--ns-font-mono)', fontWeight: 500, pointerEvents: 'none' }}>{current.sign}NT$</span>
              <input className="ns-input" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0" style={{ paddingLeft: type === 'transfer' ? 44 : 52, fontSize: 22, fontFamily: 'var(--ns-font-mono)', height: 52, color: current.color }}/>
            </div>
          </Field>

          {/* 日期 + 帳戶 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="日期">
              <input className="ns-input" type="date" defaultValue="2026-05-28"/>
            </Field>
            {type !== 'transfer' ? (
              <Field label={type === 'expense' || type === 'ap' ? '支出帳戶' : '收入帳戶'}>
                <select className="ns-input" style={{ appearance: 'none' }}>
                  <option>Cathay World Card</option>
                  <option>玉山活存</option>
                  <option>富邦現金帳戶</option>
                </select>
              </Field>
            ) : (
              <Field label="幣別">
                <select className="ns-input" style={{ appearance: 'none' }}>
                  <option>TWD</option><option>USD</option><option>JPY</option>
                </select>
              </Field>
            )}
          </div>

          {/* 轉帳：從 → 至 */}
          {type === 'transfer' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="從（轉出）">
                <select className="ns-input" style={{ appearance: 'none' }}>
                  <option>Cathay World Card</option>
                  <option>玉山活存</option>
                </select>
              </Field>
              <Field label="至（轉入）">
                <select className="ns-input" style={{ appearance: 'none' }}>
                  <option>玉山活存</option>
                  <option>Cathay World Card</option>
                </select>
              </Field>
            </div>
          )}

          {/* 支出/收入：名稱 + 商家 + 分類（2層） */}
          {(type === 'expense' || type === 'income') && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="名稱">
                  <input className="ns-input" value={txName} onChange={e => setTxName(e.target.value)}
                    placeholder={type === 'expense' ? '計程車' : '月薪'}/>
                </Field>
                <Field label="商家 / 來源">
                  <input className="ns-input" value={merchant} onChange={e => setMerchant(e.target.value)}
                    placeholder={type === 'expense' ? 'UBER' : '公司'}/>
                </Field>
              </div>

              <Field label="分類">
                {/* 大分類 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {(type === 'income' ? catTree.income : catTree.expense).map(c => (
                    <button key={c.name} onClick={() => { setActivecat(c.name); setSubcat(null); }} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 11px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
                      background: activecat === c.name ? c.color : 'var(--ns-bg-card)',
                      color: activecat === c.name ? '#fff' : 'var(--ns-fg)',
                      border: activecat === c.name ? 'none' : '1px solid var(--ns-border)',
                      fontFamily: 'inherit', transition: 'all 0.12s',
                    }}><span>{c.icon}</span><span>{c.name}</span></button>
                  ))}
                </div>
                {/* 細分類 */}
                {(() => {
                  const tree = type === 'income' ? catTree.income : catTree.expense;
                  const parent = tree.find(c => c.name === activecat);
                  if (!parent) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 10, borderLeft: `2px solid ${parent.color}` }}>
                      {parent.subs.map(s => (
                        <button key={s} onClick={() => setSubcat(s)} style={{
                          padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                          background: subcat === s ? parent.color : 'var(--ns-bg-hover)',
                          color: subcat === s ? '#fff' : 'var(--ns-fg-muted)',
                          border: subcat === s ? 'none' : '1px solid var(--ns-border)',
                          fontFamily: 'inherit', transition: 'all 0.1s',
                        }}>{s}</button>
                      ))}
                    </div>
                  );
                })()}
              </Field>

              {/* 週期記帳 */}
              <Field label="週期記帳">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: recurring !== 'none' ? 10 : 0 }}>
                  {recurringOpts.map(r => (
                    <button key={r.id} onClick={() => setRecurring(r.id)} style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
                      background: recurring === r.id ? 'var(--ns-fg)' : 'var(--ns-bg-card)',
                      color: recurring === r.id ? 'var(--ns-bg)' : 'var(--ns-fg)',
                      border: recurring === r.id ? 'none' : '1px solid var(--ns-border)',
                      fontFamily: 'inherit', transition: 'all 0.12s',
                    }}>{r.label}</button>
                  ))}
                </div>
                {recurring !== 'none' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>結束條件</div>
                      <select className="ns-input" style={{ appearance: 'none', fontSize: 13 }}>
                        <option>永遠重複</option>
                        <option>重複次數</option>
                        <option>結束日期</option>
                      </select>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>下次時間</div>
                      <div className="ns-input" style={{ fontSize: 13, color: 'var(--ns-fg-muted)', display: 'flex', alignItems: 'center' }}>
                        {nextMap[recurring]}
                      </div>
                    </div>
                  </div>
                )}
              </Field>
            </>
          )}

          {/* 應收 / 應付：對象 + 到期日 + 狀態 */}
          {(type === 'ar' || type === 'ap') && (
            <>
              <div style={{
                padding: '12px 14px', borderRadius: 'var(--ns-r-md)',
                background: `color-mix(in srgb, ${current.color} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${current.color} 25%, transparent)`,
                fontSize: 12.5, color: 'var(--ns-fg-muted)', lineHeight: 1.6,
              }}>
                {type === 'ar'
                  ? '應收帳款：對方欠你的錢，尚未入帳。可追蹤收款進度與到期日。'
                  : '應付帳款：你欠對方的錢，尚未付款。可追蹤付款截止日與狀態。'}
              </div>
              <Field label={type === 'ar' ? '對象（欠款方）' : '對象（收款方）'} required>
                <input className="ns-input" value={counterparty} onChange={e => setCounterparty(e.target.value)}
                  placeholder={type === 'ar' ? '例：小明、ABC 公司' : '例：房東、供應商'}/>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label={type === 'ar' ? '預計收款日' : '付款截止日'}>
                  <input className="ns-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    style={{ fontFamily: 'var(--ns-font-mono)' }}/>
                </Field>
                <Field label="狀態">
                  <select className="ns-input" style={{ appearance: 'none' }}>
                    <option>待處理</option>
                    <option>部分付款</option>
                    <option>已完成</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {/* 備註（通用） */}
          <Field label="備註">
            <input className="ns-input" value={note} onChange={e => setNote(e.target.value)} placeholder="選填"/>
          </Field>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--ns-border)', display: 'flex', gap: 8 }}>
          <button className="ns-btn ghost" style={{ flex: '0 0 80px', justifyContent: 'center' }}
            onClick={() => onNavigate && onNavigate('cashflow')}>取消</button>
          <button className="ns-btn primary" style={{ flex: 1, justifyContent: 'center', background: current.color, borderColor: current.color }}>
            <NSIcon name="check" size={14} strokeWidth={2}/>
            {type === 'ar' ? '記錄應收帳款' : type === 'ap' ? '記錄應付帳款' : '儲存交易'}
            {amt ? ` · ${current.sign}NT$${parseFloat(amt).toLocaleString()}` : ''}
          </button>
        </div>
      </div>
    </NSDesktopShell>
  );
}

Object.assign(window, { NSDesktopCashFlowDetail, NSDesktopCategoryMgmt, NSMobileCategoryMgmt, NSDesktopNewTxSheet });
