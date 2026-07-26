import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { useSymbolSearch } from "../features/market-data/useSymbolSearch";
import type { SymbolSearchResult } from "../features/market-data";

export function TickerSearchField({
  value,
  onChange,
  onSelect,
  placeholder = "0050.TW",
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: SymbolSearchResult) => void;
  placeholder?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const { results, isLoading, error, fundOverflow } = useSymbolSearch(value);
  const showPanel = isFocused && (isLoading || error || results.length > 0);

  return (
    <div className="relative">
      <div
        className="flex items-center rounded-md border bg-[var(--ns-surface-strong)] px-3"
        style={{ borderColor: "var(--ns-border)" }}
      >
        <MagnifyingGlass size={16} style={{ color: "var(--ns-muted)" }} />
        <input
          className="min-h-11 w-full bg-transparent px-2 outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
          placeholder={placeholder}
          aria-label="Ticker"
        />
      </div>
      {showPanel ? (
        <div
          className="absolute left-0 right-0 z-20 mt-2 max-h-80 overflow-y-auto rounded-lg border shadow-lg"
          style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
        >
          {isLoading ? (
            <div className="px-3 py-3 text-sm" style={{ color: "var(--ns-muted)" }}>
              搜尋中...
            </div>
          ) : null}
          {error ? (
            <div
              className="flex items-center gap-2 px-3 py-3 text-sm"
              style={{ color: "var(--ns-warn)" }}
            >
              <WarningCircle size={16} />
              可手動輸入；Yahoo 搜尋暫時無法使用。
            </div>
          ) : null}
          {results.map((result) => (
            <button
              key={`${result.symbol}-${result.exchange ?? ""}`}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition hover:bg-[var(--ns-accent-soft)]"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(result);
                setIsFocused(false);
              }}
            >
              <span className="min-w-0">
                <span className="block font-semibold">{result.symbol}</span>
                <span className="block truncate" style={{ color: "var(--ns-muted)" }}>
                  {result.name || result.symbol}
                </span>
              </span>
              <span className="shrink-0 text-xs" style={{ color: "var(--ns-muted)" }}>
                {[result.currency, result.exchange, result.typeLabel].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
          {fundOverflow > 0 && results.length > 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--ns-muted)" }}>
              還有 {fundOverflow} 檔基金符合，請輸入更完整的基金名稱或受益憑證代號（例：T1605Y）。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
