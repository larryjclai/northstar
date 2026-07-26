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
import { useTranslation } from "react-i18next";
import { Button } from "./coss/button";
import { Card } from "./coss/card";
import { useToast } from "./Toast";
import { parseLedgerCsv, type ImportPreview } from "../data/csv";
import { enterDemoMode } from "../data/demoData";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { getFinanceRepository, type LedgerDraft } from "../data/repositories";
import { useDemoMode } from "../state/demoMode";
import { useUiPreferences } from "../state/uiPreferences";

const STORAGE_KEY = "northstar.onboarding.dismissed.v1";
export const OPEN_ONBOARDING_EVENT = "northstar:open-onboarding";

export function openOnboarding() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT));
}

export function OnboardingOverlay() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { accounts, ledger, assets } = useFinanceData();
  const setOnboardingDismissed = useUiPreferences((s) => s.setOnboardingDismissed);
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
  const hasAnyData =
    accountRows.length > 0 || (ledger.data?.length ?? 0) > 0 || (assets.data?.length ?? 0) > 0;
  const ready = accounts.isSuccess && ledger.isSuccess && assets.isSuccess;
  const accountFor = useMemo(
    () => (nameOrId: string) => {
      const key = nameOrId.trim().toLocaleLowerCase();
      return accountRows.find(
        (account) => account.id === nameOrId || account.name.toLocaleLowerCase() === key,
      );
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
    setOnboardingDismissed(true);
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
    toast.success(t("onboarding.toast.importSuccess", { count: rows.length }));
    setPreview(null);
    setStep(3);
  }

  async function loadDemo() {
    setLoadingDemo(true);
    try {
      await enterDemoMode(await getFinanceRepository());
      useDemoMode.getState().set(true);
      await queryClient.invalidateQueries();
      toast.success(t("onboarding.toast.demoLoaded"));
      setStep(3);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("onboarding.toast.demoFailed"));
    } finally {
      setLoadingDemo(false);
    }
  }

  if (!open) return null;

  const stepKeys = ["start", "accounts", "import", "done"] as const;
  const steps = stepKeys.map((key) => t(`onboarding.steps.${key}`));

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.ariaLabel")}
    >
      <div
        className="absolute inset-0 ns-onboarding-scrim"
        style={{
          background: "color-mix(in srgb, var(--ns-bg) 68%, transparent)",
          backdropFilter: "blur(10px)",
        }}
        onClick={dismiss}
      />
      <Card
        className="relative grid w-full grid-cols-1 overflow-hidden p-0 ns-onboarding-card sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
        style={{
          maxWidth: 980,
          maxHeight: "min(760px, calc(100vh - 24px))",
          boxShadow: "var(--ns-shadow-2)",
        }}
      >
        <section
          className="hidden sm:flex"
          style={{
            padding: 28,
            borderRight: "1px solid var(--ns-border)",
            flexDirection: "column",
            gap: 22,
            background: "var(--ns-bg)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--ns-r-sm)",
                background: "var(--ns-accent)",
                color: "var(--ns-accent-fg)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Database size={18} weight="bold" />
            </div>
            <div>
              <div style={{ fontFamily: "var(--ns-font-brand)", fontWeight: 650 }}>Northstar</div>
              <div className="muted text-caption">{t("onboarding.brandTagline")}</div>
            </div>
          </div>

          <div key={step} className="ns-onboarding-step">
            <div className="text-xs mb-2 font-medium" style={{ color: "var(--ns-fg-muted)" }}>
              {t("onboarding.stepIndicator", { current: step + 1, total: 4 })}
            </div>
            <h2
              className="text-[30px] m-0"
              style={{ fontFamily: "var(--ns-font-display)", fontWeight: 650, letterSpacing: 0 }}
            >
              {t(`onboarding.panelTitle.${stepKeys[step]}`)}
            </h2>
            <p className="muted text-body" style={{ margin: "12px 0 0", lineHeight: 1.65 }}>
              {t("onboarding.panelDesc")}
            </p>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {steps.map((label, index) => (
              <div
                key={label}
                className="flex items-center gap-2.5"
                style={{ color: index <= step ? "var(--ns-fg)" : "var(--ns-fg-dim)" }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 99,
                    display: "grid",
                    placeItems: "center",
                    background: index <= step ? "var(--ns-accent)" : "var(--ns-bg-hover)",
                    color: index <= step ? "var(--ns-accent-fg)" : "var(--ns-fg-dim)",
                    fontFamily: "var(--ns-font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    transition: "background 150ms var(--ns-ease), color 150ms var(--ns-ease)",
                  }}
                >
                  {index < step ? <CheckCircle size={15} weight="fill" /> : index + 1}
                </div>
                <span className="text-sm" style={{ fontWeight: index === step ? 600 : 450 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div
            className="mt-auto rounded-lg border p-3 text-xs"
            style={{
              borderColor: "var(--ns-border)",
              color: "var(--ns-fg-muted)",
              lineHeight: 1.55,
            }}
          >
            <LockKey size={14} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
            {t("onboarding.privacyNote")}
          </div>
        </section>

        <section className="p-6" style={{ overflow: "auto" }}>
          <div className="flex justify-between gap-3" style={{ marginBottom: 18 }}>
            <div className="text-xs sm:hidden font-medium" style={{ color: "var(--ns-fg-muted)" }}>
              {t("onboarding.stepIndicator", { current: step + 1, total: 4 })}
            </div>
            <button
              type="button"
              aria-label={t("onboarding.closeLabel")}
              onClick={dismiss}
              style={{
                marginLeft: "auto",
                width: 32,
                height: 32,
                borderRadius: "var(--ns-r-sm)",
                border: "1px solid var(--ns-border)",
                background: "var(--ns-bg-card)",
                color: "var(--ns-fg-muted)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div key={step} className="ns-onboarding-step">
            {step === 0 ? (
              <StepStack
                title={t("onboarding.step0.title")}
                description={t("onboarding.step0.description")}
              >
                <ChoiceCard
                  icon={<Bank size={21} weight="duotone" />}
                  title={t("onboarding.step0.manualTitle")}
                  description={t("onboarding.step0.manualDesc")}
                  onClick={() => go("/accounts")}
                />
                <ChoiceCard
                  icon={<Receipt size={21} weight="duotone" />}
                  title={t("onboarding.step0.ledgerTitle")}
                  description={t("onboarding.step0.ledgerDesc")}
                  onClick={() => setStep(2)}
                />
                <ChoiceCard
                  icon={<TrendUp size={21} weight="duotone" />}
                  title={t("onboarding.step0.investTitle")}
                  description={t("onboarding.step0.investDesc")}
                  onClick={() => go("/investments")}
                />
                <ChoiceCard
                  icon={<Database size={21} weight="duotone" />}
                  title={t("onboarding.step0.demoTitle")}
                  description={t("onboarding.step0.demoDesc")}
                  onClick={loadDemo}
                  loading={loadingDemo}
                />
              </StepStack>
            ) : null}

            {step === 1 ? (
              <StepStack
                title={t("onboarding.step1.title")}
                description={t("onboarding.step1.description")}
              >
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg-card)" }}
                >
                  <div className="muted text-caption mb-2.5">
                    {t("onboarding.step1.previewLabel", {
                      file: "fubon-2026-05.csv",
                      shown: 3,
                      total: 142,
                    })}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                      gap: 8,
                    }}
                  >
                    {["Date", "Account", "Name", "Amount", "Category"].map((label) => (
                      <div
                        key={label}
                        className="mono text-caption rounded-md px-2 py-2"
                        style={{ background: "var(--ns-bg-hover)", color: "var(--ns-fg-muted)" }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-3 flex items-center gap-2 text-xs"
                    style={{ color: "var(--ns-pos)" }}
                  >
                    <CheckCircle size={15} weight="fill" /> {t("onboarding.step1.fieldsMapped")}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button className="justify-center" onClick={() => go("/accounts")}>
                    <Bank size={16} />
                    {t("onboarding.step1.createAccount")}
                  </Button>
                  <Button variant="outline" className="justify-center" onClick={() => setStep(2)}>
                    <FileArrowUp size={16} />
                    {t("onboarding.step1.importLedger")}
                  </Button>
                </div>
              </StepStack>
            ) : null}

            {step === 2 ? (
              <StepStack
                title={t("onboarding.step2.title")}
                description={t("onboarding.step2.description")}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsv}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border p-6 text-left"
                  style={{
                    borderColor: "var(--ns-border)",
                    background: "var(--ns-bg-card)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    className="mb-3.5"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "var(--ns-r-md)",
                      background: "var(--ns-accent-soft)",
                      color: "var(--ns-accent)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <FileArrowUp size={23} weight="duotone" />
                  </div>
                  <div style={{ fontWeight: 650 }}>{t("onboarding.step2.chooseFile")}</div>
                  <div className="muted text-sm mt-1">
                    {accountRows.length
                      ? t("onboarding.step2.chooseFileHasAccounts")
                      : t("onboarding.step2.chooseFileNoAccounts")}
                  </div>
                </button>

                {preview ? (
                  <div
                    className="rounded-lg border p-4"
                    style={{ borderColor: "var(--ns-border)", background: "var(--ns-bg)" }}
                  >
                    <div
                      className="flex justify-between gap-2.5 mb-2.5"
                      style={{ flexWrap: "wrap" }}
                    >
                      <div>
                        <div style={{ fontWeight: 650 }}>
                          {fileName || t("onboarding.step2.previewTitle")}
                        </div>
                        <div className="muted text-caption">
                          {t("onboarding.step2.previewCounts", {
                            valid: preview.valid.length,
                            invalid: preview.invalid.length,
                          })}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={!preview.valid.length}
                        loading={importLedger.isPending}
                        onClick={confirmImport}
                      >
                        {t("onboarding.step2.importButton", { count: preview.valid.length })}{" "}
                        <ArrowRight size={14} />
                      </Button>
                    </div>
                    {preview.invalid.length ? (
                      <div style={{ display: "grid", gap: 6, maxHeight: 140, overflow: "auto" }}>
                        {preview.invalid.slice(0, 6).map((item) => (
                          <div
                            key={item.row}
                            className="text-xs"
                            style={{ color: "var(--ns-neg)" }}
                          >
                            {t("onboarding.step2.rowError", { row: item.row, reason: item.reason })}
                          </div>
                        ))}
                        {preview.invalid.length > 6 ? (
                          <div className="muted text-xs">
                            {t("onboarding.step2.invalidMore", {
                              count: preview.invalid.length - 6,
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-xs" style={{ color: "var(--ns-pos)" }}>
                        {t("onboarding.step2.allValid")}
                      </div>
                    )}
                  </div>
                ) : null}
              </StepStack>
            ) : null}

            {step === 3 ? (
              <StepStack
                title={t("onboarding.step3.title")}
                description={t("onboarding.step3.description")}
              >
                <div className="grid gap-2">
                  <ChoiceCard
                    icon={<Receipt size={21} weight="duotone" />}
                    title={t("onboarding.step3.ledgerTitle")}
                    description={t("onboarding.step3.ledgerDesc")}
                    onClick={() => go("/cash-flow")}
                  />
                  <ChoiceCard
                    icon={<TrendUp size={21} weight="duotone" />}
                    title={t("onboarding.step3.investTitle")}
                    description={t("onboarding.step3.investDesc")}
                    onClick={() => go("/investments")}
                  />
                  <ChoiceCard
                    icon={<LockKey size={21} weight="duotone" />}
                    title={t("onboarding.step3.privacyTitle")}
                    description={t("onboarding.step3.privacyDesc")}
                    onClick={() => go("/settings")}
                  />
                </div>
              </StepStack>
            ) : null}
          </div>

          <footer className="mt-6 flex items-center gap-2">
            <Button variant="ghost" onClick={dismiss}>
              {t("onboarding.skip")}
            </Button>
            <div className="flex-1" />
            {step > 0 && step < 3 ? (
              <Button variant="outline" onClick={() => setStep((value) => Math.max(0, value - 1))}>
                {t("onboarding.back")}
              </Button>
            ) : null}
            {step < 2 ? (
              <Button onClick={() => setStep((value) => value + 1)}>{t("onboarding.next")}</Button>
            ) : null}
            {step === 2 ? (
              <Button variant="outline" onClick={() => setStep(3)}>
                {t("onboarding.step2.importLater")}
              </Button>
            ) : null}
            {step === 3 ? <Button onClick={() => go("/")}>{t("onboarding.finish")}</Button> : null}
          </footer>
        </section>
      </Card>
    </div>
  );
}

function StepStack({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3
        className="text-[24px] m-0"
        style={{ fontFamily: "var(--ns-font-display)", fontWeight: 650, letterSpacing: 0 }}
      >
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
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-lg border p-4 text-left transition-colors"
      style={{
        borderColor: "var(--ns-border)",
        background: "var(--ns-bg-card)",
        color: "var(--ns-fg)",
        cursor: loading ? "wait" : "pointer",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="shrink-0"
          style={{
            width: 40,
            height: 40,
            borderRadius: "var(--ns-r-sm)",
            background: "var(--ns-accent-soft)",
            color: "var(--ns-accent)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div style={{ fontWeight: 650 }}>{loading ? t("onboarding.loadingCard") : title}</div>
          <div className="muted text-sm" style={{ marginTop: 3, lineHeight: 1.45 }}>
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}
