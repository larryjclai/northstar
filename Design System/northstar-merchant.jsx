// northstar-merchant.jsx — Merchant detail page (full page, unique widgets)

const merchantMonthlyData = [
  { month: '12月', total: 3200, visits: 14, label: 'Dec' },
  { month: '1月',  total: 4100, visits: 17, label: 'Jan' },
  { month: '2月',  total: 2800, visits: 12, label: 'Feb' },
  { month: '3月',  total: 3600, visits: 15, label: 'Mar' },
  { month: '4月',  total: 4520, visits: 19, label: 'Apr' },
  { month: '5月',  total: 960,  visits: 4,  label: 'May', partial: true },
];

const dowBreakdown = [
  { d: '一', v: 8  },
  { d: '二', v: 12 },
  { d: '三', v: 10 },
  { d: '四', v: 9  },
  { d: '五', v: 15 },
  { d: '六', v: 6  },
  { d: '日', v: 3  },
];

const merchantTxns = [
  { date: '2026-05-27', name: 'UberX to 台北車站',  acc: 'Cathay World Card', amt: 250  },
  { date: '2026-05-22', name: 'UberX to 南港',       acc: 'Cathay World Card', amt: 180  },
  { date: '2026-05-19', name: 'UberX to 信義',       acc: 'Cathay World Card', amt: 310  },
  { date: '2026-05-14', name: 'UberX to 松山機場',   acc: 'Cathay World Card', amt: 420  },
  { date: '2026-04-30', name: 'Uber Eats · 烤肉便當', acc: 'Cathay World Card', amt: 185 },
  { date: '2026-04-28', name: 'UberX to 大直',       acc: 'Cathay World Card', amt: 195  },
  { date: '2026-04-25', name: 'Uber Eats · 拉麵',    acc: 'Cathay World Card', amt: 210  },
  { date: '2026-04-20', name: 'UberX to 內湖',       acc: 'Cathay World Card', amt: 280  },
  { date: '2026-04-12', name: 'UberX to 信義',       acc: 'Cathay World Card', amt: 320  },
  { date: '2026-04-05', name: 'Uber Eats · 壽司',    acc: 'Cathay World Card', amt: 240  },
];

const relatedMerchants = [
  { mark: 'LT', color: 'var(--ns-chart-5)', name: 'LINE TAXI', amt: 1240, visits: 6  },
  { mark: '大', color: 'var(--ns-chart-1)', name: '台灣大車隊',  amt: 890,  visits: 4  },
  { mark: '捷', color: 'var(--ns-chart-2)', name: '台北捷運',    amt: 3200, visits: 42 },
];

