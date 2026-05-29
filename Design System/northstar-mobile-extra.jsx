// northstar-mobile-extra.jsx — Mobile: Holdings Transactions tab + Merchant Detail

// ─────── Mobile Holdings: Transactions Tab ───────
function NSMobileHoldingsTxns() {
  const [assetFilter, setAssetFilter] = React.useState('all');
  const [typeFilter,  setTypeFilter]  = React.useState('all');
  const [selectedTx,  setSelectedTx]  = React.useState(null);

  const data  = typeof allTxnsData  !== 'undefined' ? allTxnsData  : [];
  const sideM = typeof sideMeta     !== 'undefined' ? sideMeta     : {};
  const grpFn = typeof groupTxnsByMonth !== 'undefined' ? groupTxnsByMonth : () => [];

  const filtered = data.filter(tx => {
    if (assetFilter !== 'all' && tx.assetClass !== assetFilter) return false;
    if (typeFilter  !== 'all' && tx.side      !== typeFilter)  return false;
    return true;
  });

  const groups = grpFn(filtered);

  const chipBtn = (active, label, onClick) => (
    <button onClick={onClick} style={{
      padding: '5px 13px', borderRadius: 999, fontSize: 13, whiteSpace: 'nowrap',
      cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
      background: active ? 'var(--ns-fg)' : 'var(--ns-bg-card)',
      color:      active ? 'var(--ns-bg)' : 'var(--ns-fg)',
      border: active ? 'none' : '1px solid var(--ns-border)',
    }}>{label}</button>
  );

  return (
    <NSMobileShell active="chart">
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--ns-border)' }}>
        <div style={{ padding: '12px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.02 }}>Holdings</h1>
          <button className="ns-btn primary" style={{ borderRadius: 999, padding: '7px 14px', fontSize: 13 }}>
            <NSIcon name="plus" size={13} strokeWidth={2}/>Buy
          </button>
        </div>
        {/* Page tabs */}
        <div style={{ display: 'flex', paddingLeft: 18, marginTop: 6 }}>
          {[
            { label: 'Portfolio',     active: false },
            { label: 'Transactions',  active: true  },
          ].map(tab => (
            <button key={tab.label} style={{
              padding: '8px 16px 10px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: tab.active ? 600 : 400,
              color: tab.active ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
              borderBottom: tab.active ? '2px solid var(--ns-accent)' : '2px solid transparent',
              marginBottom: -1,
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Filter chips (horizontal scroll) */}
      <div style={{
        padding: '10px 18px', display: 'flex', gap: 7, overflowX: 'auto',
        borderBottom: '1px solid var(--ns-border)', WebkitOverflowScrolling: 'touch',
      }}>
        {chipBtn(assetFilter==='all',   'All',    () => setAssetFilter('all'))}
        {chipBtn(assetFilter==='stock', 'Stocks', () => setAssetFilter('stock'))}
        {chipBtn(assetFilter==='etf',   'ETF',    () => setAssetFilter('etf'))}
        {chipBtn(assetFilter==='crypto','Crypto', () => setAssetFilter('crypto'))}
        <div style={{ width: 1, height: 24, background: 'var(--ns-border)', flexShrink: 0, alignSelf: 'center' }}/>
        {chipBtn(typeFilter==='all',  'All types', () => setTypeFilter('all'))}
        {chipBtn(typeFilter==='BUY',  'Buy',       () => setTypeFilter('BUY'))}
        {chipBtn(typeFilter==='SELL', 'Sell',      () => setTypeFilter('SELL'))}
        {chipBtn(typeFilter==='DIV',  'Dividend',  () => setTypeFilter('DIV'))}
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid var(--ns-border)', background: 'var(--ns-bg-elev)' }}>
        {[
          ['Records', filtered.length + ' txns'],
          ['Bought',  'NT$' + filtered.filter(t=>t.side==='BUY').reduce((s,t)=>s+t.total,0).toLocaleString()],
          ['Div',     'NT$' + filtered.filter(t=>t.side==='DIV').reduce((s,t)=>s+t.total,0).toLocaleString()],
        ].map(([l,v], i) => (
          <div key={l} style={{ padding: '10px 16px', borderRight: i < 2 ? '1px solid var(--ns-border)' : 'none' }}>
            <div className="muted" style={{ fontSize: 10.5 }}>{l}</div>
            <div className="num" style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Transaction list */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 100 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 18px', textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: 14 }}>No transactions match</div>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.key}>
            {/* Month divider */}
            <div style={{
              padding: '7px 18px', background: 'var(--ns-bg-elev)',
              borderBottom: '1px solid var(--ns-border)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span className="ns-eyebrow">{g.label}</span>
              <span className="muted mono" style={{ fontSize: 11 }}>{g.items.length} 筆</span>
            </div>

            {g.items.map((tx) => {
              const m = sideM[tx.side] || { color: 'var(--ns-accent)', sign: '' };
              return (
                <div key={tx.id} onClick={() => setSelectedTx(tx)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px',
                  borderBottom: '1px solid var(--ns-border)', cursor: 'pointer',
                }}>
                  <NSMark label={tx.asset.slice(0,4)} color={tx.color} size={34} mono/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span className="mono" style={{ fontSize: 13.5, fontWeight: 500 }}>{tx.asset}</span>
                      <span style={{
                        padding: '1px 6px', borderRadius: 999, fontSize: 9.5, letterSpacing: 0.04,
                        fontFamily: 'var(--ns-font-mono)', fontWeight: 600,
                        background: `color-mix(in srgb, ${m.color} 18%, transparent)`,
                        color: m.color,
                      }}>{tx.side}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {tx.date.slice(5)} · {tx.qty < 1 ? tx.qty.toFixed(4) : tx.qty.toLocaleString()}
                      {tx.price > 0 ? ` @ ${tx.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`num ${tx.side === 'SELL' || tx.side === 'DIV' ? 'pos' : ''}`}
                         style={{ fontSize: 14.5, fontWeight: 500 }}>
                      {tx.total === 0 ? '—' : `${m.sign}NT$${tx.total.toLocaleString()}`}
                    </div>
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {tx.acc.split(' ')[0]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Edit bottom sheet */}
      {selectedTx && (
        <NSMobileEditTxSheet tx={selectedTx} onClose={() => setSelectedTx(null)}/>
      )}
    </NSMobileShell>
  );
}

// ─────── Mobile: Transaction Edit Bottom Sheet ───────
function NSMobileEditTxSheet({ tx, onClose }) {
  const [side,  setSide]  = React.useState(tx.side);
  const [qty,   setQty]   = React.useState(String(tx.qty));
  const [price, setPrice] = React.useState(String(tx.price));
  const [fee,   setFee]   = React.useState(String(tx.fee || 0));
  const [confirmDel, setConfirmDel] = React.useState(false);

  const sideM = typeof sideMeta !== 'undefined' ? sideMeta : {};
  const meta  = sideM[side] || { color: 'var(--ns-pos)', sign: '−' };
  const total = parseFloat(qty||0) * parseFloat(price||0);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 30,
      }}/>

      {/* Sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 31,
        background: 'var(--ns-bg-elev)', borderRadius: '20px 20px 0 0',
        borderTop: '1px solid var(--ns-border)',
        maxHeight: '88%', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -16px 48px rgba(0,0,0,0.4)',
      }}>
        {/* Handle */}
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--ns-border)' }}/>
        </div>

        {/* Header */}
        <div style={{ padding: '4px 18px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--ns-border)' }}>
          <NSMark label={tx.asset.slice(0,4)} color={tx.color} size={36} mono/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{tx.asset} · {tx.assetName}</div>
            <div className="muted" style={{ fontSize: 12 }}>Edit · {tx.date}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--ns-bg-hover)', border: 'none', borderRadius: 99, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ns-fg-muted)',
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Side */}
          <div className="ns-seg" style={{ width: '100%' }}>
            {['BUY','SELL','DIV','SPLIT'].map(s => (
              <button key={s} style={{ flex: 1 }} aria-selected={side === s} onClick={() => setSide(s)}>{s}</button>
            ))}
          </div>

          {/* Qty + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Qty</div>
              <input className="ns-input" value={qty} onChange={e => setQty(e.target.value)}
                style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 20, textAlign: 'center' }}/>
            </div>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Price</div>
              <input className="ns-input" value={price} onChange={e => setPrice(e.target.value)}
                style={{ fontFamily: 'var(--ns-font-mono)', fontSize: 20, textAlign: 'center' }}/>
            </div>
          </div>

          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Fee (NT$)</div>
            <input className="ns-input" value={fee} onChange={e => setFee(e.target.value)} placeholder="0"/>
          </div>

          {/* FIFO preview strip */}
          {total > 0 && (side === 'BUY' || side === 'SELL') && (
            <div style={{
              padding: 14, borderRadius: 'var(--ns-r-md)',
              background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
            }}>
              <div className="ns-eyebrow" style={{ marginBottom: 10, color: meta.color }}>FIFO impact</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
                {[
                  ['Subtotal',  `NT$${total.toLocaleString('en', { maximumFractionDigits: 0 })}`],
                  ['+ Fee',     `NT$${(parseFloat(fee||0)).toLocaleString()}`],
                  ['Total',     `NT$${(total + parseFloat(fee||0)).toLocaleString('en', { maximumFractionDigits: 0 })}`],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div className="muted">{l}</div>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Cost basis will be recalculated on save.
              </div>
            </div>
          )}

          {/* Delete */}
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} style={{
              background: 'none', border: `1px solid color-mix(in srgb, var(--ns-neg) 40%, transparent)`,
              borderRadius: 'var(--ns-r-md)', color: 'var(--ns-neg)', padding: '10px 0',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <NSIcon name="backspace" size={13}/>Delete this transaction
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConfirmDel(false); onClose(); }} style={{
                flex: 1, background: 'var(--ns-neg)', border: 'none', borderRadius: 'var(--ns-r-md)',
                color: '#fff', padding: '10px 0', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>確定刪除</button>
              <button onClick={() => setConfirmDel(false)} style={{
                flex: 1, background: 'none', border: '1px solid var(--ns-border)', borderRadius: 'var(--ns-r-md)',
                color: 'var(--ns-fg-muted)', padding: '10px 0', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>取消</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px 34px', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'none', border: '1px solid var(--ns-border)', borderRadius: 999,
            color: 'var(--ns-fg)', padding: '13px 0', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button style={{
            flex: 2, background: 'var(--ns-accent)', border: 'none', borderRadius: 999,
            color: 'var(--ns-accent-fg)', padding: '13px 0', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Save changes</button>
        </div>
      </div>
    </>
  );
}

// ─────── Mobile: Merchant Detail ───────
function NSMobileMerchantDetail() {
  const [ruleEnabled, setRuleEnabled] = React.useState(true);

  const mData = typeof merchantMonthlyData !== 'undefined' ? merchantMonthlyData : [];
  const txns  = typeof merchantTxns       !== 'undefined' ? merchantTxns       : [];
  const dow   = typeof dowBreakdown       !== 'undefined' ? dowBreakdown       : [];

  const totalYTD    = mData.slice(1).reduce((s, m) => s + m.total, 0);
  const totalVisits = mData.slice(1).reduce((s, m) => s + m.visits, 0);
  const avgPerVisit = totalVisits > 0 ? Math.round(totalYTD / totalVisits) : 0;
  const maxBar      = Math.max(...mData.map(m => m.total), 1);
  const maxDow      = Math.max(...dow.map(d => d.v), 1);
  const peakDay     = dow.reduce((a, b) => a.v >= b.v ? a : b, { d: '?', v: 0 });

  return (
    <NSMobileShell active="coin" hideTab>
      {/* Nav header */}
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--ns-border)' }}>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}>
          <NSIcon name="chevRight" size={14} strokeWidth={2} style={{ transform: 'rotate(180deg)' }}/>
        </button>
        <div style={{ flex: 1 }}>
          <div className="muted" style={{ fontSize: 11 }}>Cash Flow · Merchants</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Uber</div>
        </div>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="tag" size={15}/></button>
        <button className="ns-btn icon" style={{ borderRadius: 999 }}><NSIcon name="dots" size={15}/></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
        {/* Hero */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'center' }}>
          <NSMark label="UB" color="var(--ns-chart-4)" size={50}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--ns-font-display)', letterSpacing: -0.02 }}>Uber</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
              <span className="ns-pill">交通</span>
              <span className="ns-pill">計程車 · 外送</span>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            ['YTD 支出', `NT$${totalYTD.toLocaleString()}`],
            ['消費次數', `${totalVisits} 次`],
            ['每次均值', `NT$${avgPerVisit.toLocaleString()}`],
          ].map(([l, v]) => (
            <div key={l} className="ns-card" style={{ padding: '12px 14px' }}>
              <div className="muted" style={{ fontSize: 10.5, marginBottom: 4 }}>{l}</div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Monthly bars */}
        <div className="ns-card" style={{ padding: '16px 16px 14px', marginBottom: 14 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 14 }}>月支出 · 近 6 個月</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
            {mData.map((m, i) => {
              const partial = i === mData.length - 1;
              const barH = Math.max((m.total / maxBar) * 62, 3);
              return (
                <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: '100%', height: 62, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', height: barH, borderRadius: '3px 3px 0 0',
                      background: partial
                        ? `repeating-linear-gradient(45deg, var(--ns-chart-4) 0,var(--ns-chart-4) 2px,transparent 2px,transparent 6px)`
                        : 'var(--ns-chart-4)',
                      opacity: partial ? 0.55 : 0.85,
                    }}/>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ns-fg-dim)' }}>{m.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day-of-week + auto-rule row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {/* DoW */}
          <div className="ns-card" style={{ padding: '14px 14px 12px' }}>
            <div className="ns-eyebrow" style={{ marginBottom: 12 }}>星期分佈</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 52 }}>
              {dow.map(d => (
                <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', minHeight: 3,
                    height: (d.v / maxDow) * 40,
                    borderRadius: '2px 2px 0 0',
                    background: d.v === maxDow ? 'var(--ns-chart-4)' : 'var(--ns-bg-hover)',
                  }}/>
                  <span className="mono" style={{ fontSize: 9.5, color: d.v === maxDow ? 'var(--ns-fg)' : 'var(--ns-fg-dim)' }}>{d.d}</span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 10.5, marginTop: 7 }}>週{peakDay.d} 最頻繁</div>
          </div>

          {/* Auto-rule */}
          <div className="ns-card" style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="ns-eyebrow">自動分類</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{ruleEnabled ? '已啟用' : '未設定'}</span>
              <div onClick={() => setRuleEnabled(!ruleEnabled)} style={{
                width: 38, height: 22, borderRadius: 99, cursor: 'pointer',
                background: ruleEnabled ? 'var(--ns-accent)' : 'var(--ns-bg-hover)',
                position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 16, height: 16, background: '#fff', borderRadius: 99, position: 'absolute', top: 3,
                  left: ruleEnabled ? 19 : 3, transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}/>
              </div>
            </div>
            {ruleEnabled && (
              <div style={{ fontSize: 11.5, color: 'var(--ns-fg-muted)', lineHeight: 1.4 }}>
                UBER → 交通 › 計程車
              </div>
            )}
          </div>
        </div>

        {/* Transaction list */}
        <div className="ns-card" style={{ padding: 0, marginBottom: 14 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="ns-eyebrow">交易紀錄</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{txns.length} 筆</span>
          </div>
          {txns.slice(0, 6).map((tx, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
              borderTop: i ? '1px solid var(--ns-border)' : 'none', cursor: 'pointer',
            }}>
              <span className="mono muted" style={{ fontSize: 11.5, minWidth: 44 }}>{tx.date.slice(5)}</span>
              <span style={{ flex: 1, fontSize: 13.5 }}>{tx.name}</span>
              <span className="neg num" style={{ fontSize: 14, fontWeight: 500 }}>−NT${tx.amt}</span>
            </div>
          ))}
          {txns.length > 6 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--ns-border)', textAlign: 'center' }}>
              <button className="ns-btn ghost" style={{ fontSize: 13, padding: '6px 20px', borderRadius: 999 }}>
                查看全部 {txns.length} 筆 →
              </button>
            </div>
          )}
        </div>
      </div>
    </NSMobileShell>
  );
}

Object.assign(window, { NSMobileHoldingsTxns, NSMobileEditTxSheet, NSMobileMerchantDetail });
