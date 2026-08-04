import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Bank,
  House,
  Receipt,
  Target,
  TrendUp,
  GearSix,
  ChartLineUp,
  ClockCounterClockwise,
  Storefront,
  Tag,
} from "@phosphor-icons/react";
import { useFinanceData } from "../data/hooks";
import { holdingDetailLink } from "../routes/holdingLink";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

export interface HoldingSearchEntry {
  key: string;
  ticker: string;
  assetId: string;
  name: string;
}

/**
 * Search index for the 持倉 group: ticker-bearing assets dedupe to one entry
 * per ticker (a ticker held in two books is still one detail page), while
 * custom (no-ticker) assets get one entry each, found by their name — they
 * used to be skipped entirely and were unreachable from ⌘K. Exported for
 * testing.
 */
export function buildHoldingSearchEntries(
  assetRows: Array<{ id: string; ticker: string; name: string }>,
): HoldingSearchEntry[] {
  const byTicker = new Map<string, HoldingSearchEntry>();
  const custom: HoldingSearchEntry[] = [];
  for (const asset of assetRows) {
    const ticker = asset.ticker.trim();
    if (ticker) {
      if (!byTicker.has(ticker)) {
        byTicker.set(ticker, {
          key: `ticker:${ticker}`,
          ticker,
          assetId: asset.id,
          name: asset.name || ticker,
        });
      }
    } else {
      custom.push({
        key: `asset:${asset.id}`,
        ticker: "",
        assetId: asset.id,
        name: asset.name || "自訂資產",
      });
    }
  }
  return [...byTicker.values(), ...custom];
}

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
  const { accounts, assets, investments, ledger, settings, financialGoals } = useFinanceData();
  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const goalRows = financialGoals.data ?? [];
  const merchants = useMemo(
    () => [...new Set(ledgerRows.map((row) => row.merchant).filter(Boolean))].slice(0, 50),
    [ledgerRows],
  );
  const categories = settings.data?.categories ?? [];

  const holdings = useMemo(() => buildHoldingSearchEntries(assetRows), [assetRows]);

  // Format recent transactions
  const txns = useMemo(() => {
    return recordRows
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50) // Limit search scope
      .map((r) => {
        const asset = assetRows.find((a) => a.id === r.assetId);
        const ticker = asset?.ticker?.trim() || "";
        const name = ticker || asset?.name || "Unknown Asset";
        const actionLabel =
          r.action === "buy"
            ? "買進"
            : r.action === "sell"
              ? "賣出"
              : r.action === "cashDividend"
                ? "現金股息"
                : r.action === "stockDividend"
                  ? "股票股息"
                  : "交易";
        return {
          id: r.id,
          label: `${r.date} · ${actionLabel} ${name} ${r.quantity ? `(${r.quantity})` : ""}`,
          assetName: name,
          ticker,
          assetId: asset?.id ?? null,
        };
      });
  }, [recordRows, assetRows]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
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
        <CommandInput placeholder="搜尋頁面、帳戶、交易、商家、分類、持股或目標..." />
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

          {accountRows.length > 0 && (
            <CommandGroup heading="帳戶 (Accounts)">
              {accountRows.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`帳戶 ${account.name} ${account.currency}`}
                  onSelect={() => runCommand(() => navigate({ to: "/accounts" }))}
                >
                  <Bank size={16} weight="duotone" className="mr-2" />
                  <span>{account.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{account.currency}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {ledgerRows.length > 0 && (
            <CommandGroup heading="記帳流水 (Ledger)">
              {[...ledgerRows]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 80)
                .map((row) => (
                  <CommandItem
                    key={row.id}
                    value={`流水 ${row.date} ${row.name} ${row.merchant} ${row.category}`}
                    onSelect={() => runCommand(() => navigate({ to: "/cash-flow" }))}
                  >
                    <Receipt size={16} weight="duotone" className="mr-2" />
                    <span>
                      {row.date.slice(0, 10)} · {row.name || row.merchant || row.category}
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          )}

          {merchants.length > 0 && (
            <CommandGroup heading="商家 (Merchants)">
              {merchants.map((merchant) => (
                <CommandItem
                  key={merchant}
                  value={`商家 ${merchant}`}
                  onSelect={() =>
                    runCommand(() =>
                      navigate({
                        to: "/cash-flow/merchants/$merchantName",
                        params: { merchantName: merchant },
                      }),
                    )
                  }
                >
                  <Storefront size={16} weight="duotone" className="mr-2" />
                  <span>{merchant}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {categories.length > 0 && (
            <CommandGroup heading="分類 (Categories)">
              {categories.map((category) => (
                <CommandItem
                  key={category.name}
                  value={`分類 ${category.name}`}
                  onSelect={() =>
                    runCommand(() =>
                      navigate({
                        to: "/cash-flow/categories/$categoryName",
                        params: { categoryName: category.name },
                      }),
                    )
                  }
                >
                  <Tag size={16} weight="duotone" className="mr-2" />
                  <span>
                    {category.iconName || "•"} {category.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {holdings.length > 0 && (
            <CommandGroup heading="持倉 (Holdings)">
              {holdings.map((t) => (
                <CommandItem
                  key={t.key}
                  value={`持倉 ${t.ticker} ${t.name}`}
                  onSelect={() => runCommand(() => navigate(holdingDetailLink(t)))}
                >
                  <ChartLineUp size={16} weight="duotone" className="mr-2" />
                  <span>{t.ticker || t.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {t.ticker ? t.name : "自訂資產"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {txns.length > 0 && (
            <CommandGroup heading="過往交易紀錄 (Transactions)">
              {txns.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`交易 ${t.label}`}
                  onSelect={() =>
                    runCommand(() =>
                      t.assetId
                        ? navigate(holdingDetailLink({ ticker: t.ticker, assetId: t.assetId }))
                        : navigate({ to: "/investments" }),
                    )
                  }
                >
                  <ClockCounterClockwise size={16} weight="duotone" className="mr-2" />
                  <span>{t.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {goalRows.length > 0 && (
            <CommandGroup heading="目標 (Goals)">
              {goalRows.map((goal) => (
                <CommandItem
                  key={goal.id}
                  value={`目標 ${goal.name}`}
                  onSelect={() => runCommand(() => navigate({ to: "/goals" }))}
                >
                  <Target size={16} weight="duotone" className="mr-2" />
                  <span>{goal.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
