const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, "..", "src/routes/AccountsRoute.tsx");
let content = fs.readFileSync(targetPath, 'utf8');

// The new AccountDrawer code
const newDrawer = `function AccountDrawer({
  isEditing, typeStep, setTypeStep, form, setForm, selectedCurrency, currencyOptions, message, pending, onSubmit, onClose,
}: {
  isEditing: boolean;
  typeStep: AccountType | null;
  setTypeStep: (t: AccountType) => void;
  form: AccountFormState;
  setForm: (v: AccountFormState) => void;
  selectedCurrency: string;
  currencyOptions: string[];
  message: string;
  pending: boolean;
  onSubmit: () => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [importMethod, setImportMethod] = useState('skip');
  const [csvDropped, setCsvDropped] = useState(false);

  // If we open in edit mode, go straight to step 1
  useEffect(() => {
    if (isEditing) {
      setStep(1);
    } else if (step === 0 && typeStep) {
      setStep(1);
    }
  }, [isEditing, typeStep]);

  const stepLabels = ['帳戶類型', '基本資料', '初始餘額', '完成'];

  async function handleNext() {
    if (step === 2 || isEditing) {
      await onSubmit();
      if (!isEditing) setStep(3);
    } else {
      setStep(s => s + 1);
    }
  }

  function handleBack() {
    if (step === 0) onClose();
    else if (step === 1 && !isEditing) {
      setTypeStep(null as any);
      setStep(0);
    }
    else if (step === 1 && isEditing) onClose();
    else setStep(s => s - 1);
  }

  const canAdvance = step === 0 ? !!typeStep : step === 1 ? !!form.name.trim() : true;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "min(520px, 100%)", background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)", display: "flex", flexDirection: "column", boxShadow: "-24px 0 60px rgba(0,0,0,0.45)" }}
      >
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--ns-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent)", color: "var(--ns-accent-fg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={16} weight="bold" />
              </div>
              <h2 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 600 }}>
                {isEditing ? "編輯帳戶" : "新增帳戶"}
              </h2>
            </div>
            <button className="ns-btn ghost icon" onClick={onClose} aria-label="關閉"><X size={16} /></button>
          </div>
          {!isEditing && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {stepLabels.map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < stepLabels.length - 1 ? 1 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 99, flexShrink: 0,
                      background: i < step ? 'var(--ns-accent)' : i === step ? 'var(--ns-fg)' : 'var(--ns-bg-hover)',
                      color: i < step ? 'var(--ns-accent-fg)' : i === step ? 'var(--ns-bg)' : 'var(--ns-fg-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--ns-font-mono)', fontWeight: 700, fontSize: 10,
                    }}>
                      {i < step ? "✓" : i + 1}
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
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          {step === 0 && !isEditing && (
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 1 of 4</div>
              <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>選擇帳戶類型</h3>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>帳戶類型決定記帳方式與報表歸類，之後仍可更改。</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {accountTypes.map((type) => (
                  <div key={type} onClick={() => setTypeStep(type)} style={{
                    padding: '14px 16px', borderRadius: 'var(--ns-r-md)',
                    background: typeStep === type ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
                    border: typeStep === type ? '1.5px solid var(--ns-accent)' : '1px solid var(--ns-border)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 'var(--ns-r-sm)', flexShrink: 0,
                      background: typeStep === type ? 'var(--ns-accent)' : 'var(--ns-bg-elev)',
                      color: typeStep === type ? 'var(--ns-accent-fg)' : 'var(--ns-fg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {accountTypeLabels[type].slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{accountTypeLabels[type]}</div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{accountTypeDescriptions[type]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              {!isEditing && <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 2 of 4</div>}
              <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
                {isEditing ? "帳戶基本資料" : "帳戶基本資料"}
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
                <DrawerField label="名稱 *">
                  <input className="ns-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：玉山活存、富邦證券" />
                </DrawerField>
                <DrawerField label="幣別">
                  <select className="ns-input" style={{ appearance: "none" }} value={selectedCurrency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </DrawerField>

                {form.type === "credit" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <DrawerField label="信用額度">
                      <input className="ns-input" type="number" value={form.creditLimit ?? ""} onChange={(e) => setForm({ ...form, creditLimit: e.target.value ? Number(e.target.value) : null })} placeholder="120000" />
                    </DrawerField>
                    <DrawerField label="共用額度群組">
                      <input className="ns-input" value={form.creditLimitGroup} onChange={(e) => setForm({ ...form, creditLimitGroup: e.target.value })} placeholder="玉山信用卡" />
                    </DrawerField>
                  </div>
                ) : null}

                {form.type === "loan" ? (
                  <>
                    <DrawerField label="貸款開始日期">
                      <input className="ns-input" type="date" value={form.loanStartDate ?? ""} onChange={(e) => setForm({ ...form, loanStartDate: e.target.value || null })} />
                    </DrawerField>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <DrawerField label="年利率（%）">
                        <input className="ns-input" type="number" step="0.01" value={form.annualInterestRate ?? ""} onChange={(e) => setForm({ ...form, annualInterestRate: e.target.value ? Number(e.target.value) : null })} placeholder="2.5" />
                      </DrawerField>
                      <DrawerField label="貸款期限（月）">
                        <input className="ns-input" type="number" value={form.loanTerm ?? ""} onChange={(e) => setForm({ ...form, loanTerm: e.target.value ? Number(e.target.value) : null })} placeholder="240" />
                      </DrawerField>
                    </div>
                  </>
                ) : null}

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={form.isSharedToHousehold} onChange={(e) => setForm({ ...form, isSharedToHousehold: e.target.checked })} />
                  未來納入家庭視圖
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Step 3 of 4</div>
              <h3 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>初始餘額與匯入</h3>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
                設定今天的帳戶餘額。也可以直接匯入 CSV 交易紀錄。
              </p>

              <div style={{ marginBottom: 20 }}>
                <DrawerField label={\`當前餘額（\${form.currency}）\`}>
                  <input className="ns-input" style={{ fontSize: 22, fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', height: 56 }} type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                </DrawerField>
                {form.type === 'credit' && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    信用卡餘額請輸入「本期消費應還金額」，系統會記錄為負數（負債）
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--ns-fg-muted)', marginBottom: 8 }}>交易紀錄匯入 <span className="dim">（選填）</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: 'skip', label: '先跳過，稍後手動新增', sub: '' },
                    { id: 'csv', label: '匯入 CSV 交易紀錄', sub: '支援富邦、玉山、永豐、IBKR 等格式' },
                  ].map(m => (
                    <div key={m.id} onClick={() => setImportMethod(m.id)} style={{
                      padding: '13px 16px', borderRadius: 'var(--ns-r-md)',
                      background: importMethod === m.id ? 'var(--ns-accent-soft)' : 'var(--ns-bg-card)',
                      border: importMethod === m.id ? '1.5px solid var(--ns-accent)' : '1px solid var(--ns-border)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.label}</div>
                        {m.sub && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.sub}</div>}
                      </div>
                      {importMethod === m.id && <div style={{ color: 'var(--ns-accent)' }}>✓</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 99, background: 'var(--ns-accent)', color: 'var(--ns-accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 40px color-mix(in srgb, var(--ns-accent) 38%, transparent)', marginBottom: 20 }}>
                <Plus size={32} />
              </div>
              <h2 style={{ fontFamily: 'var(--ns-font-display)', fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>帳戶已建立</h2>
              <p className="muted" style={{ fontSize: 13.5, margin: '0 0 28px', lineHeight: 1.6, maxWidth: 340 }}>
                <strong style={{ color: 'var(--ns-fg)' }}>{form.name || '新帳戶'}</strong> 已加入 Northstar。<br />所有資料只存在這台電腦。
              </p>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)", display: "flex", gap: 8 }}>
          {step < 3 ? (
            <>
              <button className="ns-btn ghost" style={{ flex: "0 0 90px", justifyContent: "center" }} onClick={handleBack}>
                {step === 0 || (step === 1 && isEditing) ? "取消" : "← 上一步"}
              </button>
              <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center", opacity: canAdvance ? 1 : 0.45 }} onClick={() => canAdvance && handleNext()} disabled={pending}>
                {pending ? "處理中…" : step === 2 || isEditing ? "儲存" : "下一步 →"}
              </button>
            </>
          ) : (
            <>
              <button className="ns-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>完成</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}`;

// regex to replace AccountDrawer
const oldDrawerRegex = /function AccountDrawer\(\{[\s\S]*?\n\}\)\s*\{[\s\S]*?\n\}\n/m;
content = content.replace(oldDrawerRegex, newDrawer + "\n");

fs.writeFileSync(targetPath, content, 'utf8');
console.log("Successfully updated AccountsRoute.tsx AccountDrawer!");
