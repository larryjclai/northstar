export function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive"
      ? "var(--ns-pos)"
      : tone === "negative"
        ? "var(--ns-neg)"
        : "var(--ns-fg)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="text-xs" style={{ color: "var(--ns-fg-muted)", fontWeight: 500 }}>{label}</div>
      <div className="ns-num-md" style={{ color: valueColor }}>{value}</div>
      {sub ? (
        <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>{sub}</div>
      ) : null}
    </div>
  );
}
