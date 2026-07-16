import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, FileCsv, UploadSimple } from "@phosphor-icons/react";
import { Button } from "../components/coss/button";
import { AppSelect } from "../components/AppSelect";
import { ModalShell } from "../components/ModalShell";
import { ModalCloseButton } from "../components/ModalCloseButton";
import { useToast } from "../components/Toast";
import { detectDelimiter, parseCsvTable } from "../data/csv";
import type { ManualPriceSnapshotDraft } from "../data/repositories";
import {
  DATE_FORMAT_LABELS, MANUAL_PRICE_FIELDS, MANUAL_PRICE_FIELD_LABELS, MANUAL_PRICE_REQUIRED_FIELDS,
  applyManualPriceMapping, autoDetectManualPriceFields, emptyManualPriceMapping, missingManualPriceFields,
  type DateFormat, type ManualPriceField, type ManualPriceImportMapping,
} from "../data/manualPriceImport";

type Step = "upload" | "mapping" | "review";

interface Props {
  open: boolean;
  onClose: () => void;
  assetId: string;
  assetLabel: string;
  currency: string;
  /** Persist the parsed drafts. The wizard reports success/failure via toast. */
  onImport: (drafts: ManualPriceSnapshotDraft[]) => Promise<void>;
}

export function ManualPriceImportWizard({ open, onClose, assetId, assetLabel, currency, onImport }: Props) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [delimiter, setDelimiter] = useState(",");
  const [mapping, setMapping] = useState<ManualPriceImportMapping>(emptyManualPriceMapping());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("upload");
    setFileName(""); setHeaders([]); setRows([]); setMapping(emptyManualPriceMapping());
    setImportError("");
  }, [open]);

  const preview = useMemo(() => {
    if (step !== "review") return null;
    return applyManualPriceMapping(rows, mapping, assetId);
  }, [step, rows, mapping, assetId]);

  if (!open) return null;

  async function handleFile(file: File) {
    const text = await file.text();
    const delim = detectDelimiter(text);
    const table = parseCsvTable(text, delim);
    if (table.headers.length === 0) { toast.error("無法解析此 CSV（找不到標題列）"); return; }
    setFileName(file.name);
    setDelimiter(delim);
    setHeaders(table.headers);
    setRows(table.rows);
    setMapping({ fields: autoDetectManualPriceFields(table.headers), dateFormat: "auto" });
  }

  function setField(field: ManualPriceField, header: string) {
    setMapping((prev) => {
      const fields = { ...prev.fields };
      if (header) fields[field] = header; else delete fields[field];
      return { ...prev, fields };
    });
  }

  const missing = missingManualPriceFields(mapping);
  const canMap = headers.length > 0;
  const canReview = missing.length === 0;

  async function runImport() {
    if (!preview || preview.valid.length === 0) return;
    setImporting(true);
    setImportError("");
    try {
      await onImport(preview.valid.map((item) => item.value));
      toast.success(`已匯入 ${preview.valid.length} 筆價格`);
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
      title="匯入手動價格"
      onClose={onClose}
      disableScrimClose
      disableEscape
      style={{ zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "32px 16px" }}
      panelClassName="ns-surface"
      panelStyle={{ width: "100%", maxWidth: 760, borderRadius: "var(--ns-r-lg)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)" }}
    >
      {(dismiss) => (<>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: "16px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          <div>
            <div className="text-lg font-semibold" style={{ fontFamily: "var(--ns-font-display)" }}>匯入手動價格</div>
            <div className="muted text-xs" style={{ marginTop: 2 }}>{assetLabel}</div>
          </div>
          <ModalCloseButton onClick={dismiss} />
        </div>

        {/* Stepper */}
        <div className="flex" style={{ gap: 8, padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          {steps.map((s, i) => {
            const activeIdx = steps.findIndex((x) => x.id === step);
            const done = i < activeIdx;
            const active = s.id === step;
            return (
              <div key={s.id} className="flex items-center" style={{ gap: 8, opacity: active || done ? 1 : 0.5 }}>
                <div className="text-caption" style={{ width: 22, height: 22, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px solid ${active ? "var(--ns-accent)" : "var(--ns-border)"}`, background: done ? "var(--ns-accent)" : "transparent", color: done ? "var(--ns-accent-fg)" : "var(--ns-fg)" }}>
                  {done ? <CheckCircle size={13} weight="bold" /> : i + 1}
                </div>
                <span className="text-body" style={{ fontWeight: active ? 600 : 400 }}>{s.label}</span>
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
                <div className="text-xs muted font-medium mb-2">上傳 CSV 檔</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: 22, borderRadius: "var(--ns-r-md)", cursor: "pointer", border: `1.5px dashed ${fileName ? "var(--ns-accent)" : "var(--ns-border)"}`, background: "transparent", color: "var(--ns-fg)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {fileName ? <FileCsv size={26} style={{ color: "var(--ns-accent)" }} /> : <UploadSimple size={26} />}
                  <div className="font-medium">{fileName || "點擊上傳 CSV"}</div>
                  <div className="muted text-xs">{fileName ? `${rows.length} 列 · 分隔符 ${delimiter === "\t" ? "Tab" : delimiter}` : "每列一筆 (日期、價格、選填備註)"}</div>
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 2: Mapping ─── */}
          {step === "mapping" && (
            <div style={{ display: "grid", gap: 20 }}>
              <div>
                <div className="text-xs muted font-medium mb-2.5">欄位對應</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {MANUAL_PRICE_FIELDS.map((field) => {
                    const required = MANUAL_PRICE_REQUIRED_FIELDS.includes(field);
                    const unset = required && !mapping.fields[field];
                    return (
                      <div key={field}>
                        <label className="text-xs block mb-1" style={{ color: unset ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
                          {MANUAL_PRICE_FIELD_LABELS[field]}{required && <span className="neg"> *</span>}
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
                    <label className="text-xs muted block mb-1">日期格式</label>
                    <AppSelect
                      value={mapping.dateFormat}
                      onChange={(dateFormat) => setMapping((p) => ({ ...p, dateFormat: dateFormat as DateFormat }))}
                      options={(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => ({ value: f, label: DATE_FORMAT_LABELS[f] }))}
                      positionerClassName="z-[260]"
                      className="w-full"
                      style={{ height: 40 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ─── */}
          {step === "review" && preview && (
            <div style={{ display: "grid", gap: 16 }}>
              <div className="flex" style={{ gap: 12, flexWrap: "wrap" }}>
                <StatPill label="可匯入" value={preview.valid.length} tone="ok" />
                <StatPill label="略過 / 錯誤" value={preview.invalid.length} tone={preview.invalid.length ? "warn" : "muted"} />
              </div>

              {preview.invalid.length > 0 && (
                <div className="ns-surface" style={{ border: "1px solid var(--ns-border)", borderRadius: "var(--ns-r-md)", padding: 12, maxHeight: 180, overflowY: "auto" }}>
                  <div className="text-sm font-medium mb-2 neg">未匯入的列</div>
                  {preview.invalid.map((item) => (
                    <div key={item.row} className="text-xs" style={{ marginBottom: 3 }}>第 {item.row} 列：{item.reason}</div>
                  ))}
                </div>
              )}

              {importError ? (
                <div className="ns-surface" style={{ border: "1px solid var(--ns-neg)", borderRadius: "var(--ns-r-md)", padding: 12 }}>
                  <div className="text-sm font-medium mb-1 neg">匯入失敗</div>
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
                          {["列", "日期", "價格", "備註"].map((h) => <th key={h} style={{ padding: "6px 10px", borderBottom: "1px solid var(--ns-border)" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.valid.slice(0, 8).map((item) => (
                          <tr key={item.row}>
                            <td style={{ padding: "6px 10px" }} className="mono">{item.row}</td>
                            <td style={{ padding: "6px 10px" }} className="mono">{item.value.date}</td>
                            <td style={{ padding: "6px 10px" }} className="num">{item.value.price} {currency}</td>
                            <td style={{ padding: "6px 10px" }} className="muted">{item.value.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
      </>)}
    </ModalShell>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string | number; tone: "ok" | "warn" | "muted" }) {
  const color = tone === "ok" ? "var(--ns-accent)" : tone === "warn" ? "var(--ns-neg)" : "var(--ns-fg-muted)";
  return (
    <div style={{ padding: "10px 14px", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", minWidth: 110 }}>
      <div className="text-xs muted font-medium" style={{ marginBottom: 2 }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}
