import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, FileCsv, UploadSimple, Warning, X, Trash, FloppyDisk } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { AccountFilter } from "../components/AccountFilter";
import { AppSelect } from "../components/AppSelect";
import { ModalShell } from "../components/ModalShell";
import { useToast } from "../components/Toast";
import { detectDelimiter, parseCsvTable } from "../data/csv";
import type { InvestmentDraft, LedgerDraft } from "../data/repositories";
import type { Account } from "../domain";
import {
  DATE_FORMAT_LABELS, FIELD_LABELS, IMPORT_ACTION_LABELS, IMPORT_ACTION_VALUES, INVESTMENT_FIELDS, REQUIRED_FIELDS,
  applyInvestmentMapping, autoDetectActivityMap, autoDetectFields, distinctValues, emptyMapping,
  missingRequiredFields, unmappedActions,
  type DateFormat, type ImportActivity, type InvestmentField, type InvestmentImportMapping, type InvestmentImportValue,
} from "../data/investmentImport";
import {
  deleteImportTemplate, loadImportTemplates, newTemplateId, upsertImportTemplate, type ImportTemplate,
} from "../state/importTemplates";

type Step = "upload" | "mapping" | "review";

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onImport: (plan: InvestmentActivityImportPlan) => Promise<void>;
}

