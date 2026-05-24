import { CheckCircle } from "@phosphor-icons/react";
import { Field, TextInput } from "./Field";
import { ActionButton } from "./ActionButton";
import { TickerSearchField } from "./TickerSearchField";
import type { PortfolioAssetDraft } from "../data/repositories";

export const emptyHoldingDraft: PortfolioAssetDraft = {
  ticker: "",
  name: "",
  currency: "TWD",
  totalQuantity: 0,
  averageCost: 0,
  acquisitionDate: new Date().toISOString().slice(0, 10),
};

export function HoldingForm({
  value,
  onChange,
  onSubmit,
  submitLabel = "新增持倉",
}: {
  value: PortfolioAssetDraft;
  onChange: (value: PortfolioAssetDraft) => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="Ticker">
          <TickerSearchField
            value={value.ticker}
            onChange={(ticker) => onChange({ ...value, ticker })}
            onSelect={(result) => onChange({
              ...value,
              ticker: result.symbol.toUpperCase(),
              name: result.name || result.symbol,
              currency: result.currency || value.currency,
            })}
          />
        </Field>
        <Field label="幣別">
          <TextInput value={value.currency} onChange={(event) => onChange({ ...value, currency: event.target.value.toUpperCase() })} />
        </Field>
      </div>
      <Field label="名稱">
        <TextInput value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="元大台灣50" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="股數">
          <TextInput type="number" value={value.totalQuantity} onChange={(event) => onChange({ ...value, totalQuantity: Number(event.target.value) })} />
        </Field>
        <Field label="平均成本">
          <TextInput type="number" value={value.averageCost} onChange={(event) => onChange({ ...value, averageCost: Number(event.target.value) })} />
        </Field>
        <Field label="起始日期">
          <TextInput type="date" value={value.acquisitionDate ?? ""} onChange={(event) => onChange({ ...value, acquisitionDate: event.target.value || null })} />
        </Field>
      </div>
      <div>
        <ActionButton onClick={onSubmit}><CheckCircle size={16} />{submitLabel}</ActionButton>
      </div>
    </div>
  );
}
