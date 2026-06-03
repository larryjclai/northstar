import * as React from "react";

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  /** Decimal places shown when the field is blurred / formatted. */
  decimals?: number;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * Numeric input that edits a raw string while focused so partial values like
 * "0." or "0.05" can be typed directly. The previous fields round-tripped every
 * keystroke through `Number()`, which dropped leading-zero decimals — to enter
 * "0.05" you had to type "5" first and prepend "0.0". Buffering the raw text
 * while focused avoids that; the value is formatted with thousand separators
 * once the field blurs.
 */
export function NumberField({
  value,
  onChange,
  decimals = 0,
  placeholder,
  className = "ns-input mono",
  style,
  "aria-label": ariaLabel,
  onFocus,
  onBlur,
}: NumberFieldProps) {
  const [raw, setRaw] = React.useState<string | null>(null);
  const display =
    raw !== null
      ? raw
      : value === 0
        ? ""
        : value.toLocaleString("zh-TW", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

  return (
    <input
      className={className}
      style={style}
      inputMode="decimal"
      aria-label={ariaLabel}
      value={display}
      placeholder={placeholder}
      onFocus={() => { setRaw(value === 0 ? "" : String(value)); onFocus?.(); }}
      onBlur={() => { setRaw(null); onBlur?.(); }}
      onChange={(event) => {
        // Strip non-numerics and collapse to a single decimal point.
        let cleaned = event.target.value.replace(/[^\d.]/g, "");
        const firstDot = cleaned.indexOf(".");
        if (firstDot !== -1) {
          cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
        }
        setRaw(cleaned);
        const parsed = Number(cleaned);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
    />
  );
}
