// northstar-holdings-txns.jsx — Holdings: All Transactions tab + Edit sheet

const allTxnsData = [
  { id: 1,  date: '2026-05-22', asset: 'AAPL',    assetName: 'Apple Inc.',           assetClass: 'stock',  side: 'BUY',  qty: 10,    price: 210.50,  total: 2105,   fee: 150, acc: 'Interactive Brokers', color: 'var(--ns-chart-2)' },
  { id: 2,  date: '2026-05-15', asset: '2330.TW', assetName: '台積電',                assetClass: 'stock',  side: 'DIV',  qty: 1000,  price: 3.50,    total: 3500,   fee: 0,   acc: '富邦證券',              color: 'var(--ns-chart-1)' },
  { id: 3,  date: '2026-05-10', asset: 'BTC',     assetName: 'Bitcoin',              assetClass: 'crypto', side: 'BUY',  qty: 0.05,  price: 1800000, total: 90000,  fee: 200, acc: 'MAX Exchange',         color: 'var(--ns-chart-3)' },
  { id: 4,  date: '2026-04-28', asset: 'VTI',     assetName: 'Vanguard Total Stock', assetClass: 'etf',    side: 'BUY',  qty: 20,    price: 242.30,  total: 4846,   fee: 0,   acc: 'Interactive Brokers', color: 'var(--ns-chart-4)' },
  { id: 5,  date: '2026-04-15', asset: '0050.TW', assetName: '元大台灣50',             assetClass: 'etf',    side: 'DIV',  qty: 1000,  price: 4.20,    total: 4200,   fee: 0,   acc: '富邦證券',              color: 'var(--ns-chart-5)' },
  { id: 6,  date: '2026-04-10', asset: '2330.TW', assetName: '台積電',                assetClass: 'stock',  side: 'SELL', qty: 100,   price: 1050.00, total: 105000, fee: 220, acc: '富邦證券',              color: 'var(--ns-chart-1)' },
  { id: 7,  date: '2026-03-22', asset: 'ETH',     assetName: 'Ethereum',             assetClass: 'crypto', side: 'SELL', qty: 1.5,   price: 120000,  total: 180000, fee: 350, acc: 'MAX Exchange',         color: 'var(--ns-chart-3)' },
  { id: 8,  date: '2026-03-15', asset: 'AAPL',    assetName: 'Apple Inc.',           assetClass: 'stock',  side: 'DIV',  qty: 50,    price: 0.25,    total: 12,     fee: 0,   acc: 'Interactive Brokers', color: 'var(--ns-chart-2)' },
  { id: 9,  date: '2026-03-01', asset: 'VTI',     assetName: 'Vanguard Total Stock', assetClass: 'etf',    side: 'BUY',  qty: 15,    price: 235.00,  total: 3525,   fee: 0,   acc: 'Interactive Brokers', color: 'var(--ns-chart-4)' },
  { id: 10, date: '2026-02-14', asset: '2330.TW', assetName: '台積電',                assetClass: 'stock',  side: 'BUY',  qty: 200,   price: 980.00,  total: 196000, fee: 410, acc: '富邦證券',              color: 'var(--ns-chart-1)' },
  { id: 11, date: '2026-02-01', asset: 'BTC',     assetName: 'Bitcoin',              assetClass: 'crypto', side: 'BUY',  qty: 0.02,  price: 1650000, total: 33000,  fee: 100, acc: 'MAX Exchange',         color: 'var(--ns-chart-3)' },
  { id: 12, date: '2026-01-15', asset: '0050.TW', assetName: '元大台灣50',             assetClass: 'etf',    side: 'BUY',  qty: 500,   price: 183.00,  total: 91500,  fee: 190, acc: '富邦證券',              color: 'var(--ns-chart-5)' },
  { id: 13, date: '2025-12-10', asset: '2454.TW', assetName: '聯發科',                assetClass: 'stock',  side: 'SPLIT',qty: 200,   price: 0,       total: 0,      fee: 0,   acc: '富邦證券',              color: 'var(--ns-chart-2)' },
  { id: 14, date: '2025-11-20', asset: 'ETH',     assetName: 'Ethereum',             assetClass: 'crypto', side: 'BUY',  qty: 2,     price: 105000,  total: 210000, fee: 400, acc: 'MAX Exchange',         color: 'var(--ns-chart-3)' },
  { id: 15, date: '2025-10-05', asset: 'VWRA',    assetName: 'FTSE All-World',       assetClass: 'etf',    side: 'BUY',  qty: 50,    price: 110.20,  total: 17380,  fee: 0,   acc: 'Interactive Brokers', color: 'var(--ns-chart-5)' },
];

