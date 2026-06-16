import type { ErrorComponentProps } from "@tanstack/react-router";
import { Warning } from "@phosphor-icons/react";
import { Button } from "@/components/coss/button";

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-md">
        <div
          className="mx-auto grid size-12 place-items-center"
          style={{ background: "var(--ns-warning-soft)", color: "var(--ns-warn)", borderRadius: "var(--ns-r-md)" }}
        >
          <Warning size={24} weight="fill" />
        </div>
        <h3 className="mt-4 text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
          這個畫面發生問題
        </h3>
        <p className="muted mt-1 text-sm">{error?.message ?? "發生未預期的錯誤。"}</p>
        <Button className="mt-4" onClick={() => reset()}>
          重新載入
        </Button>
      </div>
    </div>
  );
}