export interface InvestmentActivityImportPlan {
  investments: Array<InvestmentDraft & { importRow?: number; importLabel?: string }>;
  cash: Array<LedgerDraft & { importRow?: number; importLabel?: string }>;
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
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTemplates(loadImportTemplates());
    setStep("upload");
    setAccountId(investAccounts.length === 1 ? investAccounts[0].id : "");
    setFileName(""); setHeaders([]); setRows([]); setMapping(emptyMapping());
    setTemplateId(""); setTemplateName("");
    setImportError("");
  }, [open, investAccounts]);

  const account = investAccounts.find((a) => a.id === accountId);
  const hasRowAccount = headers.some((header) => ["accountName", "accountId"].includes(header));
  const preview = useMemo(() => {
    if (step !== "review") return null;
    if (!account && !hasRowAccount) return null;
    return applyInvestmentMapping(rows, mapping, {
      linkedAccountId: account?.id ?? "",
      accountCurrency: account?.currency ?? "",
      accounts: investAccounts,
    });
  }, [step, account, hasRowAccount, rows, mapping, investAccounts]);

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

  function setActivity(value: string, action: ImportActivity | "ignore") {
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
  const canMap = headers.length > 0 && (!!accountId || hasRowAccount);
  const canReview = missing.length === 0 && pendingActions.length === 0;

  async function runImport() {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    setImportError("");
    try {
      const plan = buildImportPlan(preview.valid);
      await onImport(plan);
      const cashCount = plan.cash.length;
      const investmentCount = plan.investments.length;
      toast.success(`已匯入 ${investmentCount} 筆交易${cashCount ? `、${cashCount} 筆入出金` : ""}`);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "匯入失敗";
      setImportError(message);
      toast.error(`匯入失敗：${message}`);
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
    <ModalShell
      variant="sheet"
      title="匯入證券交易"
      onClose={onClose}
      disableScrimClose
      disableEscape
      className="flex justify-center"
      style={{ zIndex: 200, alignItems: "flex-start", overflowY: "auto", padding: "32px 16px" }}
      panelClassName="ns-surface"
      panelStyle={{ width: "100%", maxWidth: 980, borderRadius: "var(--ns-r-lg)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)" }}
    >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "16px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          <div className="text-lg font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>匯入證券交易</div>
          <Button variant="ghost" size="icon-sm" aria-label="關閉" onClick={onClose}><X size={16} /></Button>
        </div>

        {/* Stepper */}
        <div className="flex gap-2" style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          {steps.map((s, i) => {
            const activeIdx = steps.findIndex((x) => x.id === step);
            const done = i < activeIdx;
            const active = s.id === step;
            return (
              <div key={s.id} className="flex items-center gap-2" style={{ opacity: active || done ? 1 : 0.5 }}>
                <div className="text-caption flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 99,
                  border: `1.5px solid ${active ? "var(--ns-accent)" : "var(--ns-border)"}`, background: done ? "var(--ns-accent)" : "transparent", color: done ? "var(--ns-accent-fg)" : "var(--ns-fg)" }}>
                  {done ? <CheckCircle size={13} weight="bold" /> : i + 1}
                </div>
                <span className="text-body" style={{ fontWeight: active ? 600 : 400 }}>{s.label}</span>
                {i < steps.length - 1 && <span className="muted mx-1">—</span>}
              </div>
            );
          })}
        </div>

        <div style={{ padding: 22 }}>
          {/* ─── Step 1: Upload ─── */}
          {step === "upload" && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div className="ns-eyebrow mb-2">1 · 選擇投資帳戶</div>
                {investAccounts.length === 0 ? (
                  <div className="ns-surface p-3 text-sm" style={{ border: "1px solid var(--ns-neg)" }}>
                    尚無投資帳戶。請先到「帳戶」新增一個類型為「投資」的帳戶，匯入的交易會記在該帳戶並以其幣別交割。
                  </div>
                ) : (
                  <AccountFilter
                    accounts={investAccounts}
                    value={accountId}
                    onChange={setAccountId}
                    allowAll={false}
                    allLabel="請選擇"
                    placeholder="選擇投資帳戶"
                    positionerClassName="z-[260]"
                    style={{ width: "100%", maxWidth: "none", minWidth: 0, height: 40 }}
                  />
                )}
                {hasRowAccount ? (
                  <div className="muted text-xs mt-1.5">
                    這份 CSV 含有帳戶欄位，預覽時會優先用每列的 accountName / accountId；上方帳戶只作為找不到對應時的預設值。
                  </div>
                ) : null}
              </div>

              <div>
                <div className="ns-eyebrow mb-2">2 · 上傳 CSV 檔</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-1.5" style={{ width: "100%", padding: 22, borderRadius: "var(--ns-r-md)", cursor: "pointer", border: `1.5px dashed ${fileName ? "var(--ns-accent)" : "var(--ns-border)"}`, background: "transparent", color: "var(--ns-fg)" }}>
                  {fileName ? <FileCsv size={26} style={{ color: "var(--ns-accent)" }} /> : <UploadSimple size={26} />}
                  <div className="font-medium">{fileName || "點擊或拖放上傳 CSV"}</div>
                  <div className="muted text-xs">{fileName ? `${rows.length} 列 · 分隔符 ${delimiter === "\t" ? "Tab" : delimiter}` : "僅支援 CSV"}</div>
                </button>
              </div>

              {templates.length > 0 && (
                <div>
                  <div className="ns-eyebrow mb-2">3 · 套用範本（選用）</div>
                  <AppSelect
                    value={templateId}
                    onChange={applyTemplate}
                    options={[{ value: "", label: "不套用（自動偵測）" }, ...templates.map((template) => ({ value: template.id, label: template.name }))]}
                    positionerClassName="z-[260]"
                    style={{ width: "100%", height: 40 }}
                  />
                </div>
              )}

              {headers.length > 0 && (
                <div>
                  <div className="muted text-xs mb-1.5">預覽（前 5 列）</div>
                  <PreviewTable headers={previewHeaders(headers, mapping)} totalColumns={headers.length} rows={rows.slice(0, 5)} />
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: Mapping ─── */}
          {step === "mapping" && (
            <div className="grid gap-5">
              <div>
                <div className="text-xs mb-2.5 font-medium" style={{ color: "var(--ns-fg-muted)" }}>欄位對應</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {INVESTMENT_FIELDS.map((field) => {
                    const required = REQUIRED_FIELDS.includes(field);
                    const unset = required && !mapping.fields[field];
                    return (
                      <div key={field}>
                        <label className="text-xs block mb-1" style={{ color: unset ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
                          {FIELD_LABELS[field]}{required && <span style={{ color: "var(--ns-neg)" }}> *</span>}
                        </label>
                        <AppSelect
                          value={mapping.fields[field] ?? ""}
                          onChange={(header) => setField(field, header)}
                          options={[{ value: "", label: "略過" }, ...headers.map((header) => ({ value: header, label: header }))]}
                          searchPlaceholder="搜尋欄位…"
                          positionerClassName="z-[260]"
                          style={{ width: "100%", height: 40, borderColor: unset ? "var(--ns-neg)" : undefined }}
                        />
                      </div>
                    );
                  })}
                  <div>
                    <label className="text-xs block mb-1" style={{ color: "var(--ns-fg-muted)" }}>日期格式</label>
                    <AppSelect
                      value={mapping.dateFormat}
                      onChange={(dateFormat) => setMapping((p) => ({ ...p, dateFormat: dateFormat as DateFormat }))}
                      options={(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => ({ value: f, label: DATE_FORMAT_LABELS[f] }))}
                      positionerClassName="z-[260]"
                      style={{ width: "100%", height: 40 }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs mb-2.5 font-medium" style={{ color: "var(--ns-fg-muted)" }}>交易類別對應</div>
                {!actionHeader ? (
                  <div className="muted text-sm">請先在上方把「交易類別」對應到一個欄位。</div>
                ) : actionValues.length === 0 ? (
                  <div className="muted text-sm">該欄位沒有可對應的值。</div>
                ) : (
                  <div className="grid gap-2">
                    {actionValues.map((value) => {
                      const cur = mapping.activityMap[value];
                      const pending = cur === undefined;
                      return (
                        <div key={value} className="items-center" style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
                          <span className="mono text-body">{value}</span>
                          <AppSelect
                            value={cur ?? ""}
                            onChange={(action) => setActivity(value, action as ImportActivity | "ignore")}
                            options={[
                              ...(pending ? [{ value: "", label: "請選擇" }] : []),
                              ...IMPORT_ACTION_VALUES.map((action) => ({ value: action, label: IMPORT_ACTION_LABELS[action] })),
                              { value: "ignore", label: "略過此類" },
                            ]}
                            positionerClassName="z-[260]"
                            style={{ width: "100%", height: 40, borderColor: pending ? "var(--ns-neg)" : undefined }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Template controls */}
              <div className="pt-4" style={{ borderTop: "1px solid var(--ns-border)" }}>
                <div className="text-xs mb-2.5 font-medium" style={{ color: "var(--ns-fg-muted)" }}>範本</div>
                <div className="flex flex-wrap items-center gap-2">
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
            <div className="grid gap-4">
              <div className="flex gap-3 flex-wrap">
                <StatPill label="可匯入" value={preview.valid.length} tone="ok" />
                <StatPill label="略過 / 錯誤" value={preview.invalid.length} tone={preview.invalid.length ? "warn" : "muted"} />
                <StatPill label="目標帳戶" value={hasRowAccount ? "依 CSV 每列" : account ? `${account.name}` : "—"} tone="muted" />
              </div>

              {preview.invalid.length > 0 && (
                <div className="ns-surface p-3" style={{ border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", maxHeight: 180, overflowY: "auto" }}>
                  <div className="text-sm font-medium mb-2" style={{ color: "var(--ns-neg)" }}>未匯入的列</div>
                  {preview.invalid.map((item) => (
                    <div key={item.row} className="text-xs" style={{ marginBottom: 3 }}>第 {item.row} 列：{item.reason}</div>
                  ))}
                </div>
              )}

              {importError ? (
                <div className="ns-surface p-3" style={{ border: "1px solid var(--ns-neg)", borderRadius: "var(--ns-r-md)" }}>
                  <div className="text-sm font-medium mb-1" style={{ color: "var(--ns-neg)" }}>匯入失敗</div>
                  <div className="text-xs" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{importError}</div>
                </div>
              ) : null}

              {preview.valid.length > 0 && (
                <div>
                  <div className="muted text-sm mb-2">前 {Math.min(8, preview.valid.length)} 筆預覽</div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="text-xs" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--ns-fg-dim)" }}>
                          {["列", "日期", "類別", "內容", "數量", "價格 / 金額", "手續費"].map((h) => <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.valid.slice(0, 8).map((item) => <ImportPreviewRow key={item.row} item={item} />)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="muted text-caption flex items-start gap-1.5">
                <Warning size={14} className="shrink-0" style={{ marginTop: 1 }} />
                <span>買入交易需要該投資帳戶有足夠現金交割；若帳戶餘額不足，匯入時該筆會被拒絕並顯示原因。</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between" style={{ padding: "16px 22px", borderTop: "1px solid var(--ns-border)" }}>
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
    </ModalShell>
  );
}

function buildImportPlan(items: Array<{ row: number; value: InvestmentImportValue }>): InvestmentActivityImportPlan {
  const plan: InvestmentActivityImportPlan = { investments: [], cash: [] };
  for (const item of items) {
    if (item.value.kind === "investment") {
      plan.investments.push({ ...item.value.draft, importRow: item.row, importLabel: item.value.label });
    } else {
      plan.cash.push({ ...item.value.draft, importRow: item.row, importLabel: item.value.label });
    }
  }
  return plan;
}

function previewHeaders(headers: string[], mapping: InvestmentImportMapping) {
  const preferred = [
    mapping.fields.date,
    mapping.fields.action,
    "accountName",
    "accountId",
    mapping.fields.ticker,
    mapping.fields.name,
    mapping.fields.quantity,
    mapping.fields.price,
    "amount",
    mapping.fields.currency,
    mapping.fields.fee,
    mapping.fields.note,
  ];
  const visible = new Set<string>();
  for (const header of preferred) {
    if (header && headers.includes(header)) visible.add(header);
    if (visible.size >= 10) break;
  }
  for (const header of headers) {
    if (visible.size >= 8) break;
    visible.add(header);
  }
  return [...visible];
}

function PreviewTable({ headers, totalColumns, rows }: { headers: string[]; totalColumns: number; rows: Record<string, string>[] }) {
  return (
    <div>
      {totalColumns > headers.length ? (
        <div className="muted text-caption mb-1.5">只顯示 {headers.length} 個關鍵欄位，另有 {totalColumns - headers.length} 欄會在匯入時保留解析。</div>
      ) : null}
      <div style={{ overflowX: "auto", border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", maxWidth: "100%" }}>
      <table className="text-xs" style={{ width: "100%", minWidth: Math.min(760, headers.length * 120), borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ns-fg-dim)" }}>
            {headers.map((h) => <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {headers.map((h) => <td key={h} title={row[h]} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ImportPreviewRow({ item }: { item: { row: number; value: InvestmentImportValue } }) {
  const value = item.value;
  if (value.kind === "cash") {
    const sign = value.draft.amount >= 0 ? "+" : "−";
    return (
      <tr>
        <td style={{ padding: "6px 10px" }} className="mono">{item.row}</td>
        <td style={{ padding: "6px 10px" }} className="mono">{value.draft.date}</td>
        <td style={{ padding: "6px 10px" }}>{value.draft.subcategory}</td>
        <td style={{ padding: "6px 10px" }}>{value.draft.name}</td>
        <td style={{ padding: "6px 10px" }} className="muted">—</td>
        <td style={{ padding: "6px 10px" }} className="num">{sign}{value.draft.currency} {Math.abs(value.draft.amount)}</td>
        <td style={{ padding: "6px 10px" }} className="muted">—</td>
      </tr>
    );
  }
  return (
    <tr>
      <td style={{ padding: "6px 10px" }} className="mono">{item.row}</td>
      <td style={{ padding: "6px 10px" }} className="mono">{value.draft.date}</td>
      <td style={{ padding: "6px 10px" }}>{IMPORT_ACTION_LABELS[value.draft.action]}</td>
      <td style={{ padding: "6px 10px" }} className="mono">{value.draft.ticker}</td>
      <td style={{ padding: "6px 10px" }} className="num">{value.draft.quantity}</td>
      <td style={{ padding: "6px 10px" }} className="num">{value.draft.price}</td>
      <td style={{ padding: "6px 10px" }} className="num">{value.draft.fee}</td>
    </tr>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string | number; tone: "ok" | "warn" | "muted" }) {
  const color = tone === "ok" ? "var(--ns-accent)" : tone === "warn" ? "var(--ns-neg)" : "var(--ns-fg-muted)";
  return (
    <div style={{ padding: "10px 14px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", minWidth: 110 }}>
      <div className="text-xs ns-field-label" style={{ marginBottom: 2 }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}
