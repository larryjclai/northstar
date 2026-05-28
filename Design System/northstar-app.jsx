// northstar-app.jsx — Main canvas with Tweaks panel

const NS_TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#9fe870",
  "gainLoss": "us",
  "density": "loose",
  "fonts": "space",
  "radius": "default",
  "quickAdd": "calculator"
}/*EDITMODE-END*/;

function NSRoot() {
  const [t, setTweak] = useTweaks(NS_TWEAKS);

  // Apply tokens to <html data-…> attrs so the CSS variables flip.
  React.useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-theme', t.theme);
    r.setAttribute('data-density', t.density);
    r.setAttribute('data-fonts', t.fonts);
    r.setAttribute('data-radius', t.radius);
    // accent override
    if (t.accent) {
      r.style.setProperty('--ns-accent', t.accent);
      // pick readable accent-fg
      const dark = isDarkHex(t.accent);
      r.style.setProperty('--ns-accent-fg', dark ? '#ffffff' : '#0a1a02');
      r.style.setProperty('--ns-accent-soft', `color-mix(in srgb, ${t.accent} 16%, transparent)`);
    }
    // gain/loss palette
    const gl = {
      tw:      { pos: '#ff5d5d', neg: '#3fbf6c' },
      us:      { pos: '#6ee49a', neg: '#ff7d6b' },
      neutral: { pos: '#34c5b0', neg: '#f0a050' },
    }[t.gainLoss] || {};
    if (gl.pos) {
      r.style.setProperty('--ns-pos', gl.pos);
      r.style.setProperty('--ns-pos-soft', `color-mix(in srgb, ${gl.pos} 18%, transparent)`);
    }
    if (gl.neg) {
      r.style.setProperty('--ns-neg', gl.neg);
      r.style.setProperty('--ns-neg-soft', `color-mix(in srgb, ${gl.neg} 18%, transparent)`);
    }
  }, [t]);

  return (
    <>
      <DesignCanvas>
        <DCSection id="foundations" title="Foundations" subtitle="Color, type & components — the Northstar DS">
          <DCArtboard id="colors" label="Color tokens" width={760} height={760}>
            <NSFoundationColors />
          </DCArtboard>
          <DCArtboard id="type" label="Type system" width={760} height={760}>
            <NSFoundationType />
          </DCArtboard>
          <DCArtboard id="components" label="Components" width={920} height={900}>
            <NSFoundationComponents />
          </DCArtboard>
        </DCSection>

        <DCSection id="prototype" title="Prototype" subtitle="Live · click the sidebar to switch screens. Open fullscreen ⤢ to focus.">
          <DCArtboard id="proto-app" label="Northstar app · clickable" width={1440} height={900}>
            <NSPrototype />
          </DCArtboard>
        </DCSection>

        <DCSection id="desktop" title="Desktop" subtitle="1440 × 900 · Tauri shell layout">
          <DCArtboard id="d-dashboard-v2" label="Dashboard V2 · complete" width={1440} height={900}>
            <NSDesktopDashboardV2 />
          </DCArtboard>
          <DCArtboard id="d-dashboard" label="Dashboard · original" width={1440} height={900}>
            <NSDesktopDashboard />
          </DCArtboard>
          <DCArtboard id="d-holdings" label="Holdings · FIFO" width={1440} height={900}>
            <NSDesktopHoldings />
          </DCArtboard>
          <DCArtboard id="d-cashflow" label="Cash Flow" width={1440} height={900}>
            <NSDesktopCashFlow />
          </DCArtboard>
          <DCArtboard id="d-accounts" label="Accounts" width={1440} height={900}>
            <NSDesktopAccounts />
          </DCArtboard>
          <DCArtboard id="d-acct-add" label="Accounts · 新增帳戶 flow" width={1440} height={900}>
            <NSDesktopAddAccountFlow />
          </DCArtboard>
          <DCArtboard id="d-goals" label="Goals · FIRE" width={1440} height={900}>
            <NSDesktopGoals />
          </DCArtboard>
          <DCArtboard id="d-connect" label="Settings · Connect" width={1440} height={900}>
            <NSDesktopConnect />
          </DCArtboard>
          <DCArtboard id="d-settings-v2" label="Settings · 分類 / 商家 / 匯率 / 匯出" width={1440} height={900}>
            <NSDesktopSettingsV2 />
          </DCArtboard>
          <DCArtboard id="d-onboarding" label="Onboarding" width={1440} height={900}>
            <NSDesktopOnboarding />
          </DCArtboard>
          <DCArtboard id="d-holding-detail" label="Holdings · 2330.TW 詳情" width={1440} height={900}>
            <NSDesktopHoldingDetail />
          </DCArtboard>
          <DCArtboard id="d-inv-add" label="Investments · Add sheet" width={1440} height={900}>
            <NSDesktopInvestAddSheet />
          </DCArtboard>
          <DCArtboard id="d-cf-detail" label="Cash Flow · Transaction detail" width={1440} height={900}>
            <NSDesktopCashFlowDetail />
          </DCArtboard>
          <DCArtboard id="d-cf-new" label="Cash Flow · New transaction" width={1440} height={900}>
            <NSDesktopNewTxSheet />
          </DCArtboard>
          <DCArtboard id="d-cat-mgmt" label="Cash Flow · Categories" width={1440} height={900}>
            <NSDesktopCategoryMgmt />
          </DCArtboard>
          <DCArtboard id="d-fire-calc" label="FIRE Calculator · Interactive" width={1440} height={900}>
            <NSDesktopFireCalc />
          </DCArtboard>
        </DCSection>

        <DCSection id="mobile" title="Mobile" subtitle="iOS 26 · 393 × 852">
          <DCArtboard id="m-dashboard" label="Dashboard" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileDashboard />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-quickadd" label="Quick add · numpad" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileQuickAdd />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-holding" label="Holding · 2330.TW" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileHoldingDetail />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-accounts" label="Accounts" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileAccounts />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-goals" label="Goals · FIRE" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileGoals />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-onboarding" label="Onboarding" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileOnboarding />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-inv-add" label="Investment · Add sheet" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileInvestAdd />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-cat-mgmt" label="Cash Flow · Categories" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileCategoryMgmt />
            </IOSDevice>
          </DCArtboard>
          <DCArtboard id="m-fire-calc" label="FIRE Calculator" width={420} height={870}>
            <IOSDevice width={420} height={870} dark={t.theme === 'dark'}>
              <NSMobileFireCalc />
            </IOSDevice>
          </DCArtboard>
        </DCSection>

        <DCSection id="interactions" title="Interactions" subtitle="Fast-entry · charting">
          <DCArtboard id="numpad" label="Calculator" width={760} height={620}>
            <NSInteractionNumpad />
          </DCArtboard>
          <DCArtboard id="quickbar" label="Quick-add bar" width={1180} height={720}>
            <NSInteractionQuickBar />
          </DCArtboard>
          <DCArtboard id="chart" label="Chart · benchmark" width={1180} height={620}>
            <NSInteractionChart />
          </DCArtboard>
        </DCSection>

        <DCPostIt top={20} left={36} rotate={-3} width={210}>
          Northstar DS · v0.1 · use Tweaks to swap theme, accent, gain/loss locale, density.
        </DCPostIt>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={t.theme}
                    options={['light','dark']}
                    onChange={(v) => setTweak('theme', v)} />
        <TweakColor label="Accent"
                    value={t.accent}
                    options={['#9fe870','#6fb3ff','#e8c547','#ff7a59','#a99cff','#f4f3ee']}
                    onChange={(v) => setTweak('accent', v)} />
        <TweakSelect label="Gain / Loss locale" value={t.gainLoss}
                     options={[
                       { value: 'us',      label: 'US · 綠漲紅跌' },
                       { value: 'tw',      label: 'TW · 紅漲綠跌' },
                       { value: 'neutral', label: 'Neutral · Teal/Amber' },
                     ]}
                     onChange={(v) => setTweak('gainLoss', v)} />

        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density}
                    options={['tight','medium','loose']}
                    onChange={(v) => setTweak('density', v)} />
        <TweakRadio label="Radius" value={t.radius}
                    options={['sharp','default','round']}
                    onChange={(v) => setTweak('radius', v)} />

        <TweakSection label="Typography" />
        <TweakSelect label="Font combination" value={t.fonts}
                     options={[
                       { value: 'space', label: 'Space Grotesk + JetBrains Mono' },
                       { value: 'geist', label: 'Geist + Geist Mono' },
                       { value: 'ibm',   label: 'IBM Plex Sans + Mono' },
                       { value: 'serif', label: 'Newsreader + JetBrains Mono' },
                     ]}
                     onChange={(v) => setTweak('fonts', v)} />

        <TweakSection label="Interactions" />
        <TweakRadio label="Quick add" value={t.quickAdd}
                    options={['calculator','natural']}
                    onChange={(v) => setTweak('quickAdd', v)} />
      </TweaksPanel>
    </>
  );
}

function isDarkHex(hex) {
  if (!hex || !hex.startsWith('#')) return false;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  return lum < 0.6;
}

ReactDOM.createRoot(document.getElementById('root')).render(<NSRoot />);
