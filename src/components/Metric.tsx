export function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const color =
    tone === "positive" ? "var(--ns-positive)" : tone === "negative" ? "var(--ns-negative)" : "var(--ns-text)";
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
        {label}
      </div>
      <div className="tabular mt-1 text-2xl font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

