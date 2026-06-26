import { Bank, CurrencyCircleDollar, DownloadSimple, Gear, Tag, Percent } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import { Button } from "../components/coss/button";
import { Skeleton } from "../components/coss/skeleton";
import type { AppSettings } from "../domain";
import { SettingsCategories } from "./settings/CategoriesSection";
import { SettingsMerchants } from "./settings/MerchantsSection";
import { SettingsFX } from "./settings/FxSection";
import { SettingsExport } from "./settings/ExportSection";
import { SettingsGeneral } from "./settings/GeneralSection";
import { SettingsTradingFees } from "./settings/TradingFeesSection";

const emptySettings: AppSettings = {
  primaryCurrency: "TWD",
  exchangeRates: [],
  categories: [],
  merchants: [],
};

// ─────── Main Route ───────
// Shell only: tab sidebar + per-tab sections. The tab implementations live in
// ./settings/*Section.tsx (split 2026-06-10; this file was 2,300+ lines).
export function SettingsRoute() {
  const { t } = useTranslation();
  const { settings, dailyFxRates, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const [form, setForm] = useState(emptySettings);
  const seededRef = useRef(false);
  const updateSettings = useRepositoryMutation((repository, input: AppSettings) => repository.updateAppSettings(input), ["settings"]);
  const renameCategoryMutation = useRepositoryMutation((repository, input: { oldName: string; newName: string }) => repository.renameCategory(input.oldName, input.newName), ["settings", "ledger"]);
  const renameMerchantMutation = useRepositoryMutation((repository, input: { oldName: string; newName: string }) => repository.renameMerchant(input.oldName, input.newName), ["settings", "ledger"]);

  useEffect(() => {
    if (!settings.data) return;
    if (seededRef.current) return;
    setForm(settings.data);
    seededRef.current = true;
  }, [settings.data]);

  // Deep-link support: `/settings?tab=<id>` opens directly on a known tab
  // (e.g. investment accounts → 交易成本). Unknown ids fall back to categories.
  const search = useSearch({ from: "/settings" });
  const TAB_IDS = ['categories', 'merchants', 'fx', 'export', 'tradingFees', 'general'];
  const [tab, setTab] = useState(search.tab && TAB_IDS.includes(search.tab) ? search.tab : 'categories');

  const tabs = [
    { id: 'categories', label: t('settings.categories'), icon: <Tag size={14} /> },
    { id: 'merchants',  label: t('settings.merchants'), icon: <Bank size={14} /> },
    { id: 'fx',         label: t('settings.fx'), icon: <CurrencyCircleDollar size={14} /> },
    { id: 'export',     label: t('settings.export'), icon: <DownloadSimple size={14} /> },
    { id: 'tradingFees', label: '交易成本', icon: <Percent size={14} /> },
    { id: 'general',    label: t('settings.general'), icon: <Gear size={14} /> },
  ];

  async function submit(nextForm: AppSettings) {
    try {
      await updateSettings.mutateAsync(nextForm);
      setForm(nextForm);
    } catch (e) {
      console.error(e);
    }
  }

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <Skeleton className="h-[400px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ns-settings-layout">
      {/* Settings sidebar */}
      <aside className="ns-settings-sidebar">
        <div style={{ padding: '0 8px 16px' }}>
          <div className="text-xs" style={{  marginBottom: 4 , color: "var(--ns-fg-muted)", fontWeight: 500 }}>Settings</div>
          <h2 className="text-xl" style={{ fontFamily: 'var(--ns-font-display)', margin: 0, fontWeight: 600 }}>{t('settings.title')}</h2>
        </div>
        <div className="ns-settings-tabs">
          {tabs.map((tItem) => (
            <div key={tItem.id}
              className={`ns-nav-link ${tab === tItem.id ? 'active' : ''}`}
              onClick={() => setTab(tItem.id)}>
              {tItem.icon}
              <span className="text-body">{tItem.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Settings content */}
      <main className="ns-settings-content">
        {tab === 'categories' && <SettingsCategories form={form} setForm={setForm} submit={submit} t={t} renameCategory={(o: string, n: string) => renameCategoryMutation.mutateAsync({ oldName: o, newName: n })} />}
        {tab === 'merchants'  && <SettingsMerchants form={form} setForm={setForm} submit={submit} t={t} renameMerchant={(o: string, n: string) => renameMerchantMutation.mutateAsync({ oldName: o, newName: n })} />}
        {tab === 'fx'         && <SettingsFX form={form} submit={submit} dailyFxRates={dailyFxRates.data || []} t={t} />}
        {tab === 'export'     && <SettingsExport t={t} />}
        {tab === 'tradingFees' && <SettingsTradingFees form={form} submit={submit} />}
        {tab === 'general'    && <SettingsGeneral form={form} t={t} />}
      </main>
    </div>
  );
}