const sideMeta = {
  BUY:   { label: 'BUY',   color: 'var(--ns-pos)',     sign: '−' },
  SELL:  { label: 'SELL',  color: 'var(--ns-neg)',     sign: '+' },
  DIV:   { label: 'DIV',   color: 'var(--ns-chart-3)', sign: '+' },
  SPLIT: { label: 'SPLIT', color: 'var(--ns-accent)',  sign: ''  },
};

function groupTxnsByMonth(txns) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const groups = {};
  txns.forEach(tx => {
    const d = new Date(tx.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!groups[key]) groups[key] = { key, label: `${months[d.getMonth()]} ${d.getFullYear()}`, items: [] };
    groups[key].items.push(tx);
  });
  return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
}

// ─────── Holdings: All Transactions tab ───────
function NSDesktopHoldingsTxns({ onNavigate } = {}) {
  const [assetFilter, setAssetFilter] = React.useState('all');
  const [typeFilter, setTypeFilter]   = React.useState('all');
  const [search, setSearch]           = React.useState('');
  const [selectedTx, setSelectedTx]   = React.useState(null);

  const filtered = allTxnsData.filter(tx => {
    if (assetFilter !== 'all' && tx.assetClass !== assetFilter) return false;
    if (typeFilter  !== 'all' && tx.side      !== typeFilter)  return false;
    if (search) {
      const q = search.toLowerCase();
      if (!tx.asset.toLowerCase().includes(q) && !tx.assetName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const groups = groupTxnsByMonth(filtered);

  const TabBtn = ({ id, label, active, onClick }) => (
    <button onClick={onClick} style={{
      padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 600 : 400,
      color: active ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
      borderBottom: active ? '2px solid var(--ns-accent)' : '2px solid transparent',
      marginBottom: -1, transition: 'all 0.12s',
    }}>{label}</button>
  );

  return (
    <NSDesktopShell active="holdings" onNavigate={onNavigate}>
      <div style={{ height: '100%', overflow: 'auto', padding: '24px 32px 100px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 0 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>All accounts · {allTxnsData.length} records</div>
            <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>Holdings</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn"><NSIcon name="download" size={14}/>匯出 CSV</button>
            <button className="ns-btn primary" onClick={() => onNavigate && onNavigate('inv-add')}>
              <NSIcon name="plus" size={14} strokeWidth={2}/>Buy / Sell
            </button>
          </div>
        </div>

        {/* Page-level tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--ns-border)', marginTop: 20, marginBottom: 20 }}>
          <TabBtn id="portfolio" label="Portfolio"     active={false} onClick={() => onNavigate && onNavigate('holdings')} />
          <TabBtn id="txns"      label="Transactions"  active={true}  onClick={() => {}} />
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="ns-seg">
            {[['all','All'],['stock','Stocks'],['etf','ETF'],['crypto','Crypto']].map(([id, label]) => (
              <button key={id} aria-selected={assetFilter === id} onClick={() => setAssetFilter(id)}>{label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--ns-border)', flexShrink: 0 }}/>
          <div className="ns-seg">
            {[['all','All types'],['BUY','Buy'],['SELL','Sell'],['DIV','Dividend'],['SPLIT','Split']].map(([id, label]) => (
              <button key={id} aria-selected={typeFilter === id} onClick={() => setTypeFilter(id)}>{label}</button>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <NSIcon name="search" size={13}/>
            </span>
            <input className="ns-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ticker…" style={{ paddingLeft: 30, width: 200, fontSize: 12.5 }}/>
          </div>
          <button className="ns-btn ghost"><NSIcon name="calendar" size={14}/>Date range</button>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            ['Records',      filtered.length + ' txns',                                                null ],
            ['Total bought', 'NT$' + filtered.filter(t=>t.side==='BUY').reduce((s,t)=>s+t.total,0).toLocaleString(), null],
            ['Total sold',   'NT$' + filtered.filter(t=>t.side==='SELL').reduce((s,t)=>s+t.total,0).toLocaleString(),'pos'],
            ['Dividends',    'NT$' + filtered.filter(t=>t.side==='DIV').reduce((s,t)=>s+t.total,0).toLocaleString(), 'pos'],
          ].map(([l, v, c]) => (
            <div className="ns-card" key={l} style={{ padding: '14px 18px' }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>{l}</div>
              <div className={'num ' + (c || '')} style={{ fontSize: 18, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Grouped by month */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.length === 0 && (
            <div className="ns-card" style={{ padding: 40, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 14 }}>No transactions match</div>
            </div>
          )}
          {groups.map((g, gi) => {
            const buys  = g.items.filter(t => t.side === 'BUY').reduce((s,t)=>s+t.total,0);
            const sells = g.items.filter(t => t.side === 'SELL').reduce((s,t)=>s+t.total,0);
            const divs  = g.items.filter(t => t.side === 'DIV').reduce((s,t)=>s+t.total,0);
            return (
              <div key={g.key} className="ns-card" style={{ padding: 0 }}>
                {/* Month header */}
                <div style={{
                  padding: '11px 22px', borderBottom: '1px solid var(--ns-border)',
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: 'var(--ns-bg-elev)',
                }}>
                  <span className="ns-eyebrow" style={{ minWidth: 120 }}>{g.label}</span>
                  <span className="muted mono" style={{ fontSize: 11 }}>{g.items.length} 筆</span>
                  <div style={{ flex: 1 }}/>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11.5 }}>
                    {buys  > 0 && <span className="muted mono">買入 NT${buys.toLocaleString()}</span>}
                    {sells > 0 && <span className="pos mono">賣出 +NT${sells.toLocaleString()}</span>}
                    {divs  > 0 && <span style={{ color: 'var(--ns-chart-3)' }} className="mono">配息 +NT${divs.toLocaleString()}</span>}
                  </div>
                </div>

                {/* Column header — only on first group */}
                {gi === 0 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 2fr 76px 0.9fr 1.1fr 0.75fr 1fr 1.1fr 44px',
                    padding: '8px 22px', borderBottom: '1px solid var(--ns-border)',
                    fontSize: 11, letterSpacing: 0.06, textTransform: 'uppercase',
                    color: 'var(--ns-fg-dim)', fontFamily: 'var(--ns-font-mono)',
                  }}>
                    <span>Date</span>
                    <span>Asset</span>
                    <span style={{ textAlign: 'center' }}>Type</span>
                    <span style={{ textAlign: 'right' }}>Qty</span>
                    <span style={{ textAlign: 'right' }}>Price</span>
                    <span style={{ textAlign: 'right' }}>Fee</span>
                    <span style={{ textAlign: 'right' }}>Total</span>
                    <span style={{ textAlign: 'right' }}>Account</span>
                    <span/>
                  </div>
                )}

                {/* Transaction rows */}
                {g.items.map((tx) => {
                  const meta = sideMeta[tx.side] || sideMeta.BUY;
                  const isSelected = selectedTx?.id === tx.id;
                  return (
                    <div key={tx.id} onClick={() => setSelectedTx(isSelected ? null : tx)} style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 2fr 76px 0.9fr 1.1fr 0.75fr 1fr 1.1fr 44px',
                      alignItems: 'center', padding: '12px 22px',
                      borderTop: '1px solid var(--ns-border)',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--ns-bg-hover)' : 'transparent',
                      transition: 'background 0.1s',
                    }}>
                      <span className="mono muted" style={{ fontSize: 12 }}>{tx.date.slice(5)}</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <NSMark label={tx.asset.slice(0,4)} color={tx.color} size={30} mono/>
                        <div>
                          <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{tx.asset}</div>
                          <div className="muted" style={{ fontSize: 11 }}>{tx.assetName}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          padding: '3px 7px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                          fontFamily: 'var(--ns-font-mono)', letterSpacing: 0.04,
                          background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
                          color: meta.color,
                        }}>{meta.label}</span>
                      </div>

                      <span className="num" style={{ textAlign: 'right', fontSize: 13 }}>
                        {tx.qty === 0 ? '—' : tx.qty < 1 ? tx.qty.toFixed(4) : tx.qty.toLocaleString()}
                      </span>
                      <span className="num muted" style={{ textAlign: 'right', fontSize: 13 }}>
                        {tx.price === 0 ? '—' : tx.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                      <span className="num muted" style={{ textAlign: 'right', fontSize: 12 }}>
                        {tx.fee ? tx.fee.toLocaleString() : '—'}
                      </span>
                      <span className={`num ${tx.side === 'SELL' || tx.side === 'DIV' ? 'pos' : ''}`}
                        style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                        {tx.total === 0 ? '—' : `${meta.sign}NT$${tx.total.toLocaleString()}`}
                      </span>
                      <span className="muted" style={{ textAlign: 'right', fontSize: 11, lineHeight: 1.3 }}>{tx.acc}</span>
                      <span className="dim" style={{ textAlign: 'right' }}>
                        <NSIcon name="chevRight" size={13}/>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit sheet (slides in from right) */}
      {selectedTx && (
        <NSInvestEditSheet tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </NSDesktopShell>
  );
}

// ─────── Transaction Edit Sheet ───────
function NSInvestEditSheet({ tx, onClose } = {}) {
  const [side,  setSide]  = React.useState(tx?.side  || 'BUY');
  const [qty,   setQty]   = React.useState(String(tx?.qty   || ''));
  const [price, setPrice] = React.useState(String(tx?.price || ''));
  const [date,  setDate]  = React.useState(tx?.date  || '');
  const [fee,   setFee]   = React.useState(String(tx?.fee   || ''));
  const [note,  setNote]  = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const subtotal  = parseFloat(qty || 0) * parseFloat(price || 0);
  const withFee   = subtotal + parseFloat(fee || 0);
  const meta      = sideMeta[side] || sideMeta.BUY;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(4px)', zIndex: 20,
      }}/>

      {/* Sheet */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 480, zIndex: 21,
        background: 'var(--ns-bg-elev)', borderLeft: '1px solid var(--ns-border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <NSMark label={tx?.asset?.slice(0,4) || ''} color={tx?.color || 'var(--ns-accent)'} size={36} mono/>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 600 }}>Edit transaction</h2>
            <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>{tx?.asset} · {tx?.assetName}</div>
          </div>
          <button className="ns-btn ghost icon" onClick={onClose}>✕</button>
        </div>

        {/* Type tabs */}
        <div style={{ padding: '14px 24px 0' }}>
          <div className="ns-seg" style={{ width: '100%' }}>
            {['BUY','SELL','DIV','SPLIT'].map(s => (
              <button key={s} style={{ flex: 1 }} aria-selected={side === s} onClick={() => setSide(s)}>{s}</button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Date + Account */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Date</label>
              <input className="ns-input" type="date" value={date} onChange={e => setDate(e.target.value)}/>
            </div>
            <div>
              <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Account</label>
              <select className="ns-input" style={{ appearance: 'none' }} defaultValue={tx?.acc}>
                <option>富邦證券</option>
                <option>Interactive Brokers</option>
                <option>MAX Exchange</option>
                <option>BitoPro</option>
              </select>
            </div>
          </div>

          {/* Qty + Price */}
          {side !== 'SPLIT' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>
                  {tx?.assetClass === 'crypto' ? 'Amount' : side === 'DIV' ? 'Shares (held)' : 'Shares'}
                </label>
                <input className="ns-input" value={qty} onChange={e => setQty(e.target.value)}
                  style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 18 }}/>
              </div>
              <div>
                <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>
                  {side === 'DIV' ? 'Dividend per share' : tx?.assetClass === 'crypto' ? 'Price (TWD)' : 'Price per share'}
                </label>
                <input className="ns-input" value={price} onChange={e => setPrice(e.target.value)}
                  style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 18 }}/>
              </div>
            </div>
          )}

          {side === 'SPLIT' && (
            <div>
              <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Split ratio (e.g. 2 = 2-for-1)</label>
              <input className="ns-input" defaultValue="2"
                style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 22, width: '50%' }}/>
            </div>
          )}

          {/* Fee */}
          <div>
            <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Commission / fee (NT$)</label>
            <input className="ns-input" value={fee} onChange={e => setFee(e.target.value)} placeholder="0"/>
          </div>

          {/* Note */}
          <div>
            <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Note</label>
            <input className="ns-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional"/>
          </div>

          {/* FIFO impact */}
          {side !== 'SPLIT' && subtotal > 0 && (
            <div style={{
              padding: 16, borderRadius: 'var(--ns-r-md)',
              background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.color} 28%, transparent)`,
            }}>
              <div className="ns-eyebrow" style={{ marginBottom: 10, color: meta.color }}>Transaction summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div>
                  <span className="muted">Subtotal</span><br/>
                  <span className="num" style={{ fontSize: 16, fontWeight: 500 }}>
                    NT${subtotal.toLocaleString('en', { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div>
                  <span className="muted">After fee</span><br/>
                  <span className="num" style={{ fontSize: 16, fontWeight: 500 }}>
                    NT${withFee.toLocaleString('en', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
              {(side === 'BUY' || side === 'SELL') && (
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Changes will be applied to FIFO cost basis immediately.
                </div>
              )}
            </div>
          )}

          {/* Danger zone */}
          <div style={{
            marginTop: 8, padding: '14px 16px', borderRadius: 'var(--ns-r-md)',
            border: `1px solid color-mix(in srgb, var(--ns-neg) 30%, transparent)`,
            background: `color-mix(in srgb, var(--ns-neg) 6%, transparent)`,
          }}>
            <div className="ns-eyebrow" style={{ marginBottom: 8, color: 'var(--ns-neg)' }}>Danger zone</div>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{
                background: 'none', border: '1px solid var(--ns-neg)', borderRadius: 'var(--ns-r-sm)',
                color: 'var(--ns-neg)', padding: '6px 14px', fontSize: 13,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <NSIcon name="backspace" size={13}/>Delete this transaction
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ns-neg)' }}>確定刪除？此動作無法還原。</span>
                <button onClick={() => { setConfirmDelete(false); onClose && onClose(); }} style={{
                  background: 'var(--ns-neg)', border: 'none', borderRadius: 'var(--ns-r-sm)',
                  color: '#fff', padding: '6px 12px', fontSize: 12.5,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>確定刪除</button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  background: 'none', border: '1px solid var(--ns-border)', borderRadius: 'var(--ns-r-sm)',
                  color: 'var(--ns-fg-muted)', padding: '6px 12px', fontSize: 12.5,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>取消</button>
              </div>
            )}
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Deleting recalculates FIFO cost basis for this symbol.</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--ns-border)', display: 'flex', gap: 8 }}>
          <button className="ns-btn ghost" style={{ flex: '0 0 90px', justifyContent: 'center' }} onClick={onClose}>Cancel</button>
          <button className="ns-btn primary" style={{ flex: 1, justifyContent: 'center' }}>
            <NSIcon name="check" size={14} strokeWidth={2}/>Save changes
          </button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { NSDesktopHoldingsTxns, NSInvestEditSheet });
