// northstar-prototype.jsx — Fullscreen interactive prototype, sidebar nav routes between screens.

function NSPrototype() {
  const [screen, setScreen] = React.useState('dashboard');
  const screens = {
    dashboard:        NSDesktopDashboardV2,
    holdings:         NSDesktopHoldings,
    'holding-detail': NSDesktopHoldingDetail,
    'inv-add':        NSDesktopInvestAddSheet,
    cashflow:         NSDesktopCashFlow,
    'cf-detail':      NSDesktopCashFlowDetail,
    'cf-new':         NSDesktopNewTxSheet,
    'cat-mgmt':       NSDesktopCategoryMgmt,
    accounts:         NSDesktopAccounts,
    'acct-add':       NSDesktopAddAccountFlow,
    goals:            NSDesktopGoals,
    'fire-calc':      NSDesktopFireCalc,
    connect:          NSDesktopConnect,
    settings:         NSDesktopSettingsV2,
  };
  const Comp = screens[screen] || NSDesktopDashboard;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Comp onNavigate={setScreen} />
      {/* small breadcrumb chip top-right indicating live prototype */}
      <div style={{
        position: 'absolute', top: 14, right: 24, zIndex: 4,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', background: 'var(--ns-bg-card)',
        border: '1px solid var(--ns-border)', borderRadius: 999,
        fontSize: 11, color: 'var(--ns-fg-muted)',
        fontFamily: 'var(--ns-font-mono)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ns-accent)' }}/>
        LIVE PROTOTYPE · click sidebar to navigate
      </div>
    </div>
  );
}

Object.assign(window, { NSPrototype });
