import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, FileCsv, UploadSimple, Warning, X, Trash, FloppyDisk } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { useToast } from "../components/Toast";
import { detectDelimiter, parseCsvTable } from "../data/csv";
import type { InvestmentDraft } from "../data/repositories";
import type { Account, InvestmentAction } from "../domain";
import {
  ACTION_LABELS, ACTION_VALUES, DATE_FORMAT_LABELS, FIELD_LABELS, INVESTMENT_FIELDS, REQUIRED_FIELDS,
  applyInvestmentMapping, autoDetectActivityMap, autoDetectFields, distinctValues, emptyMapping,
  missingRequiredFields, unmappedActions,
  type DateFormat, type InvestmentField, type InvestmentImportMapping,
} from "../data/investmentImport";
import {
  deleteImportTemplate, loadImportTemplates, newTemplateId, upsertImportTemplate, type ImportTemplate,
} from "../state/importTemplates";

type Step = "upload" | "mapping" | "review";

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onImport: (rows: InvestmentDraft[]) => Promise<void>;
}

/** Reconcile a saved/auto mapping against the current file's headers + values. */
function reconcileMapping(base: InvestmentImportMapping, headers: string[], rows: Record<string, string>[]): InvestmentImportMapping {
  const fields: InvestmentImportMapping["fields"] = {};
  for (const field of INVESTMENT_FIELDS) {
    const header = base.fields[field];
    if (header && headers.includes(header)) fields[field] = header;
  }
  const actionValues = distinctValues(rows, fields.action);
  const auto = autoDetectActivityMap(actionValues);
  const activityMap: InvestmentImportMapping["activityMap"] = {};
  for (const value of actionValues) {
    activityMap[value] = base.activityMap[value] ?? auto[value] ?? "ignore";
  }
  return { fields, activityMap, dateFormat: base.dateFormat, signedQuantity: base.signedQuantity };
}

