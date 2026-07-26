import { useState } from "react";
import { formatMoney } from "../domain";

export type MonthPoint = { key: string; label: string; amount: number; partial: boolean };

function Tooltip({ text }: { text: string }) {
  return (
    <div
      className="text-caption"
      style={{
        position: "absolute",
        bottom: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginBottom: 6,
        padding: "3px 8px",
        borderRadius: "var(--ns-r-sm)",
        background: "var(--ns-fg)",
        color: "var(--ns-bg)",
        fontFamily: "var(--ns-font-mono)",
        fontVariantNumeric: "tabular-nums lining-nums",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 5,
        boxShadow: "var(--ns-shadow-md)",
      }}
    >
      {text}
    </div>
  );
}

/** Monthly spend bars. Hover (desktop) or tap (mobile) reveals the amount;
 * zero-value months render with no bar height. */
export function MiniBars({
  data,
  color,
  currency,
}: {
  data: MonthPoint[];
  color: string;
  currency: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((item) => item.amount));
  return (
    <div className="ns-mini-bars">
      {data.map((item, i) => {
        const height = item.amount > 0 ? Math.max(4, (item.amount / max) * 112) : 0;
        return (
          <div
            key={item.key}
            className="ns-mini-bar-cell"
            style={{ position: "relative" }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
            onClick={() => setActive((cur) => (cur === i ? null : i))}
          >
            {active === i ? <Tooltip text={formatMoney(item.amount, currency)} /> : null}
            <div
              className="ns-mini-bar"
              data-partial={item.partial || undefined}
              data-zero={item.amount <= 0 || undefined}
              style={{ height: `${height}px`, background: color }}
            />
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Day-of-week spend bars. Hover/tap reveals the amount; zero days render
 * with no bar height. */
export function WeekdayBars({
  data,
  currency,
}: {
  data: Array<{ key: number; name: string; amount: number }>;
  currency: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((item) => item.amount));
  return (
    <div className="ns-weekday-bars">
      {data.map((item, i) => {
        const height = item.amount > 0 ? Math.max(4, (item.amount / max) * 54) : 0;
        return (
          <div
            key={item.key}
            className="ns-weekday-cell"
            data-peak={(item.amount === max && item.amount > 0) || undefined}
            style={{ position: "relative" }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
            onClick={() => setActive((cur) => (cur === i ? null : i))}
          >
            {active === i ? <Tooltip text={formatMoney(item.amount, currency)} /> : null}
            <div data-zero={item.amount <= 0 || undefined} style={{ height: `${height}px` }} />
            <span>{item.name}</span>
          </div>
        );
      })}
    </div>
  );
}
