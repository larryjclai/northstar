// northstar-acct-flow.jsx — Add Account · 4-step side sheet

function NSDesktopAddAccountFlow({ onNavigate } = {}) {
  const [step, setStep]         = React.useState(0);
  const [acctType, setAcctType] = React.useState(null);
  const [form, setForm]         = React.useState({
    name: '', institution: '', currency: 'NTD',
    accountNo: '', group: 'personal', color: 'var(--ns-chart-1)',
  });
  const [balance, setBalance]       = React.useState('');
  const [importMethod, setImportMethod] = React.useState('skip');
  const [csvDropped, setCsvDropped] = React.useState(false);

  const accountTypes = [
    { id: 'cash',       icon: 'wallet',  label: '現金 / 活存', sub: '銀行帳戶、活儲、現金' },
    { id: 'investment', icon: 'chart',   label: '投資 / 券商', sub: '股票、ETF、基金、債券' },
    { id: 'credit',     icon: 'coin',    label: '信用卡',      sub: '應收帳款、信用額度' },
    { id: 'loan',       icon: 'bank',    label: '貸款',        sub: '房貸、車貸、學貸' },
    { id: 'crypto',     icon: 'sparkle', label: '加密貨幣',    sub: 'BTC、ETH、穩定幣' },
    { id: 'manual',     icon: 'star',    label: '手動資產',    sub: '不動產、藝術品、車輛' },
  ];

  const currencies = ['NTD', 'USD', 'JPY', 'EUR', 'GBP', 'HKD', 'CNY', 'AUD', 'SGD'];

  const colorOptions = [
    'var(--ns-chart-1)', 'var(--ns-chart-2)', 'var(--ns-chart-3)',
    'var(--ns-chart-4)', 'var(--ns-chart-5)', 'var(--ns-neg)',
  ];

  const groupOptions = [
    { id: 'personal',  label: '個人' },
    { id: 'household', label: '家庭共用' },
    { id: 'private',   label: '私人 vault' },
  ];

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedType = accountTypes.find(t => t.id === acctType);
  const stepLabels   = ['帳戶類型', '基本資料', '初始餘額', '完成'];

  const ccyPrefix = { NTD: 'NT$', JPY: '¥', EUR: '€', GBP: '£' };
  const prefix = ccyPrefix[form.currency] || '$';

  function resetFlow() {
    setStep(0); setAcctType(null); setBalance(''); setImportMethod('skip'); setCsvDropped(false);
    setForm({ name: '', institution: '', currency: 'NTD', accountNo: '', group: 'personal', color: 'var(--ns-chart-1)' });
  }

  // ─── Step progress bar ───
  function StepBar() {
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {stepLabels.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                background: i < step ? 'var(--ns-accent)' : i === step ? 'var(--ns-fg)' : 'var(--ns-bg-hover)',
                color: i < step ? 'var(--ns-accent-fg)' : i === step ? 'var(--ns-bg)' : 'var(--ns-fg-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--ns-font-mono)', fontWeight: 700, fontSize: 10,
              }}>
                {i < step ? <NSIcon name="check" size={10} strokeWidth={2.5} /> : i + 1}
              </div>
              <span style={{
                fontSize: 11.5, whiteSpace: 'nowrap',
                color: i === step ? 'var(--ns-fg)' : 'var(--ns-fg-dim)',
                fontWeight: i === step ? 500 : 400,
              }}>{s}</span>
            </div>
            {i < stepLabels.length - 1 && (
              <div style={{
                flex: 1, height: 1, margin: '0 6px', minWidth: 8,
                background: i < step ? 'var(--ns-accent)' : 'var(--ns-border)',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  // ─── Step 0 · Account type picker ───
  function StepType() {
    return (
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 1 of 4</div>
        <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
          選擇帳戶類型
        </h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
          帳戶類型決定記帳方式與報表歸類，之後仍可更改。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {accountTypes.map(t => (
            <div key={t.id} onClick={() => setAcctType(t.id)} style={{
              padding: '14px 16px', borderRadius: 'var(--ns-r-md)',
              background: acctType === t.id ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
              border: acctType === t.id ? '1.5px solid var(--ns-accent)' : '1px solid var(--ns-border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              transition: 'border-color var(--ns-dur) var(--ns-ease), background var(--ns-dur) var(--ns-ease)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--ns-r-sm)', flexShrink: 0,
                background: acctType === t.id ? 'var(--ns-accent)' : 'var(--ns-bg-elev)',
                color: acctType === t.id ? 'var(--ns-accent-fg)' : 'var(--ns-fg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background var(--ns-dur) var(--ns-ease)',
              }}>
                <NSIcon name={t.icon} size={16} />
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.label}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Step 1 · Account details form ───
  function StepDetails() {
    return (
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 2 of 4</div>
        <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
          帳戶基本資料
        </h3>
        {selectedType && (
          <div style={{ marginBottom: 16 }}>
            <span className="ns-pill solid-accent">
              <NSIcon name={selectedType.icon} size={11} />{selectedType.label}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 6 }}>
              帳戶名稱 <span style={{ color: 'var(--ns-neg)' }}>*</span>
            </label>
            <input className="ns-input"
              placeholder="例：玉山活存、富邦證券、BitoPro"
              value={form.name}
              onChange={e => setField('name', e.target.value)} />
          </div>

          {/* Institution */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 6 }}>
              金融機構 / 平台
            </label>
            <input className="ns-input"
              placeholder="例：玉山銀行、Interactive Brokers、Binance"
              value={form.institution}
              onChange={e => setField('institution', e.target.value)} />
          </div>

          {/* Currency */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>幣別</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {currencies.map(c => (
                <button key={c}
                  onClick={() => setField('currency', c)}
                  className={'ns-btn' + (form.currency === c ? ' primary' : '')}
                  style={{ padding: '6px 14px', fontSize: 12.5 }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Account No */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 6 }}>
              帳號末四碼 <span className="dim">（選填，僅存本機）</span>
            </label>
            <input className="ns-input"
              placeholder="1234"
              maxLength={4}
              value={form.accountNo}
              onChange={e => setField('accountNo', e.target.value.replace(/\D/g, ''))} />
          </div>

          {/* Group */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>歸類</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {groupOptions.map(g => (
                <button key={g.id}
                  onClick={() => setField('group', g.id)}
                  className={'ns-btn' + (form.group === g.id ? ' primary' : '')}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              {form.group === 'household'
                ? '此帳戶會出現在家庭總覽中（如果你開啟了 Household 功能）'
                : form.group === 'private'
                  ? '此帳戶僅在私人 vault 解鎖後可見，不出現在家庭視圖'
                  : '此帳戶只對你可見'}
            </div>
          </div>

          {/* Color */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>顯示顏色</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {colorOptions.map((c, i) => (
                <div key={i} onClick={() => setField('color', c)} style={{
                  width: 26, height: 26, borderRadius: 99, background: c, cursor: 'pointer',
                  outline: form.color === c ? '2px solid var(--ns-fg)' : 'none',
                  outlineOffset: 2, transition: 'outline var(--ns-dur-fast)',
                }} />
              ))}
              {/* Live preview */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <NSMark label={form.name ? form.name.slice(0, 2) : '帳'} color={form.color} size={32} />
                <span style={{ fontSize: 12, color: 'var(--ns-fg-muted)' }}>預覽</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 2 · Balance & import ───
  function StepBalance() {
    return (
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 3 of 4</div>
        <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
          初始餘額與匯入
        </h3>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
          設定今天的帳戶餘額。也可以直接匯入 CSV 交易紀錄讓 Northstar 自動計算。
        </p>

        {/* Account preview chip */}
        <div className="ns-card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <NSMark label={form.name ? form.name.slice(0, 2) : '帳'} color={form.color} size={38} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500 }}>{form.name || '帳戶名稱'}</div>
            <div className="muted" style={{ fontSize: 12 }}>{form.institution || '—'} · {form.currency}</div>
          </div>
          <span className="ns-pill solid-accent" style={{ fontSize: 10.5 }}>
            {selectedType ? selectedType.label : '—'}
          </span>
        </div>

        {/* Balance input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>
            當前餘額（{form.currency}）
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--ns-fg-muted)', fontSize: 16, pointerEvents: 'none',
            }}>{prefix}</span>
            <input className="ns-input"
              style={{ paddingLeft: 40, fontSize: 22, fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', height: 56 }}
              placeholder="0"
              value={balance}
              onChange={e => setBalance(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          {acctType === 'credit' && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <NSIcon name="coin" size={12} />
              信用卡餘額請輸入「本期消費應還金額」，系統會記錄為負數（負債）
            </div>
          )}
        </div>

        {/* Import method */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>
            交易紀錄匯入 <span className="dim">（選填）</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'skip', icon: 'plus',   label: '先跳過，稍後手動新增',         sub: '' },
              { id: 'csv',  icon: 'upload', label: '匯入 CSV 交易紀錄',            sub: '支援富邦、玉山、永豐、IBKR 等格式' },
            ].map(m => (
              <div key={m.id} onClick={() => setImportMethod(m.id)} style={{
                padding: '13px 16px', borderRadius: 'var(--ns-r-md)',
                background: importMethod === m.id ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
                border: importMethod === m.id ? '1.5px solid var(--ns-accent)' : '1px solid var(--ns-border)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                transition: 'all var(--ns-dur) var(--ns-ease)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--ns-r-sm)', flexShrink: 0,
                  background: importMethod === m.id ? 'var(--ns-accent)' : 'var(--ns-bg-elev)',
                  color: importMethod === m.id ? 'var(--ns-accent-fg)' : 'var(--ns-fg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <NSIcon name={m.icon} size={15} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.label}</div>
                  {m.sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.sub}</div>}
                </div>
                {importMethod === m.id && (
                  <div style={{ color: 'var(--ns-accent)' }}>
                    <NSIcon name="check" size={14} strokeWidth={2.2} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CSV drop zone */}
          {importMethod === 'csv' && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); setCsvDropped(true); }}
              onClick={() => setCsvDropped(true)}
              style={{
                marginTop: 12, padding: '28px 16px', borderRadius: 'var(--ns-r-md)',
                border: csvDropped ? '1.5px solid var(--ns-accent)' : '1.5px dashed var(--ns-border)',
                background: csvDropped ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
                textAlign: 'center', cursor: 'pointer',
                transition: 'all var(--ns-dur) var(--ns-ease)',
              }}>
              {csvDropped ? (
                <>
                  <NSIcon name="check" size={22} strokeWidth={2} />
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8, color: 'var(--ns-accent)' }}>
                    fubon-2026-05.csv · 142 筆
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>欄位自動對應完成 · 點此更換</div>
                </>
              ) : (
                <>
                  <NSIcon name="upload" size={22} />
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 8 }}>拖曳 CSV 至此，或點此選擇</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    支援富邦、玉山、永豐、IBKR、Binance 格式
                  </div>
                </>
              )}
            </div>
          )}

          {/* CSV field mapping preview */}
          {importMethod === 'csv' && csvDropped && (
            <div className="ns-card" style={{ padding: 0, marginTop: 12 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--ns-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>欄位對應 · 預覽 3 / 142 筆</span>
                <span className="ns-pill solid-pos" style={{ fontSize: 10.5 }}>自動對應</span>
              </div>
              <div style={{ padding: '6px 16px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', fontSize: 10, color: 'var(--ns-fg-dim)', fontFamily: 'var(--ns-font-mono)', letterSpacing: 0.06, textTransform: 'uppercase' }}>
                <span>日期</span><span>說明</span><span>金額</span><span>幣別</span>
              </div>
              {[
                ['2026-05-22', '台積電配息', '+3,500', 'NTD'],
                ['2026-05-21', 'Uber', '-250', 'NTD'],
                ['2026-05-20', 'Costco', '-3,850', 'NTD'],
              ].map((r, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
                  padding: '8px 16px', borderTop: '1px solid var(--ns-border)',
                  fontFamily: 'var(--ns-font-mono)', fontSize: 12,
                }}>
                  <span className="muted">{r[0]}</span>
                  <span>{r[1]}</span>
                  <span className={r[2].startsWith('+') ? 'pos' : 'neg'}>{r[2]}</span>
                  <span className="muted">{r[3]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Step 3 · Success ───
  function StepSuccess() {
    const groupLabel = { personal: '個人', household: '家庭共用', private: '私人 vault' }[form.group];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', textAlign: 'center' }}>
        {/* Checkmark */}
        <div style={{
          width: 72, height: 72, borderRadius: 99,
          background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 40px color-mix(in srgb, var(--ns-accent) 38%, transparent)',
          marginBottom: 20,
        }}>
          <NSIcon name="check" size={32} strokeWidth={2.2} />
        </div>
        <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>
          帳戶已建立
        </h2>
        <p className="muted" style={{ fontSize: 13.5, margin: '0 0 28px', lineHeight: 1.6, maxWidth: 340 }}>
          <strong style={{ color: 'var(--ns-fg)' }}>{form.name || '新帳戶'}</strong> 已加入 Northstar。
          <br />所有資料只存在這台電腦，沒有傳送至任何伺服器。
        </p>

        {/* Summary card */}
        <div className="ns-card" style={{ padding: '16px 20px', width: '100%', textAlign: 'left', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <NSMark label={form.name ? form.name.slice(0, 2) : '帳'} color={form.color} size={42} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{form.name || '新帳戶'}</div>
              <div className="muted" style={{ fontSize: 12 }}>{form.institution || '—'} · {form.currency}</div>
            </div>
            <span className="ns-pill solid-accent" style={{ marginLeft: 'auto', fontSize: 10.5 }}>
              {selectedType ? selectedType.label : '—'}
            </span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 12, paddingTop: 12, borderTop: '1px solid var(--ns-border)',
            fontSize: 12,
          }}>
            {[
              ['初始餘額', balance ? `${prefix}${parseFloat(balance || 0).toLocaleString()}` : '—'],
              ['歸類',     groupLabel],
              ['帳號末四碼', form.accountNo ? `•••• ${form.accountNo}` : '—'],
              ['匯入方式', importMethod === 'csv' ? csvDropped ? 'CSV · 142 筆' : 'CSV（待上傳）' : '手動新增'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="muted">{k}</div>
                <div style={{ marginTop: 3, fontWeight: 500, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tip */}
        <div className="ns-surface" style={{ padding: '12px 16px', width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <NSIcon name="sparkle" size={14} />
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 500 }}>下一步：</span>
            <span className="muted">
              {importMethod === 'csv' && csvDropped
                ? '匯入完成後，Northstar 會自動分類交易。你可以在 Cash Flow 逐筆確認。'
                : '在帳戶頁面點擊「記一筆」或使用 Quick Add bar 開始記錄。'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const canAdvance = step === 0 ? !!acctType : step === 1 ? !!form.name : true;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Background: accounts page */}
      <NSDesktopAccounts onNavigate={onNavigate} />

      {/* Dimmed backdrop */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)',
        zIndex: 10,
      }} />

      {/* Side sheet */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 520, zIndex: 11,
        background: 'var(--ns-bg-elev)', borderLeft: '1px solid var(--ns-border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 60px rgba(0,0,0,0.45)',
      }}>
        {/* Sheet header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--ns-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--ns-r-sm)',
                background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <NSIcon name="plus" size={16} strokeWidth={2.2} />
              </div>
              <h2 style={{ margin: 0, fontFamily: 'var(--ns-font-display)', fontSize: 18, fontWeight: 600 }}>
                新增帳戶
              </h2>
            </div>
            <button className="ns-btn ghost icon"
              onClick={() => onNavigate && onNavigate('accounts')}>
              ✕
            </button>
          </div>
          <StepBar />
        </div>

        {/* Sheet body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {step === 0 && <StepType />}
          {step === 1 && <StepDetails />}
          {step === 2 && <StepBalance />}
          {step === 3 && <StepSuccess />}
        </div>

        {/* Sheet footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--ns-border)', display: 'flex', gap: 8 }}>
          {step < 3 ? (
            <>
              <button className="ns-btn ghost"
                style={{ flex: '0 0 90px', justifyContent: 'center' }}
                onClick={() => step === 0 ? (onNavigate && onNavigate('accounts')) : setStep(s => s - 1)}>
                {step === 0 ? '取消' : '← 上一步'}
              </button>
              <button
                className={'ns-btn primary' + (canAdvance ? '' : '')}
                style={{
                  flex: 1, justifyContent: 'center',
                  opacity: canAdvance ? 1 : 0.45, cursor: canAdvance ? 'pointer' : 'default',
                }}
                onClick={() => canAdvance && setStep(s => s + 1)}>
                {step === 2 ? '建立帳戶 →' : '下一步 →'}
              </button>
            </>
          ) : (
            <>
              <button className="ns-btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={resetFlow}>
                <NSIcon name="plus" size={14} strokeWidth={2} />繼續新增帳戶
              </button>
              <button className="ns-btn primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => onNavigate && onNavigate('accounts')}>
                <NSIcon name="check" size={14} strokeWidth={2} />查看帳戶
              </button>
            </>
          )}
        </div>

        {/* Privacy note */}
        {step < 3 && (
          <div style={{
            padding: '8px 24px 14px', display: 'flex', alignItems: 'center',
            gap: 6, fontSize: 11, color: 'var(--ns-fg-dim)',
          }}>
            <NSIcon name="lock" size={11} />
            帳戶資料只存在這台電腦，不會傳送至任何伺服器
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { NSDesktopAddAccountFlow });
