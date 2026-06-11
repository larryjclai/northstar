/**
 * Map a free-text account name to a known bank / broker / e-wallet brand so the
 * UI can show its logo (fetched by domain from a logo CDN). Keyword-matched on
 * the account name; returns null when nothing matches, so the caller falls back
 * to the user-chosen icon. Logos are opt-in (see `bankLogosEnabled`) for the
 * same privacy reason as asset logos: the brand domain is sent to a CDN.
 */

export interface BankBrand {
  /** Canonical domain used to fetch the logo. */
  domain: string;
  /** Human label (for tooltips / picker). */
  label: string;
}

/**
 * Keyword → brand. Order matters: more specific keywords first. Matching is
 * case-insensitive and ignores spaces, so "國泰世華" and "Cathay United" both hit
 * the 國泰 entry.
 */
const BRAND_RULES: Array<{ keywords: string[]; brand: BankBrand }> = [
  { keywords: ["國泰", "cathay"], brand: { domain: "cathaybk.com", label: "國泰世華" } },
  { keywords: ["玉山", "esun"], brand: { domain: "esunbank.com", label: "玉山銀行" } },
  { keywords: ["台新", "richart", "taishin"], brand: { domain: "taishinbank.com.tw", label: "台新銀行" } },
  { keywords: ["中國信託", "中信", "ctbc"], brand: { domain: "ctbcbank.com", label: "中國信託" } },
  { keywords: ["第一銀", "第一商銀", "firstbank", "一銀"], brand: { domain: "firstbank.com.tw", label: "第一銀行" } },
  { keywords: ["兆豐", "mega"], brand: { domain: "megabank.com.tw", label: "兆豐銀行" } },
  { keywords: ["富邦", "fubon", "台北富邦"], brand: { domain: "fubon.com", label: "富邦" } },
  { keywords: ["永豐", "sinopac"], brand: { domain: "banksinopac.com.tw", label: "永豐銀行" } },
  { keywords: ["華南", "hncb"], brand: { domain: "hncb.com.tw", label: "華南銀行" } },
  { keywords: ["合庫", "合作金庫", "tcb"], brand: { domain: "tcb-bank.com.tw", label: "合作金庫" } },
  { keywords: ["土地銀行", "土銀", "landbank"], brand: { domain: "landbank.com.tw", label: "土地銀行" } },
  { keywords: ["台灣銀行", "臺灣銀行", "台銀", "臺銀"], brand: { domain: "bot.com.tw", label: "臺灣銀行" } },
  { keywords: ["郵局", "中華郵政", "郵政"], brand: { domain: "post.gov.tw", label: "中華郵政" } },
  { keywords: ["星展", "dbs"], brand: { domain: "dbs.com.tw", label: "星展銀行" } },
  { keywords: ["匯豐", "滙豐", "hsbc"], brand: { domain: "hsbc.com.tw", label: "匯豐銀行" } },
  { keywords: ["渣打", "standard chartered", "scb"], brand: { domain: "sc.com", label: "渣打銀行" } },
  { keywords: ["line bank", "linebank", "連線商業", "line銀行"], brand: { domain: "linebank.com.tw", label: "LINE Bank" } },
  { keywords: ["將來", "next bank", "nextbank"], brand: { domain: "nextbank.com.tw", label: "將來銀行" } },
  { keywords: ["樂天", "rakuten"], brand: { domain: "rakuten-bank.com.tw", label: "樂天銀行" } },
  { keywords: ["凱基", "kgi"], brand: { domain: "kgi.com", label: "凱基" } },
  { keywords: ["元大", "yuanta"], brand: { domain: "yuanta.com", label: "元大" } },
  { keywords: ["富邦證券", "fubon securities"], brand: { domain: "fubon.com", label: "富邦證券" } },
  { keywords: ["群益", "capital securities", "capital.com.tw"], brand: { domain: "capital.com.tw", label: "群益證券" } },
  { keywords: ["街口", "jkos", "jko"], brand: { domain: "jkos.com", label: "街口支付" } },
  { keywords: ["悠遊", "easycard"], brand: { domain: "easycard.com.tw", label: "悠遊卡" } },
  { keywords: ["firstrade", "第一證券"], brand: { domain: "firstrade.com", label: "Firstrade" } },
  { keywords: ["interactive brokers", "ibkr", "盈透"], brand: { domain: "interactivebrokers.com", label: "Interactive Brokers" } },
  { keywords: ["schwab", "嘉信"], brand: { domain: "schwab.com", label: "Charles Schwab" } },
];

/** Resolve a brand from a free-text account name, or null when none matches. */
export function resolveBankBrand(accountName: string | null | undefined): BankBrand | null {
  const haystack = (accountName ?? "").toLowerCase().replace(/\s+/g, "");
  if (!haystack) return null;
  for (const rule of BRAND_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw.toLowerCase().replace(/\s+/g, ""))) return rule.brand;
    }
  }
  return null;
}

/** Logo CDN URL for a brand domain (Clearbit-style; 404 → caller falls back). */
export function bankLogoUrl(domain: string, size = 64): string {
  return `https://logo.clearbit.com/${domain}?size=${size}`;
}
