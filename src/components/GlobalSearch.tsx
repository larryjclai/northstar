import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Bank, House, Receipt, Target, TrendUp, GearSix, ChartLineUp, ClockCounterClockwise } from "@phosphor-icons/react";
import { useFinanceData } from "../data/hooks";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

const navItems = [
  { to: "/", label: "總覽 (Dashboard)", icon: House },
  { to: "/cash-flow", label: "記帳 (Cash Flow)", icon: Receipt },
  { to: "/accounts", label: "帳戶 (Accounts)", icon: Bank },
  { to: "/investments", label: "投資 (Investments)", icon: TrendUp },
  { to: "/goals", label: "目標 (Goals)", icon: Target },
  { to: "/settings", label: "設定 (Settings)", icon: GearSix },
] as const;

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { assets, investments } = useFinanceData();
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];

  // Group assets by ticker
  const tickers = useMemo(() => {
    const map = new Map<string, string>();
    for (const asset of assetRows) {
      if (!asset.ticker) continue;
      if (!map.has(asset.ticker)) {
        map.set(asset.ticker, asset.name || asset.ticker);
      }
    }
    return Array.from(map.entries()).map(([ticker, name]) => ({ ticker, name }));
  }, [assetRows]);

  // Format recent transactions
  const txns = useMemo(() => {
    return recordRows
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50) // Limit search scope
      .map((r) => {
        const asset = assetRows.find((a) => a.id === r.assetId);
        const name = asset?.ticker || asset?.name || "Unknown Asset";
        const actionLabel = 
          r.action === "buy" ? "買進" : 
          r.action === "sell" ? "賣出" : 
          r.action === "cashDividend" ? "現金股息" :
          r.action === "stockDividend" ? "股票股息" : "交易";
        return {
          id: r.id,
          label: `${r.date} · ${actionLabel} ${name} ${r.quantity ? `(${r.quantity})` : ""}`,
          assetName: name,
        };
      });
  }, [recordRows, assetRows]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const runCommand = (command: () => void) => {
    onOpenChange(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="搜尋頁面、股票代號..." />
        <CommandList>
          <CommandEmpty>找不到相關結果。</CommandEmpty>
          
          <CommandGroup heading="導覽列 (Navigation)">
            {navItems.map((item) => (
              <CommandItem
                key={item.to}
                onSelect={() => runCommand(() => navigate({ to: item.to }))}
              >
                <item.icon size={16} weight="duotone" className="mr-2" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {tickers.length > 0 && (
            <CommandGroup heading="持倉 (Holdings)">
              {tickers.map((t) => (
                <CommandItem
                  key={t.ticker}
                  onSelect={() => runCommand(() => navigate({ to: "/holdings/$ticker", params: { ticker: t.ticker } }))}
                >
                  <ChartLineUp size={16} weight="duotone" className="mr-2" />
                  <span>{t.ticker}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{t.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {txns.length > 0 && (
            <CommandGroup heading="過往交易紀錄 (Transactions)">
              {txns.map((t) => (
                <CommandItem
                  key={t.id}
                  onSelect={() => runCommand(() => navigate({ to: "/cash-flow" }))}
                >
                  <ClockCounterClockwise size={16} weight="duotone" className="mr-2" />
                  <span>{t.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