export function InvestmentImportWizard({ open, onClose, accounts, onImport }: Props) {
  const toast = useToast();
  const investAccounts = useMemo(
    () => accounts.filter((a) => a.type === "investment" && a.deletedAt === null),
    [accounts],
  );

  const [step, setStep] = useState<Step>("upload");
  const [accountId, setAccountId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [delimiter, setDelimiter] = useState<string>(",");
  const [mapping, setMapping] = useState<InvestmentImportMapping>(emptyMapping());
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTemplates(loadImportTemplates());
    setStep("upload");
    setAccountId(investAccounts.length === 1 ? investAccounts[0].id : "");
    setFileName(""); setHeaders([]); setRows([]); setMapping(emptyMapping());
    setTemplateId(""); setTemplateName("");
  }, [open, investAccounts]);

  const account = investAccounts.find((a) => a.id === accountId);
  const preview = useMemo(() => {
    if (step !== "review" || !account) return null;
    return applyInvestmentMapping(rows, mapping, { linkedAccountId: account.id, accountCurrency: account.currency });
  }, [step, account, rows, mapping]);

  if (!open) return null;

  const actionHeader = mapping.fields.action;
  const actionValues = distinctValues(rows, actionHeader);

  async function handleFile(file: File) {
    const text = await file.text();
    const delim = detectDelimiter(text);
    const table = parseCsvTable(text, delim);
    if (table.headers.length === 0) { toast.error("無法解析此 CSV（找不到標題列）"); return; }
    setFileName(file.name);
    setDelimiter(delim);
    setHeaders(table.headers);
    setRows(table.rows);
    // Apply selected template if any, else auto-detect.
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setMapping(reconcileMapping(tpl.mapping, table.headers, table.rows));
    } else {
      const fields = autoDetectFields(table.headers);
      const activityMap = autoDetectActivityMap(distinctValues(table.rows, fields.action));
      setMapping({ fields, activityMap, dateFormat: "auto" });
    }
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateName(tpl.name);
    if (headers.length) setMapping(reconcileMapping(tpl.mapping, headers, rows));
  }

  function setField(field: InvestmentField, header: string) {
    setMapping((prev) => {
      const fields = { ...prev.fields };
      if (header) fields[field] = header; else delete fields[field];
      let activityMap = prev.activityMap;
      if (field === "action") {
        const values = distinctValues(rows, header || undefined);
        const auto = autoDetectActivityMap(values);
        activityMap = {};
        for (const v of values) activityMap[v] = prev.activityMap[v] ?? auto[v] ?? "ignore";
      }
      return { ...prev, fields, activityMap };
    });
  }

  function setActivity(value: string, action: InvestmentAction | "ignore") {
    setMapping((prev) => ({ ...prev, activityMap: { ...prev.activityMap, [value]: action } }));
  }

  function saveTemplate(asNew: boolean) {
    const name = templateName.trim();
    if (!name) { toast.error("請先輸入範本名稱"); return; }
    const id = asNew || !templateId ? newTemplateId() : templateId;
    const next = upsertImportTemplate({ id, name, mapping, updatedAt: "" });
    setTemplates(next);
    setTemplateId(id);
    toast.success(asNew || !templateId ? "已儲存新範本" : "已更新範本");
  }

  function removeTemplate() {
    if (!templateId) return;
    setTemplates(deleteImportTemplate(templateId));
    setTemplateId("");
    toast.success("已刪除範本");
  }

  const missing = missingRequiredFields(mapping);
  const pendingActions = unmappedActions(actionValues, mapping);
  const canMap = headers.length > 0 && !!accountId;
  const canReview = missing.length === 0 && pendingActions.length === 0;

  async function runImport() {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    try {
      await onImport(preview.valid.map((item) => item.value));
      toast.success(`已匯入 ${preview.valid.length} 筆交易`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? `匯入失敗：${error.message}` : "匯入失敗");
    } finally {
      setImporting(false);
    }
  }

  const steps: { id: Step; label: string }[] = [
    { id: "upload", label: "上傳" },
    { id: "mapping", label: "欄位對應" },
    { id: "review", label: "預覽匯入" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "32px 16px" }}>
      <div className="ns-surface" style={{ width: "100%", maxWidth: 980, borderRadius: "var(--ns-r-lg)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          <div style={{ fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 600 }}>匯入證券交易</div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X size={16} /></Button>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", gap: 8, padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          {steps.map((s, i) => {
            const activeIdx = steps.findIndex((x) => x.id === step);
            const done = i < activeIdx;
            const active = s.id === step;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: active || done ? 1 : 0.5 }}>
                <div style={{ width: 22, height: 22, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                  border: `1.5px solid ${active ? "var(--ns-accent)" : "var(--ns-border)"}`, background: done ? "var(--ns-accent)" : "transparent", color: done ? "#000" : "var(--ns-fg)" }}>
                  {done ? <CheckCircle size={13} weight="bold" /> : i + 1}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{s.label}</span>
                {i < steps.length - 1 && <span className="muted" style={{ margin: "0 4px" }}>—</span>}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 22 }}>
          {/* ─── Step 1: Upload ─── */}
          {step === "upload" && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 8 }}>1 · 選擇投資帳戶</div>
                {investAccounts.length === 0 ? (
                  <div className="ns-surface p-3 text-sm" style={{ border: "1px solid var(--ns-neg)" }}>
                    尚無投資帳戶。請先到「帳戶」新增一個類型為「投資」的帳戶，匯入的交易會記在該帳戶並以其幣別交割。
                  </div>
                ) : (
                  <select className="ns-input w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">— 請選擇 —</option>
                    {investAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}（{a.currency}）</option>)}
                  </select>
                )}
              </div>

              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 8 }}>2 · 上傳 CSV 檔</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: 22, borderRadius: "var(--ns-r-md)", cursor: "pointer", border: `1.5px dashed ${fileName ? "var(--ns-accent)" : "var(--ns-border)"}`, background: "transparent", color: "var(--ns-fg)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {fileName ? <FileCsv size={26} style={{ color: "var(--ns-accent)" }} /> : <UploadSimple size={26} />}
                  <div style={{ fontWeight: 500 }}>{fileName || "點擊或拖放上傳 CSV"}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{fileName ? `${rows.length} 列 · 分隔符 ${delimiter === "\t" ? "Tab" : delimiter}` : "僅支援 CSV"}</div>
                </button>
              </div>

              {templates.length > 0 && (
                <div>
                  <div className="ns-eyebrow" style={{ marginBottom: 8 }}>3 · 套用範本（選用）</div>
                  <select className="ns-input w-full" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                    <option value="">不套用（自動偵測）</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {headers.length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>預覽（前 5 列）</div>
                  <PreviewTable headers={headers} rows={rows.slice(0, 5)} />
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: Mapping ─── */}
          {step === "mapping" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 10 }}>欄位對應</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {INVESTMENT_FIELDS.map((field) => {
                    const required = REQUIRED_FIELDS.includes(field);
                    const unset = required && !mapping.fields[field];
                    return (
                      <div key={field}>
                        <label style={{ fontSize: 12, display: "block", marginBottom: 4, color: unset ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
                          {FIELD_LABELS[field]}{required && <span style={{ color: "var(--ns-neg)" }}> *</span>}
                        </label>
                        <select className="ns-input w-full" value={mapping.fields[field] ?? ""} onChange={(e) => setField(field, e.target.value)}
                          style={{ borderColor: unset ? "var(--ns-neg)" : undefined }}>
                          <option value="">— 略過 —</option>
                          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  <div>
                    <label style={{ fontSize: 12, display: "block", marginBottom: 4, color: "var(--ns-fg-muted)" }}>日期格式</label>
                    <select className="ns-input w-full" value={mapping.dateFormat} onChange={(e) => setMapping((p) => ({ ...p, dateFormat: e.target.value as DateFormat }))}>
                      {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => <option key={f} value={f}>{DATE_FORMAT_LABELS[f]}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <div className="ns-eyebrow" style={{ marginBottom: 10 }}>交易類別對應</div>
                {!actionHeader ? (
                  <div className="muted text-sm">請先在上方把「交易類別」對應到一個欄位。</div>
                ) : actionValues.length === 0 ? (
                  <div className="muted text-sm">該欄位沒有可對應的值。</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {actionValues.map((value) => {
                      const cur = mapping.activityMap[value];
                      const pending = cur === undefined;
                      return (
                        <div key={value} style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10, alignItems: "center" }}>
                          <span className="mono" style={{ fontSize: 13 }}>{value}</span>
                          <select className="ns-input" value={cur ?? ""} onChange={(e) => setActivity(value, e.target.value as InvestmentAction | "ignore")}
                            style={{ borderColor: pending ? "var(--ns-neg)" : undefined }}>
                            {pending && <option value="">— 請選擇 —</option>}
                            {ACTION_VALUES.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                            <option value="ignore">略過此類</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Template controls */}
              <div style={{ borderTop: "1px solid var(--ns-border)", paddingTop: 16 }}>
                <div className="ns-eyebrow" style={{ marginBottom: 10 }}>範本</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <input className="ns-input" style={{ flex: "1 1 200px" }} placeholder="範本名稱（例：Firstrade）" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                  {templateId
                    ? <Button variant="outline" onClick={() => saveTemplate(false)}><FloppyDisk size={14} />更新範本</Button>
                    : null}
                  <Button variant="outline" onClick={() => saveTemplate(true)}><FloppyDisk size={14} />儲存為新範本</Button>
                  {templateId ? <Button variant="ghost" style={{ color: "var(--ns-neg)" }} onClick={removeTemplate}><Trash size={14} />刪除</Button> : null}
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ─── */}
          {step === "review" && preview && (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <StatPill label="可匯入" value={preview.valid.length} tone="ok" />
                <StatPill label="略過 / 錯誤" value={preview.invalid.length} tone={preview.invalid.length ? "warn" : "muted"} />
                <StatPill label="目標帳戶" value={account ? `${account.name}` : "—"} tone="muted" />
              </div>

              {preview.invalid.length > 0 && (
                <div className="ns-surface" style={{ border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", padding: 12, maxHeight: 180, overflowY: "auto" }}>
                  <div className="text-sm font-medium mb-2" style={{ color: "var(--ns-neg)" }}>未匯入的列</div>
                  {preview.invalid.map((item) => (
                    <div key={item.row} className="text-xs" style={{ marginBottom: 3 }}>第 {item.row} 列：{item.reason}</div>
                  ))}
                </div>
              )}

              {preview.valid.length > 0 && (
                <div>
                  <div className="muted text-sm mb-2">前 {Math.min(8, preview.valid.length)} 筆預覽</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--ns-fg-dim)" }}>
                          {["日期", "類別", "代號", "數量", "價格", "手續費"].map((h) => <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.valid.slice(0, 8).map((item) => (
                          <tr key={item.row}>
                            <td style={{ padding: "6px 10px" }} className="mono">{item.value.date}</td>
                            <td style={{ padding: "6px 10px" }}>{ACTION_LABELS[item.value.action]}</td>
                            <td style={{ padding: "6px 10px" }} className="mono">{item.value.ticker}</td>
                            <td style={{ padding: "6px 10px" }} className="num">{item.value.quantity}</td>
                            <td style={{ padding: "6px 10px" }} className="num">{item.value.price}</td>
                            <td style={{ padding: "6px 10px" }} className="num">{item.value.fee}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="muted" style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <Warning size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>買入交易需要該投資帳戶有足夠現金交割；若帳戶餘額不足，匯入時該筆會被拒絕並顯示原因。</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 22px", borderTop: "1px solid var(--ns-border)" }}>
          <Button variant="ghost" onClick={() => {
            if (step === "mapping") setStep("upload");
            else if (step === "review") setStep("mapping");
            else onClose();
          }}>
            <ArrowLeft size={14} />{step === "upload" ? "取消" : "上一步"}
          </Button>
          {step === "upload" && (
            <Button disabled={!canMap} onClick={() => setStep("mapping")}>欄位對應<ArrowRight size={14} /></Button>
          )}
          {step === "mapping" && (
            <Button disabled={!canReview} onClick={() => setStep("review")}>預覽匯入<ArrowRight size={14} /></Button>
          )}
          {step === "review" && (
            <Button disabled={importing || !preview || preview.valid.length === 0} onClick={runImport}>
              <CheckCircle size={14} weight="bold" />{importing ? "匯入中…" : `確認匯入 ${preview?.valid.length ?? 0} 筆`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: Record<string, string>[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ns-fg-dim)" }}>
            {headers.map((h) => <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {headers.map((h) => <td key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)" }}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string | number; tone: "ok" | "warn" | "muted" }) {
  const color = tone === "ok" ? "var(--ns-accent)" : tone === "warn" ? "var(--ns-neg)" : "var(--ns-fg-muted)";
  return (
    <div style={{ padding: "10px 14px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", minWidth: 110 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
