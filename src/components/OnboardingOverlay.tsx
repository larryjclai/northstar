import {
  ArrowRight,
  Bank,
  CheckCircle,
  Database,
  FileArrowUp,
  LockKey,
  Receipt,
  TrendUp,
  X,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "./coss/button";
import { Card } from "./coss/card";
import { useToast } from "./Toast";
import { parseLedgerCsv, type ImportPreview } from "../data/csv";
import { enterDemoMode } from "../data/demoData";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository, type LedgerDraft } from "../data/repositories";
import { useDemoMode } from "../state/demoMode";

const STORAGE_KEY = "northstar.onboarding.dismissed.v1";
export const OPEN_ONBOARDING_EVENT = "northstar:open-onboarding";

export function openOnboarding() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT));
}

export function OnboardingOverlay() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { accounts, ledger, assets } = useFinanceData();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [preview, setPreview] = useState<ImportPreview<LedgerDraft> | null>(null);
  const [fileName, setFileName] = useState("");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accountRows = accounts.data ?? [];
  const hasAnyData = accountRows.length > 0 || (ledger.data?.length ?? 0) > 0 || (assets.data?.length ?? 0) > 0;
  const ready = accounts.isSuccess && ledger.isSuccess && assets.isSuccess;
  const accountFor = useMemo(
    () => (nameOrId: string) => {
      const key = nameOrId.trim().toLocaleLowerCase();
      return accountRows.find((account) => account.id === nameOrId || account.name.toLocaleLowerCase() === key);
    },
    [accountRows],
  );

  const importLedger = useRepositoryMutation(
    (repository, input: LedgerDraft[]) => repository.importLedgerTransactions(input),
    ["accounts", "ledger"],
  );

  useEffect(() => {
    if (ready && !hasAnyData && !dismissed) setOpen(true);
  }, [dismissed, hasAnyData, ready]);

  useEffect(() => {
    const handler = () => {
      setDismissed(false);
      setStep(hasAnyData ? 1 : 0);
      setOpen(true);
    };
    window.addEventListener(OPEN_ONBOARDING_EVENT, handler);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, handler);
  }, [hasAnyData]);

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
    setOpen(false);
  }

  function go(to: "/" | "/accounts" | "/cash-flow" | "/investments" | "/settings") {
    dismiss();
    void navigate({ to });
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(parseLedgerCsv(await file.text(), accountFor));
    event.target.value = "";
  }

  async function confirmImport() {
    if (!preview?.valid.length) return;
    const rows = preview.valid.map((item) => item.value);
    await importLedger.mutateAsync(rows);
    toast.success(`成功匯入 ${rows.length} 筆流水帳`);
    setPreview(null);
    setStep(3);
  }

  async function loadDemo() {
    setLoadingDemo(true);
    try {
      await enterDemoMode(await getFinanceRepository());
      useDemoMode.getState().set(true);
      await queryClient.invalidateQueries();
      toast.success("已載入示範資料");
      setStep(3);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "載入示範資料失敗");
    } finally {
      setLoadingDemo(false);
    }
  }

  if (!open) return null;

  const steps = ["開始", "帳戶", "匯入", "完成"];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Northstar onboarding">
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ns-bg) 68%, transparent)", backdropFilter: "blur(10px)" }} onClick={dismiss} />
      <Card
        className="relative grid w-full grid-cols-1 overflow-hidden sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
        style={{
          maxWidth: 980,
          maxHeight: "min(760px, calc(100vh - 24px))",
          padding: 0,
          boxShadow: "var(--ns-shadow-2)",
        }}
      >
        <section className="hidden sm:flex" style={{ padding: 28, borderRight: "1px solid var(--ns-border)", flexDirection: "column", gap: 22, background: "var(--ns-bg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent)", color: "var(--ns-accent-fg)", display: "grid", placeItems: "center" }}>
              <Database size={18} weight="bold" />
            </div>
            <div>
              <div style={{ fontFamily: "var(--ns-font-brand)", fontWeight: 650 }}>Northstar</div>
              <div className="muted text-caption">Local-first finance cockpit</div>
            </div>
          </div>

          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Step {step + 1} of 4</div>
            <h2 className="text-[30px]" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 650, letterSpacing: 0 }}>
              {step === 0 ? "準備好你的財務駕駛艙" : step === 1 ? "加入你的帳戶" : step === 2 ? "匯入流水帳" : "可以開始了"}
            </h2>
            <p className="muted text-body" style={{ margin: "12px 0 0", lineHeight: 1.65 }}>
              Northstar 不會自動連線到你的銀行。你可以選擇匯入 CSV、手動建立、或先用示範資料逛逛。所有資料只存在你的本機。
            </p>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {steps.map((label, index) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, color: index <= step ? "var(--ns-fg)" : "var(--ns-fg-dim)" }}>
                <div style={{ width: 24, height: 24, borderRadius: 99, display: "grid", placeItems: "center", background: index <= step ? "var(--ns-accent)" : "var(--ns-bg-hover)", color: index <= step ? "var(--ns-accent-fg)" : "var(--ns-fg-dim)", fontFamily: "var(--ns-font-mono)", fontSize: 12, fontWeight: 700 }}>
                  {index < step ? <CheckCircle size={15} weight="fill" /> : index + 1}
                </div>
                <span className="text-sm" style={{ fontWeight: index === step ? 600 : 450 }}>{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto rounded-lg border p-3 text-xs" style={{ borderColor: "var(--ns-border)", color: "var(--ns-fg-muted)", lineHeight: 1.55 }}>
            <LockKey size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
            你的資料預設保存在這台裝置；同步與 Logo CDN 都是使用者手動開啟。
          </div>
        </section>

        <section style={{ padding: 24, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div className="ns-eyebrow sm:hidden">Step {step + 1} of 4</div>
            <button type="button" aria-label="關閉導覽" onClick={dismiss} style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "var(--ns-r-sm)", border: "1px solid var(--ns-border)", background: "var(--ns-bg-card)", color: "var(--ns-fg-muted)", display: "grid", placeItems: "center" }}>
              <X size={16} />
            </button>
          </div>

          {step === 0 ? (
            <StepStack
              title="你想從哪裡開始？"
              description="先建立帳戶會讓淨值與現金流有基礎；如果你已經有 CSV，可以直接進匯入預覽。"
            >
              <ChoiceCard icon={<Bank size={21} weight="duotone" />} title="手動建立第一個帳戶" description="銀行、現金、信用卡、券商帳戶都支援。" onClick={() => go("/accounts")} />
              <ChoiceCard icon={<Receipt size={21} weight="duotone" />} title="匯入一般流水帳 CSV" description="使用 date、account、amount、currency 等欄位批次匯入。" onClick={() => setStep(2)} />
              <ChoiceCard icon={<TrendUp size={21} weight="duotone" />} title="匯入投資交易 CSV" description="投資頁已支援欄位對應與預覽。" onClick={() => go("/investments")} />
              <ChoiceCard icon={<Database size={21} weight="duotone" />} title="先用示範資料逛逛" description="不覆蓋你的正式資料，隨時可以結束示範模式。" onClick={loadDemo} loading={loadingDemo} />
            </StepStack>
          ) : null}

          {step === 1 ? (
            <StepStack
              title="加入你的帳戶"
              description="帳戶名稱不需要跟銀行名稱完全一致；logo 可自動判讀，也能在帳戶編輯裡手選銀行或券商。"
            >
              <div className="rounded-lg border p-4" style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg-card)" }}>
                <div className="muted text-caption" style={{ marginBottom: 10 }}>fubon-2026-05.csv · 預覽 3/142 列</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                  {["Date", "Account", "Name", "Amount", "Category"].map((label) => (
                    <div key={label} className="mono text-caption rounded-md px-2 py-2" style={{ background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)" }}>{label}</div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--ns-pos)" }}>
                  <CheckCircle size={15} weight="fill" /> 欄位已對應，可在匯入前檢查 invalid rows
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="justify-center" onClick={() => go("/accounts")}><Bank size={16} />建立帳戶</Button>
                <Button variant="outline" className="justify-center" onClick={() => setStep(2)}><FileArrowUp size={16} />匯入流水帳</Button>
              </div>
            </StepStack>
          ) : null}

          {step === 2 ? (
            <StepStack
              title="匯入一般流水帳 CSV"
              description="支援一般記帳大量匯入。CSV 需要包含 date、account、amount、currency；account 會對應既有帳戶名稱或 id。"
            >
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsv} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border p-6 text-left"
                style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg-card)", cursor: "pointer" }}
              >
                <div style={{ width: 44, height: 44, borderRadius: "var(--ns-r-md)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "grid", placeItems: "center", marginBottom: 14 }}>
                  <FileArrowUp size={23} weight="duotone" />
                </div>
                <div style={{ fontWeight: 650 }}>選擇 CSV 檔案</div>
                <div className="muted text-sm" style={{ marginTop: 4 }}>
                  {accountRows.length ? "會先產生預覽，不會直接寫入。" : "請先建立帳戶；否則 account 欄位無法對應。"}
                </div>
              </button>

              {preview ? (
                <div className="rounded-lg border p-4" style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 650 }}>{fileName || "CSV 預覽"}</div>
                      <div className="muted text-caption">{preview.valid.length} valid / {preview.invalid.length} invalid</div>
                    </div>
                    <Button size="sm" disabled={!preview.valid.length} loading={importLedger.isPending} onClick={confirmImport}>
                      匯入 {preview.valid.length} 筆 <ArrowRight size={14} />
                    </Button>
                  </div>
                  {preview.invalid.length ? (
                    <div style={{ display: "grid", gap: 6, maxHeight: 140, overflow: "auto" }}>
                      {preview.invalid.slice(0, 6).map((item) => (
                        <div key={item.row} className="text-xs" style={{ color: "var(--ns-neg)" }}>Row {item.row}: {item.reason}</div>
                      ))}
                      {preview.invalid.length > 6 ? <div className="muted text-xs">還有 {preview.invalid.length - 6} 筆 invalid rows</div> : null}
                    </div>
                  ) : (
                    <div className="text-xs" style={{ color: "var(--ns-pos)" }}>所有列都可匯入。</div>
                  )}
                </div>
              ) : null}
            </StepStack>
          ) : null}

          {step === 3 ? (
            <StepStack
              title="你的工作區準備好了"
              description="接下來可以開始記帳、檢查投資交易，或到設定開啟銀行 Logo 與同步。"
            >
              <div className="grid gap-2">
                <ChoiceCard icon={<Receipt size={21} weight="duotone" />} title="去記一筆流水帳" description="快速建立收入、支出、轉帳或應收應付。" onClick={() => go("/cash-flow")} />
                <ChoiceCard icon={<TrendUp size={21} weight="duotone" />} title="整理投資交易" description="新增持倉、匯入券商 CSV、設定定期定額。" onClick={() => go("/investments")} />
                <ChoiceCard icon={<LockKey size={21} weight="duotone" />} title="檢查資料與隱私設定" description="開啟 Logo、同步、備份與匯率設定。" onClick={() => go("/settings")} />
              </div>
            </StepStack>
          ) : null}

          <footer className="mt-6 flex items-center gap-2">
            <Button variant="ghost" onClick={dismiss}>略過</Button>
            <div style={{ flex: 1 }} />
            {step > 0 && step < 3 ? <Button variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))}>← 上一步</Button> : null}
            {step < 2 ? <Button onClick={() => setStep((value) => value + 1)}>下一步 →</Button> : null}
            {step === 2 ? <Button variant="outline" onClick={() => setStep(3)}>稍後匯入</Button> : null}
            {step === 3 ? <Button onClick={() => go("/")}>完成</Button> : null}
          </footer>
        </section>
      </Card>
    </div>
  );
}

function StepStack({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[24px]" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 650, letterSpacing: 0 }}>
        {title}
      </h3>
      <p className="muted text-body" style={{ margin: "8px 0 18px", lineHeight: 1.6 }}>
        {description}
      </p>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
  loading = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-lg border p-4 text-left transition-colors"
      style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg-card)", color: "var(--ns-fg)", cursor: loading ? "wait" : "pointer" }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "var(--ns-r-sm)", background: "var(--ns-accent-soft)", color: "var(--ns-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>{loading ? "處理中…" : title}</div>
          <div className="muted text-sm" style={{ marginTop: 3, lineHeight: 1.45 }}>{description}</div>
        </div>
      </div>
    </button>
  );
}
