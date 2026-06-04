import { CheckCircle } from "@phosphor-icons/react";
import { Field, SelectInput, TextInput } from "./Field";
import { ActionButton } from "./ActionButton";
import { TickerSearchField } from "./TickerSearchField";
import type { PortfolioAssetDraft } from "../data/repositories";
import type { Account, AssetType } from "../domain";
import { assetTypeLabels, gicsSectors, todayInTimezone } from "../domain";

/**
 * Build a blank holding draft using the user's configured timezone for
 * `acquisitionDate`. Kept as a function (not a frozen module-level const)
 * so the date follows the timezone preference instead of being stamped
 * with whatever zone the module first loaded under.
 */
export function makeEmptyHoldingDraft(timezone: string): PortfolioAssetDraft {
  return {
    ticker: "",
    name: "",
    currency: "TWD",
    totalQuantity: 0,
    averageCost: 0,
    acquisitionDate: todayInTimezone(timezone),
    accountId: null,
    assetType: null,
    sector: null,
    industry: null,
  };
}

export function HoldingForm({
  value,
  onChange,
  onSubmit,
  submitLabel = "新增持倉",
  accounts = [],
  classificationOnly = false,
  onTickerSelected,
}: {
  value: PortfolioAssetDraft;
  onChange: (value: PortfolioAssetDraft) => void;
  onSubmit: () => void;
  submitLabel?: string;
  accounts?: Account[];
  classificationOnly?: boolean;
  onTickerSelected?: (value: PortfolioAssetDraft) => void;
}) {
  const eligibleAccounts = accounts.filter(
    (account) => account.deletedAt === null && account.type === "investment",
  );
  const selectedAccount = eligibleAccounts.find((account) => account.id === value.accountId) ?? null;
  const isFundLike = value.assetType === "etf" || value.assetType === "mutual_fund";

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="Ticker">
          {classificationOnly ? (
            <TextInput value={value.ticker} disabled />
          ) : (
            <TickerSearchField
              value={value.ticker}
              onChange={(ticker) => onChange({ ...value, ticker })}
              onSelect={(result) => {
                const next = {
                  ...value,
                  ticker: result.symbol.toUpperCase(),
                  name: result.name || result.symbol,
                  currency: selectedAccount?.currency ?? value.currency,
                  assetType: result.assetType ?? value.assetType ?? null,
                };
                onChange(next);
                onTickerSelected?.(next);
              }}
            />
          )}
        </Field>
        <Field label="幣別">
          <TextInput
            value={selectedAccount?.currency ?? value.currency}
            disabled={classificationOnly || Boolean(selectedAccount)}
            onChange={(event) => onChange({ ...value, currency: event.target.value.toUpperCase() })}
          />
        </Field>
      </div>
      <Field label="名稱">
        <TextInput value={value.name} disabled={classificationOnly} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="元大台灣50" />
      </Field>
      <Field label="券商 / 帳戶">
        <SelectInput
          value={value.accountId ?? ""}
          disabled={classificationOnly}
          onChange={(event) => {
            const account = eligibleAccounts.find((row) => row.id === event.target.value);
            onChange({ ...value, accountId: event.target.value || null, currency: account?.currency ?? value.currency });
          }}
        >
          <option value="">— 選擇券商 —</option>
          {eligibleAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
            </option>
          ))}
        </SelectInput>
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="股數">
          <TextInput type="number" value={value.totalQuantity} disabled={classificationOnly} onChange={(event) => onChange({ ...value, totalQuantity: Number(event.target.value) })} />
        </Field>
        <Field label="平均成本">
          <TextInput type="number" value={value.averageCost} disabled={classificationOnly} onChange={(event) => onChange({ ...value, averageCost: Number(event.target.value) })} />
        </Field>
        <Field label="起始日期">
          <TextInput type="date" value={value.acquisitionDate ?? ""} disabled={classificationOnly} onChange={(event) => onChange({ ...value, acquisitionDate: event.target.value || null })} />
        </Field>
      </div>
      {!classificationOnly ? (
        <p className="muted" style={{ fontSize: 12, marginTop: -2 }}>
          平均成本與起始日期會建立一筆「期初部位」作為成本基準；之後的買賣會在此基礎上加權計算平均成本與報酬。若不確定原始成本，可填入目前市值，報酬將自起始日期起計。
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="類型">
          <SelectInput
            value={value.assetType ?? ""}
            onChange={(event) => onChange({ ...value, assetType: (event.target.value || null) as AssetType | null })}
          >
            <option value="">未指定</option>
            {Object.entries(assetTypeLabels).map(([assetType, label]) => (
              <option key={assetType} value={assetType}>{label}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="產業 / 類別">
          <TextInput
            list={isFundLike ? undefined : "holding-gics-sectors"}
            value={value.sector ?? ""}
            onChange={(event) => onChange({ ...value, sector: event.target.value })}
            placeholder={isFundLike ? "Large Blend" : "Information Technology"}
          />
        </Field>
        {!isFundLike ? (
          <Field label="細產業">
            <TextInput
              value={value.industry ?? ""}
              onChange={(event) => onChange({ ...value, industry: event.target.value })}
              placeholder="Semiconductors"
            />
          </Field>
        ) : null}
      </div>
      <datalist id="holding-gics-sectors">
        {gicsSectors.map((sector) => <option key={sector} value={sector} />)}
      </datalist>
      <div>
        <ActionButton onClick={onSubmit}><CheckCircle size={16} />{submitLabel}</ActionButton>
      </div>
    </div>
  );
}
