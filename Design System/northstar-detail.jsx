// northstar-detail.jsx — Holdings Detail (desktop) + Investments Add Sheet (desktop + mobile)

// ─────── Desktop: Holdings Detail ───────
function NSDesktopHoldingDetail({ onNavigate } = {}) {
  const [seg, setSeg] = React.useState('1y');
  const series = nsSeries(260, 612, 0.022, 0.0035);
  const benchmark = nsSeries(260, 612, 0.014, 0.0018);
  const labels = Array.from({ length: 260 }, (_, i) => {
    const d = new Date(2025, 0, 1); d.setDate(d.getDate() + i);
    return `${d.getMonth()+1}/${d.getDate()}`;
  });

  const lots = [
    { id: 1, date: '2023-03-14', qty: 500,  cost: 542.00, last: 1042.00, pl: +250000, pct: +92.25, div: 8500 },
    { id: 2, date: '2023-11-02', qty: 300,  cost: 612.00, last: 1042.00, pl: +129000, pct: +70.26, div: 5100 },
    { id: 3, date: '2024-08-21', qty: 200,  cost: 758.00, last: 1042.00, pl:  +56800, pct: +37.47, div: 3400 },
  ];

  const txns = [
    { date: '2024-08-21', side: 'BUY',  qty: 200, price: 758.00, total: 151600, fee: 320, acc: '富邦證券' },
    { date: '2023-11-02', side: 'BUY',  qty: 300, price: 612.00, total: 183600, fee: 390, acc: '富邦證券' },
    { date: '2023-07-05', side: 'DIV',  qty: 1000, price: 5.60,  total: 5600,   fee: 0,   acc: '富邦證券' },
    { date: '2023-03-14', side: 'BUY',  qty: 500, price: 542.00, total: 271000, fee: 570, acc: '富邦證券' },
    { date: '2022-09-12', side: 'SELL', qty: 200, price: 480.00, total: 96000,  fee: 200, acc: '富邦證券' },
  ];

  return (
    <NSDesktopShell active="holdings" onNavigate={onNavigate}>
      <div style={{ height: '100%', overflow: 'auto', padding: '24px 32px 100px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13, color: 'var(--ns-fg-muted)' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => onNavigate && onNavigate('holdings')}>Holdings</span>
          <NSIcon name="chevRight" size={13}/>
          <span className="mono" style={{ fontWeight: 500, color: 'var(--ns-fg)' }}>2330.TW</span>
        </div>

        {/* Hero header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <NSMark label="TSMC" color="var(--ns-chart-1)" size={52} mono />
            <div>
              <div className="mono" style={{ fontSize: 13, marginBottom: 2, letterSpacing: 0.04, color: 'var(--ns-fg-muted)', textTransform: 'uppercase' }}>
                TSE · 2330.TW
              </div>
              <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, margin: '0 0 4px', fontWeight: 600, letterSpacing: -0.02 }}>
                台積電 · Taiwan Semiconductor
              </h1>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="ns-pill"><span>半導體 · IC 設計</span></span>
                <span className="ns-pill"><span>富邦證券</span></span>
                <span className="ns-pill"><span>1,000 股</span></span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn ghost"><NSIcon name="star" size={14}/>追蹤</button>
            <button className="ns-btn"><NSIcon name="download" size={14}/>匯出</button>
            <button className="ns-btn" onClick={() => onNavigate && onNavigate('inv-add')}>
              <NSIcon name="plus" size={14} strokeWidth={2}/>Buy / Sell
            </button>
          </div>
        </div>

        {/* Price + position */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, marginBottom: 20 }}>
          {/* Chart card */}
          <div className="ns-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span className="ns-num-lg mono">1,042.00</span>
                  <span className="dim mono" style={{ fontSize: 13 }}>TWD</span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
                  <span className="ns-pill solid-pos"><NSIcon name="arrowUp" size={11} strokeWidth={2}/><span className="num">+18.50</span></span>
                  <span className="ns-pill solid-pos"><span className="num">+1.81% 今天</span></span>
                  <span className="muted mono" style={{ fontSize: 12 }}>更新 14:32 TST</span>
                </div>
              </div>
              <div className="ns-seg">
                {['1D','1W','1M','3M','YTD','1Y','ALL'].map((v) => (
                  <button key={v} aria-selected={v.toLowerCase() === seg} onClick={() => setSeg(v.toLowerCase())}>{v}</button>
                ))}
              </div>
            </div>
            <NSAreaChart
              data={series} secondary={benchmark}
              w={860} h={240} xLabels={labels}
              yFormat={(v) => v.toFixed(0)}
              highlightIdx={200}
            />
            <div style={{ display: 'flex', gap: 16, fontSize: 11.5, marginTop: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 2, background: 'var(--ns-accent)' }}/><span>2330.TW</span>
                <span className="mono pos">+70.13%</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 2, background: 'var(--ns-fg-dim)', borderTop: '1px dashed var(--ns-fg-dim)' }}/><span>0050.TW benchmark</span>
                <span className="mono">+28.4%</span>
              </span>
            </div>
          </div>

          {/* Position summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="ns-card" style={{ padding: 20 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 12 }}>Your position · FIFO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  ['市值', 'NT$1,042,000', null],
                  ['FIFO 成本', 'NT$612,400', null],
                  ['未實現損益', '+NT$429,600', 'pos'],
                  ['報酬率', '+70.13%', 'pos'],
                  ['配息 YTD', 'NT$14,500', null],
                  ['持倉天數', '804 天', null],
                ].map(([l, v, c]) => (
                  <div key={l}>
                    <div className="muted" style={{ fontSize: 11 }}>{l}</div>
                    <div className={'num ' + (c || '')} style={{ fontSize: 16, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="ns-card" style={{ padding: 16 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 10 }}>Portfolio weight</div>
              <div style={{ height: 8, borderRadius: 99, background: 'var(--ns-bg-hover)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: '19.8%', height: '100%', background: 'var(--ns-chart-1)' }}/>
              </div>
              <div className="mono" style={{ fontSize: 13 }}>19.8% <span className="dim">of portfolio · largest position</span></div>
            </div>
          </div>
        </div>

        {/* Open lots */}
        <div className="ns-card" style={{ padding: 0, marginBottom: 16 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>Open lots · 3</h3>
            <div style={{ flex: 1 }}/>
            <span className="muted mono" style={{ fontSize: 11 }}>FIFO cost basis</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr 0.9fr',
            padding: '10px 22px', borderBottom: '1px solid var(--ns-border)',
            fontSize: 11, color: 'var(--ns-fg-dim)', fontFamily: 'var(--ns-font-mono)',
            letterSpacing: 0.06, textTransform: 'uppercase',
          }}>
            <span>Date</span>
            <span style={{ textAlign: 'right' }}>Qty</span>
            <span style={{ textAlign: 'right' }}>Cost</span>
            <span style={{ textAlign: 'right' }}>Last</span>
            <span style={{ textAlign: 'right' }}>P/L (NT$)</span>
            <span style={{ textAlign: 'right' }}>P/L %</span>
            <span style={{ textAlign: 'right' }}>Dividends</span>
          </div>
          {lots.map((l) => (
            <div key={l.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr 0.9fr',
              padding: '14px 22px', borderTop: '1px solid var(--ns-border)', alignItems: 'center',
            }}>
              <span className="mono muted" style={{ fontSize: 13 }}>{l.date}</span>
              <span className="num" style={{ textAlign: 'right', fontSize: 13 }}>{l.qty.toLocaleString()}</span>
              <span className="num muted" style={{ textAlign: 'right', fontSize: 13 }}>{l.cost.toFixed(2)}</span>
              <span className="num" style={{ textAlign: 'right', fontSize: 13 }}>{l.last.toFixed(2)}</span>
              <span className="num pos" style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>+NT${l.pl.toLocaleString()}</span>
              <span className="num pos" style={{ textAlign: 'right', fontSize: 14 }}>+{l.pct.toFixed(2)}%</span>
              <span className="num muted" style={{ textAlign: 'right', fontSize: 13 }}>NT${l.div.toLocaleString()}</span>
            </div>
          ))}
          <div style={{ padding: '10px 22px', borderTop: '1px solid var(--ns-border)', background: 'var(--ns-bg-elev)', display: 'grid', gridTemplateColumns: '1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr 0.9fr' }}>
            <span className="muted mono" style={{ fontSize: 11 }}>TOTAL · 1,000 shares</span>
            <span/>
            <span className="num muted" style={{ textAlign: 'right', fontSize: 13 }}>612.40</span>
            <span/>
            <span className="num pos" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600 }}>+NT$435,800</span>
            <span className="num pos" style={{ textAlign: 'right', fontSize: 14 }}>+70.13%</span>
            <span className="num muted" style={{ textAlign: 'right', fontSize: 13 }}>NT$14,500</span>
          </div>
        </div>

        {/* Transaction history */}
        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>Transaction history · 5 records</h3>
            <div style={{ flex: 1 }}/>
            <button className="ns-btn" style={{ fontSize: 12.5 }} onClick={() => onNavigate && onNavigate('inv-add')}>
              <NSIcon name="plus" size={13} strokeWidth={2}/> Add
            </button>
          </div>
          {txns.map((tx, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '100px 80px 0.7fr 0.9fr 0.9fr 1fr 1fr',
              gap: 0, padding: '13px 22px', borderTop: i ? '1px solid var(--ns-border)' : 'none',
              alignItems: 'center',
            }}>
              <span className="mono muted" style={{ fontSize: 12.5 }}>{tx.date}</span>
              <span className={'ns-pill ' + (tx.side === 'BUY' ? 'solid-pos' : tx.side === 'SELL' ? 'solid-neg' : '')} style={{ fontSize: 10.5, justifySelf: 'start' }}>
                {tx.side}
              </span>
              <span className="num" style={{ textAlign: 'right', fontSize: 13.5 }}>{tx.qty.toLocaleString()}</span>
              <span className="num" style={{ textAlign: 'right', fontSize: 13.5 }}>{tx.price.toFixed(2)}</span>
              <span className="num muted" style={{ textAlign: 'right', fontSize: 12 }}>fee {tx.fee || '–'}</span>
              <span className={'num ' + (tx.side === 'SELL' ? 'pos' : tx.side === 'BUY' ? '' : 'pos')} style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                {tx.side === 'SELL' ? '+' : tx.side === 'DIV' ? '+' : '−'}NT${tx.total.toLocaleString()}
              </span>
              <span className="muted" style={{ textAlign: 'right', fontSize: 12 }}>{tx.acc}</span>
            </div>
          ))}
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Desktop: Investments Add Sheet ───────
function NSDesktopInvestAddSheet({ onNavigate } = {}) {
  const [side, setSide] = React.useState('buy');
  const [ticker, setTicker] = React.useState('2330.TW');
  const [qty, setQty] = React.useState('100');
  const [price, setPrice] = React.useState('1042.00');
  const cost = (parseFloat(qty || 0) * parseFloat(price || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const newAvg = ((parseFloat(qty||0)*parseFloat(price||0) + 612400) / (1000 + parseFloat(qty||0))).toFixed(2);

  return (
    <NSDesktopShell active="holdings" onNavigate={onNavigate}>
      {/* Background blur overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 10 }}/>

      {/* Sheet */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 520, zIndex: 11,
        background: 'var(--ns-bg-elev)', borderLeft: '1px solid var(--ns-border)',
        display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        {/* Sheet header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, letterSpacing: -0.02 }}>New transaction</h2>
          <div style={{ flex: 1 }}/>
          <button className="ns-btn ghost" style={{ padding: 8 }} onClick={() => onNavigate && onNavigate('holding-detail')}>
            <NSIcon name="plus" size={16} strokeWidth={2} style={{ transform: 'rotate(45deg)' }}/>
          </button>
        </div>

        {/* Side segmented */}
        <div style={{ padding: '18px 24px 0' }}>
          <div className="ns-seg" style={{ width: '100%' }}>
            {['buy','sell','dividend','split'].map((s) => (
              <button key={s} style={{ flex: 1, textTransform: 'capitalize' }}
                      aria-selected={side === s} onClick={() => setSide(s)}>{s}</button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Ticker */}
            <div>
              <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Ticker / Symbol</label>
              <div style={{ position: 'relative' }}>
                <input className="ns-input" value={ticker} onChange={(e) => setTicker(e.target.value)}
                       placeholder="AAPL, 2330.TW, VTI…" style={{ paddingLeft: 36 }}/>
                <span style={{ position: 'absolute', left: 11, top: 11 }}><NSIcon name="search" size={14}/></span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['2330.TW', '0050.TW', 'AAPL', 'VTI', 'VWRA'].map((s) => (
                  <button key={s} className="ns-pill" style={{ cursor: 'pointer' }}
                          onClick={() => setTicker(s)}>
                    <span className="mono" style={{ fontSize: 11.5 }}>{s}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date + account */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Date</label>
                <input className="ns-input" type="date" defaultValue="2026-05-27"/>
              </div>
              <div>
                <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Account</label>
                <select className="ns-input" style={{ appearance: 'none' }}>
                  <option>富邦證券</option>
                  <option>Interactive Brokers</option>
                </select>
              </div>
            </div>

            {/* Qty + Price */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Shares</label>
                <input className="ns-input mono" value={qty} onChange={(e) => setQty(e.target.value)}
                       placeholder="100" style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 18 }}/>
              </div>
              <div>
                <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Price per share</label>
                <input className="ns-input mono" value={price} onChange={(e) => setPrice(e.target.value)}
                       placeholder="1042.00" style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 18 }}/>
              </div>
            </div>

            {/* Commission */}
            <div>
              <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Commission / fee</label>
              <input className="ns-input" placeholder="Optional · e.g. 220" defaultValue="220"/>
            </div>

            {/* Notes */}
            <div>
              <label className="ns-eyebrow" style={{ display: 'block', marginBottom: 6 }}>Note</label>
              <input className="ns-input" placeholder="Optional" />
            </div>

            {/* FIFO impact preview */}
            <div style={{
              padding: 16, borderRadius: 'var(--ns-r-md)',
              background: 'var(--ns-accent-soft)', border: '1px solid var(--ns-accent)',
            }}>
              <div className="ns-eyebrow" style={{ marginBottom: 10, color: 'var(--ns-accent)' }}>FIFO impact preview</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div><span className="muted">Total cost</span><br/><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>NT${cost}</span></div>
                <div><span className="muted">New avg cost (FIFO)</span><br/><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>NT${newAvg}</span></div>
                <div><span className="muted">New position</span><br/><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{(1000 + parseInt(qty||0)).toLocaleString()} 股</span></div>
                <div><span className="muted">New market value</span><br/><span className="num pos" style={{ fontSize: 16, fontWeight: 500 }}>NT${((1000 + parseInt(qty||0)) * 1042).toLocaleString()}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--ns-border)', display: 'flex', gap: 10 }}>
          <button className="ns-btn ghost" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => onNavigate && onNavigate('holding-detail')}>取消</button>
          <button className="ns-btn primary" style={{ flex: 2, justifyContent: 'center' }}>
            <NSIcon name="check" size={14} strokeWidth={2}/>確認買入 · NT${cost}
          </button>
        </div>
      </div>
    </NSDesktopShell>
  );
}

// ─────── Mobile: Investment Add Sheet ───────
function NSMobileInvestAdd() {
  const [side, setSide] = React.useState('buy');
  const [price, setPrice] = React.useState('1042');
  const [qty, setQty] = React.useState('100');
  const keys = ['7','8','9','4','5','6','1','2','3','.','0','←'];
  const cost = (parseFloat(qty||0) * parseFloat(price||0)).toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="ns-board" style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 52 }}>
      {/* Header */}
      <div style={{ padding: '12px 18px 10px', display: 'flex', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 14, cursor: 'pointer' }}>取消</span>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="mono" style={{ fontWeight: 600, fontSize: 14.5 }}>2330.TW</div>
          <div className="muted" style={{ fontSize: 11 }}>台積電 · 富邦證券</div>
        </div>
        <span className="muted" style={{ fontSize: 14, opacity: 0 }}>取消</span>
      </div>

      {/* Side */}
      <div style={{ padding: '4px 18px 12px' }}>
        <div className="ns-seg" style={{ width: '100%' }}>
          {['buy','sell','dividend'].map((s) => (
            <button key={s} style={{ flex: 1, textTransform: 'capitalize' }}
                    aria-selected={side === s} onClick={() => setSide(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Amount display */}
      <div style={{ textAlign: 'center', padding: '10px 18px 4px' }}>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Price per share · TWD</div>
        <div className="mono" style={{ fontSize: 48, fontWeight: 500, letterSpacing: -0.04 }}>{price}</div>
        <div className="dim mono" style={{ fontSize: 11, marginTop: 2 }}>{qty} 股 × {price} = NT${cost}</div>
      </div>

      {/* Shares selector */}
      <div style={{ padding: '10px 18px 6px', display: 'flex', gap: 8, justifyContent: 'center' }}>
        {['100','500','1000'].map((q) => (
          <button key={q} className={'ns-btn ' + (qty === q ? 'primary' : '')}
                  onClick={() => setQty(q)} style={{ borderRadius: 999, padding: '6px 16px', fontSize: 13 }}>
            {q} 股
          </button>
        ))}
        <input className="ns-input mono" value={qty} onChange={(e) => setQty(e.target.value)}
               style={{ width: 80, textAlign: 'center', fontSize: 14, borderRadius: 999, fontFamily: 'var(--ns-font-mono)' }}/>
      </div>

      {/* FIFO preview strip */}
      <div style={{ margin: '6px 18px', padding: '10px 16px', borderRadius: 'var(--ns-r-md)', background: 'var(--ns-accent-soft)', border: '1px solid var(--ns-accent)' }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'space-around', fontSize: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="muted">Total</div>
            <div className="num" style={{ fontWeight: 600 }}>NT${cost}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="muted">New avg</div>
            <div className="num" style={{ fontWeight: 600 }}>
              {((parseFloat(qty||0)*parseFloat(price||0) + 612400) / (1000 + parseFloat(qty||0))).toFixed(0)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="muted">New pos</div>
            <div className="num" style={{ fontWeight: 600 }}>{(1000 + parseInt(qty||0)).toLocaleString()} 股</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      {/* Numpad */}
      <div style={{ background: 'var(--ns-bg-elev)', borderTop: '1px solid var(--ns-border)', padding: '10px 12px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {keys.map((k) => (
            <button key={k} style={{
              fontFamily: 'var(--ns-font-mono)', fontSize: 22, fontWeight: 500, height: 48,
              borderRadius: 'var(--ns-r-md)', background: 'var(--ns-bg-card)',
              color: 'var(--ns-fg)', border: '1px solid var(--ns-border)', cursor: 'pointer',
            }}>{k}</button>
          ))}
          <button style={{
            gridColumn: '4', fontFamily: 'var(--ns-font-mono)', fontSize: 18, fontWeight: 500, height: 48,
            borderRadius: 'var(--ns-r-md)', background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)',
            border: 'none', cursor: 'pointer',
          }}>✓</button>
        </div>
        <button className="ns-btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: '14px 0', borderRadius: 999, fontSize: 15 }}>
          <NSIcon name="check" size={14} strokeWidth={2}/>確認買入 · NT${cost}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { NSDesktopHoldingDetail, NSDesktopInvestAddSheet, NSMobileInvestAdd });
