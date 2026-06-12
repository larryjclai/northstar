/**
 * Map a free-text account name to a known bank / broker / e-wallet brand so the
 * UI can show its logo. Keyword-matched on the account name; returns null when
 * nothing matches, so the caller falls back to the user-chosen icon.
 */

export interface BankBrand {
  /** Canonical domain used to fetch the logo. */
  domain: string;
  /** Human label (for tooltips / picker). */
  label: string;
  /** Primary brand color (hex). Used as accent in account rows and wallet cards. */
  brandColor?: string;
}

/**
 * Keyword → brand. Order matters: more specific keywords first. Matching is
 * case-insensitive and ignores spaces, so "國泰世華" and "Cathay United" both hit
 * the 國泰 entry.
 */
const BRAND_RULES: Array<{ keywords: string[]; brand: BankBrand }> = [
  { keywords: ["國泰", "cathay"], brand: { domain: "cathaybk.com.tw", label: "國泰世華", brandColor: "#006644" } },
  { keywords: ["玉山", "esun"], brand: { domain: "esunbank.com", label: "玉山銀行", brandColor: "#006633" } },
  { keywords: ["richart"], brand: { domain: "richart.tw", label: "Richart", brandColor: "#E60026" } },
  { keywords: ["台新", "taishin"], brand: { domain: "taishinbank.com.tw", label: "台新銀行", brandColor: "#C8003A" } },
  { keywords: ["中國信託", "中信", "ctbc"], brand: { domain: "ctbcbank.com", label: "中國信託", brandColor: "#C00018" } },
  { keywords: ["第一銀", "第一商銀", "firstbank", "一銀"], brand: { domain: "firstbank.com.tw", label: "第一銀行", brandColor: "#003B73" } },
  { keywords: ["兆豐", "mega"], brand: { domain: "megabank.com.tw", label: "兆豐銀行", brandColor: "#004B87" } },
  { keywords: ["富邦", "fubon", "台北富邦"], brand: { domain: "fubon.com", label: "富邦", brandColor: "#C8001E" } },
  { keywords: ["永豐大戶", "sinopac dahu"], brand: { domain: "dahu.sinopac.com", label: "永豐大戶", brandColor: "#FF6600" } },
  { keywords: ["永豐", "sinopac"], brand: { domain: "bank.sinopac.com", label: "永豐銀行", brandColor: "#003399" } },
  { keywords: ["華南", "hncb"], brand: { domain: "hncb.com.tw", label: "華南銀行", brandColor: "#005B99" } },
  { keywords: ["合庫", "合作金庫", "tcb"], brand: { domain: "tcb-bank.com.tw", label: "合作金庫", brandColor: "#006400" } },
  { keywords: ["土地銀行", "土銀", "landbank"], brand: { domain: "landbank.com.tw", label: "土地銀行", brandColor: "#005A87" } },
  { keywords: ["台灣銀行", "臺灣銀行", "台銀", "臺銀"], brand: { domain: "bot.com.tw", label: "臺灣銀行", brandColor: "#003B73" } },
  { keywords: ["郵局", "中華郵政", "郵政"], brand: { domain: "post.gov.tw", label: "中華郵政", brandColor: "#B5121B" } },
  { keywords: ["星展", "dbs"], brand: { domain: "dbs.com.tw", label: "星展銀行", brandColor: "#DA1717" } },
  { keywords: ["匯豐", "滙豐", "hsbc"], brand: { domain: "hsbc.com.tw", label: "匯豐銀行", brandColor: "#DB0011" } },
  { keywords: ["渣打", "standard chartered", "scb"], brand: { domain: "sc.com", label: "渣打銀行", brandColor: "#0F6B00" } },
  { keywords: ["line bank", "linebank", "連線商業", "line銀行"], brand: { domain: "linebank.com.tw", label: "LINE Bank", brandColor: "#00B900" } },
  { keywords: ["將來", "next bank", "nextbank"], brand: { domain: "nextbank.com.tw", label: "將來銀行", brandColor: "#FF6B35" } },
  { keywords: ["樂天", "rakuten"], brand: { domain: "rakuten-bank.com.tw", label: "樂天銀行", brandColor: "#BF0000" } },
  { keywords: ["凱基", "kgi"], brand: { domain: "kgi.com", label: "凱基", brandColor: "#C8001A" } },
  { keywords: ["元大", "yuanta"], brand: { domain: "yuanta.com", label: "元大", brandColor: "#003087" } },
  { keywords: ["富邦證券", "fubon securities"], brand: { domain: "fubon.com", label: "富邦證券", brandColor: "#C8001E" } },
  { keywords: ["群益", "capital securities", "capital.com.tw"], brand: { domain: "capital.com.tw", label: "群益證券", brandColor: "#C8281A" } },
  { keywords: ["街口", "jkos", "jko"], brand: { domain: "jkos.com", label: "街口支付", brandColor: "#FF5A00" } },
  { keywords: ["悠遊", "easycard"], brand: { domain: "easycard.com.tw", label: "悠遊卡", brandColor: "#005BAC" } },
  { keywords: ["firstrade", "第一證券"], brand: { domain: "firstrade.com", label: "Firstrade", brandColor: "#00539B" } },
  { keywords: ["interactive brokers", "ibkr", "盈透"], brand: { domain: "interactivebrokers.com", label: "Interactive Brokers", brandColor: "#E31E24" } },
  { keywords: ["schwab", "嘉信"], brand: { domain: "schwab.com", label: "Charles Schwab", brandColor: "#007DC6" } },
  { keywords: ["crypto.com", "cryptocom", "crypto com"], brand: { domain: "crypto.com", label: "Crypto.com", brandColor: "#002D74" } },
];

export const BANK_BRANDS: BankBrand[] = Array.from(
  new Map(BRAND_RULES.map((rule) => [rule.brand.domain, rule.brand])).values(),
);

export function getBankBrandByDomain(domain: string | null | undefined): BankBrand | null {
  if (!domain) return null;
  return BANK_BRANDS.find((brand) => brand.domain === domain) ?? null;
}

/** Resolve a brand from a manual override first, then a free-text account name. */
export function resolveBankBrand(accountName: string | null | undefined, domainOverride?: string | null): BankBrand | null {
  const override = getBankBrandByDomain(domainOverride);
  if (override) return override;
  const haystack = (accountName ?? "").toLowerCase().replace(/\s+/g, "");
  if (!haystack) return null;
  for (const rule of BRAND_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw.toLowerCase().replace(/\s+/g, ""))) return rule.brand;
    }
  }
  return null;
}

// NOTE: Bank/broker logos are now rendered from bundled local assets, not a
// remote logo CDN — see `domain/bankLogoAssets.ts` and `components/BankLogo`.
// The brand `domain` here is used purely as a stable key to look up a bundled
// asset (and as the manual-override identity), so no network request is made.
