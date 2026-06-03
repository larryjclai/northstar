import { useMemo, useState } from "react";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Glyph, DEFAULT_ACCOUNT_ICON } from "../lib/icons";
import type { Account, AccountType } from "../domain/types";

type AccountLike = Pick<Account, "id" | "name" | "type" | "iconName" | "color">;

const accountTypeLabels: Record<AccountType, string> = {
  depository: "銀行帳戶",
  cash: "現金",
  credit: "信用卡",
  loan: "貸款",
  investment: "投資",
  alternative: "實體資產",
  other: "其他",
};

// Display grouping mirrors AccountsRoute so the filter reads the same as the list.
const GROUP_ORDER: { key: string; label: string; types: AccountType[] }[] = [
  { key: "cash", label: "現金 / 存款", types: ["depository", "cash"] },
  { key: "investment", label: "投資 / 券商", types: ["investment"] },
  { key: "alternative", label: "實體資產", types: ["alternative"] },
  { key: "credit", label: "信用卡 / 負債", types: ["credit", "loan"] },
  { key: "other", label: "其他", types: ["other"] },
];

const SWATCHES = ["var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)", "var(--ns-chart-4)", "var(--ns-chart-5)"];

function AccountMark({ account, index, size = 22 }: { account: AccountLike; index: number; size?: number }) {
  const bg = account.color || SWATCHES[index % SWATCHES.length];
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "var(--ns-r-sm)", flexShrink: 0,
        background: bg, color: "var(--ns-bg)", display: "inline-flex",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Glyph
        name={account.iconName || DEFAULT_ACCOUNT_ICON[account.type]}
        size={Math.round(size * 0.62)}
        color="var(--ns-bg)"
        fallbackText={account.name.slice(0, 1)}
      />
    </span>
  );
}

/**
 * Searchable, grouped account picker. Replaces the native <select> account
 * filters. `value` is "all" or an account id.
 */
export function AccountFilter({
  accounts,
  value,
  onChange,
  allLabel = "所有帳戶",
  className,
  style,
}: {
  accounts: AccountLike[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    accounts.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [accounts]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({
        ...g,
        rows: accounts.filter((a) => g.types.includes(a.type)),
      })).filter((g) => g.rows.length > 0),
    [accounts]
  );

  const selected = value === "all" ? null : accounts.find((a) => a.id === value) ?? null;

  function select(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={className}
        render={
          <button
            type="button"
            className="ns-input"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, minWidth: 140, maxWidth: 220,
              height: 36, boxSizing: "border-box", padding: "0 10px", cursor: "pointer",
              textAlign: "left", whiteSpace: "nowrap", ...style,
            }}
          >
            {selected ? (
              <AccountMark account={selected} index={indexById.get(selected.id) ?? 0} size={20} />
            ) : null}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {selected ? selected.name : allLabel}
            </span>
            <CaretUpDown size={14} style={{ flexShrink: 0, color: "var(--ns-fg-dim)" }} />
          </button>
        }
      />
      <PopoverContent align="start" className="w-64 p-0" style={{ width: 256 }}>
        <Command>
          <CommandInput placeholder="搜尋帳戶…" />
          <CommandList>
            <CommandEmpty>找不到帳戶</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`${allLabel} all`} onSelect={() => select("all")}>
                <span style={{ flex: 1 }}>{allLabel}</span>
                {value === "all" ? <Check size={14} /> : null}
              </CommandItem>
            </CommandGroup>
            {groups.map((g) => (
              <CommandGroup key={g.key} heading={g.label}>
                {g.rows.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.name} ${accountTypeLabels[a.type]} ${a.id}`}
                    onSelect={() => select(a.id)}
                  >
                    <AccountMark account={a} index={indexById.get(a.id) ?? 0} size={22} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.name}
                    </span>
                    {value === a.id ? <Check size={14} style={{ flexShrink: 0 }} /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
