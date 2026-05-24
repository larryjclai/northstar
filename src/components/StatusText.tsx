export function StatusText({ children }: { children: string }) {
  return (
    <p className="text-sm" style={{ color: "var(--ns-muted)" }}>
      {children}
    </p>
  );
}