// ─────── Merchant Detail Page ───────
function NSDesktopMerchantDetail({ onNavigate } = {}) {
  const [ruleEnabled, setRuleEnabled] = React.useState(true);
  const [ruleEditing, setRuleEditing] = React.useState(false);
  const [hoveredBar, setHoveredBar]   = React.useState(null);

  const completedMonths = merchantMonthlyData.filter(m => !m.partial);
  const totalYTD     = merchantMonthlyData.slice(1).reduce((s, m) => s + m.total, 0);
  const totalVisits  = merchantMonthlyData.slice(1).reduce((s, m) => s + m.visits, 0);
  const avgPerVisit  = Math.round(totalYTD / totalVisits);
  const avgPerMonth  = Math.round(totalYTD / completedMonths.length);
  const maxBar       = Math.max(...merchantMonthlyData.map(m => m.total));
  const maxDow       = Math.max(...dowBreakdown.map(d => d.v));
  const peakDay      = dowBreakdown.find(d => d.v === maxDow);
  const txnTotal     = merchantTxns.reduce((s, t) => s + t.amt, 0);

  return (
    <NSDesktopShell active="cashflow" onNavigate={onNavigate}>
      <div style={{ height: '100%', overflow: 'auto', padding: '24px 32px 100px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: 'var(--ns-fg-muted)' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => onNavigate && onNavigate('cashflow')}>Cash Flow</span>
          <NSIcon name="chevRight" size={13}/>
          <span style={{ cursor: 'pointer', color: 'var(--ns-fg-muted)' }}>Merchants</span>
          <NSIcon name="chevRight" size={13}/>
          <span style={{ fontWeight: 500, color: 'var(--ns-fg)' }}>Uber</span>
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <NSMark label="UB" color="var(--ns-chart-4)" size={52}/>
            <div>
              <div className="mono" style={{ fontSize: 12, letterSpacing: 0.06, textTransform: 'uppercase', color: 'var(--ns-fg-muted)', marginBottom: 3 }}>
                Merchant · 交通
              </div>
              <h1 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 26, margin: '0 0 6px', fontWeight: 600, letterSpacing: -0.02 }}>
                Uber
              </h1>
              <div style={{ display: 'flex', gap: 7 }}>
                <span className="ns-pill"><span>交通</span></span>
                <span className="ns-pill"><span>計程車 · 外送</span></span>
                <span className="ns-pill"><span>Cathay World Card</span></span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ns-btn ghost"><NSIcon name="tag" size={14}/>Rename</button>
            <button className="ns-btn ghost"><NSIcon name="dots" size={14}/></button>
          </div>
        </div>

        {/* Main grid: chart + right column */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 308px', gap: 18, marginBottom: 18 }}>

          {/* Spending trend chart */}
          <div className="ns-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Spending trend · 6 months</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span className="ns-num-lg mono">NT${totalYTD.toLocaleString()}</span>
                  <span className="dim mono" style={{ fontSize: 13 }}>YTD 2026</span>
                </div>
              </div>
              <div className="ns-seg">
                <button aria-selected>6M</button>
                <button>1Y</button>
                <button>All</button>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
              {merchantMonthlyData.map((m, i) => {
                const barH    = (m.total / maxBar) * 110;
                const isHover = hoveredBar === i;
                return (
                  <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                       onMouseEnter={() => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}>
                    {/* Tooltip */}
                    <div style={{
                      fontSize: 11, fontFamily: 'var(--ns-font-mono)', textAlign: 'center', lineHeight: 1.4,
                      visibility: isHover ? 'visible' : 'hidden', color: 'var(--ns-fg)',
                    }}>
                      <div style={{ fontWeight: 600 }}>NT${m.total.toLocaleString()}</div>
                      <div className="muted">{m.visits} 次</div>
                    </div>
                    <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{
                        width: '100%', height: barH, minHeight: 4, borderRadius: 'var(--ns-r-sm) var(--ns-r-sm) 0 0',
                        background: m.partial
                          ? `repeating-linear-gradient(45deg, var(--ns-chart-4) 0px, var(--ns-chart-4) 2px, transparent 2px, transparent 7px)`
                          : 'var(--ns-chart-4)',
                        opacity: isHover ? 1 : m.partial ? 0.55 : 0.85,
                        transition: 'opacity 0.12s',
                      }}/>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ns-fg-dim)' }}>{m.month}</span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 18, fontSize: 11.5, color: 'var(--ns-fg-dim)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--ns-border)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ns-chart-4)', opacity: 0.85 }}/>
                完整月份
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, border: '2px dashed var(--ns-chart-4)', opacity: 0.7 }}/>
                本月（進行中）
              </span>
              <div style={{ flex: 1 }}/>
              <span className="mono">月均 NT${avgPerMonth.toLocaleString()}</span>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Stats card */}
            <div className="ns-card" style={{ padding: 20 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>Stats · YTD 2026</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {[
                  ['Total visits',    totalVisits + ' 次'],
                  ['Avg per visit',   'NT$' + avgPerVisit.toLocaleString()],
                  ['Monthly average', 'NT$' + avgPerMonth.toLocaleString()],
                  ['Last visit',      '今天 09:10'],
                  ['Accounts used',   'Cathay World Card'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 12 }}>{l}</span>
                    <span className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Day-of-week widget — unique to merchant page */}
            <div className="ns-card" style={{ padding: 20 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 14 }}>Visit pattern · day of week</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
                {dowBreakdown.map(d => {
                  const isPeak = d.v === maxDow;
                  return (
                    <div key={d.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: '100%',
                        height: (d.v / maxDow) * 52,
                        background: isPeak ? 'var(--ns-chart-4)' : 'var(--ns-bg-hover)',
                        borderRadius: 'var(--ns-r-sm) var(--ns-r-sm) 0 0', minHeight: 4,
                        transition: 'background 0.12s',
                      }}/>
                      <span className="mono" style={{ fontSize: 10, color: isPeak ? 'var(--ns-fg)' : 'var(--ns-fg-dim)', fontWeight: isPeak ? 600 : 400 }}>
                        {d.d}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                <span style={{ color: 'var(--ns-chart-4)', fontWeight: 600 }}>週{peakDay?.d}</span> 是最常使用的日子
              </div>
            </div>
          </div>
        </div>

        {/* Auto-categorization rule — unique widget */}
        <div className="ns-card" style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 'var(--ns-r-sm)', flexShrink: 0,
              background: ruleEnabled ? 'var(--ns-accent-soft)' : 'var(--ns-bg-hover)',
              border: ruleEnabled ? '1px solid var(--ns-accent)' : '1px solid var(--ns-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}>
              <NSIcon name="sparkle" size={16} style={{ color: ruleEnabled ? 'var(--ns-accent)' : 'var(--ns-fg-dim)' }}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Auto-categorization rule</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {ruleEnabled
                  ? '含「UBER」的交易 → 自動標記為交通 › 計程車（含未來匯入）'
                  : '無規則 · 每筆交易需手動分類'}
              </div>
            </div>
            {/* Toggle */}
            <div onClick={() => { setRuleEnabled(!ruleEnabled); setRuleEditing(false); }} style={{
              width: 42, height: 24, borderRadius: 99, cursor: 'pointer', flexShrink: 0,
              background: ruleEnabled ? 'var(--ns-accent)' : 'var(--ns-bg-hover)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 18, height: 18, background: '#fff', borderRadius: 99,
                position: 'absolute', top: 3,
                left: ruleEnabled ? 21 : 3,
                transition: 'left 0.18s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.28)',
              }}/>
            </div>
          </div>

          {/* Rule detail (expanded when on) */}
          {ruleEnabled && (
            <div style={{
              marginTop: 16, paddingTop: 14,
              borderTop: '1px solid var(--ns-border)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span className="muted" style={{ fontSize: 12.5 }}>商家名稱包含</span>
              <span className="ns-pill"><span className="mono">UBER</span></span>
              <NSIcon name="chevRight" size={13}/>
              <span className="muted" style={{ fontSize: 12.5 }}>分類為</span>
              <span className="ns-pill">交通</span>
              <span className="ns-pill">計程車</span>
              <div style={{ flex: 1 }}/>
              {!ruleEditing ? (
                <button className="ns-btn ghost" style={{ fontSize: 12 }} onClick={() => setRuleEditing(true)}>
                  <NSIcon name="settings" size={13}/>Edit rule
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="ns-input" style={{ appearance: 'none', fontSize: 12.5, padding: '4px 10px', height: 30 }}>
                    <option>交通</option><option>食物</option><option>娛樂</option><option>訂閱</option>
                  </select>
                  <select className="ns-input" style={{ appearance: 'none', fontSize: 12.5, padding: '4px 10px', height: 30 }}>
                    <option>計程車</option><option>外送</option><option>停車</option>
                  </select>
                  <button className="ns-btn primary" style={{ padding: '4px 12px', fontSize: 12.5 }}
                    onClick={() => setRuleEditing(false)}>Save</button>
                  <button className="ns-btn ghost" style={{ padding: '4px 10px', fontSize: 12.5 }}
                    onClick={() => setRuleEditing(false)}>✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transaction list */}
        <div className="ns-card" style={{ padding: 0, marginBottom: 18 }}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 16, fontWeight: 500 }}>
              Transactions · {merchantTxns.length} records
            </h3>
            <div style={{ flex: 1 }}/>
            <div className="ns-seg" style={{ marginRight: 10 }}>
              <button aria-selected>全部</button>
              <button>UberX</button>
              <button>Uber Eats</button>
            </div>
            <button className="ns-btn ghost" style={{ fontSize: 12.5 }}><NSIcon name="download" size={13}/>Export</button>
          </div>

          {/* Column header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '110px 1fr 1fr 120px 44px',
            padding: '8px 22px', fontSize: 11, letterSpacing: 0.06, textTransform: 'uppercase',
            color: 'var(--ns-fg-dim)', fontFamily: 'var(--ns-font-mono)',
            borderBottom: '1px solid var(--ns-border)', background: 'var(--ns-bg-elev)',
          }}>
            <span>Date</span>
            <span>Description</span>
            <span>Account</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span/>
          </div>

          {merchantTxns.map((tx, i) => (
            <div key={i} onClick={() => onNavigate && onNavigate('cf-detail')} style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 1fr 120px 44px',
              alignItems: 'center', padding: '12px 22px',
              borderTop: '1px solid var(--ns-border)',
              cursor: 'pointer', transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span className="mono muted" style={{ fontSize: 12 }}>{tx.date.slice(5)}</span>
              <span style={{ fontSize: 13.5 }}>{tx.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{tx.acc}</span>
              <span className="neg num" style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                −NT${tx.amt.toLocaleString()}
              </span>
              <span className="dim" style={{ textAlign: 'right' }}><NSIcon name="chevRight" size={13}/></span>
            </div>
          ))}

          <div style={{
            padding: '11px 22px', borderTop: '1px solid var(--ns-border)',
            background: 'var(--ns-bg-elev)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span className="muted mono" style={{ fontSize: 11 }}>Total · {merchantTxns.length} transactions shown</span>
            <span className="neg num" style={{ fontSize: 15, fontWeight: 600 }}>
              −NT${txnTotal.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Related merchants */}
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 12 }}>同類商家 · 交通</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {relatedMerchants.map(m => (
              <div key={m.name} onClick={() => onNavigate && onNavigate('merchant')} className="ns-card" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', flex: '0 0 220px', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
                <NSMark label={m.mark} color={m.color} size={34}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    NT${m.amt.toLocaleString()} · {m.visits} 次
                  </div>
                </div>
                <NSIcon name="chevRight" size={13}/>
              </div>
            ))}
          </div>
        </div>

      </div>
    </NSDesktopShell>
  );
}

Object.assign(window, { NSDesktopMerchantDetail });
