// Cold-start seed: keyword → category mapping used when a user has no history.
// Once they have ledger history, buildUserLexicon's learned keywords take over
// (history always outranks the seed — see userLexicon.ts priority rules).
//
// Categories must match the default settings.categories names so they resolve
// correctly; unknown category names are silently dropped at query time.

export interface SeedCategory {
  category: string;
  subcategory: string;
}

// Each entry: [keyword tokens (lowercased), category]
// Multiple tokens → all map to the same category.
export const SEED_KEYWORDS: Array<[string[], SeedCategory]> = [
  // 交通
  [["計程車", "taxi", "cab", "小黃"], { category: "交通", subcategory: "計程車" }],
  [["uber", "lyft", "grab"], { category: "交通", subcategory: "計程車" }],
  [["捷運", "mrt", "metro", "subway"], { category: "交通", subcategory: "捷運" }],
  [["加油", "油錢", "油費", "gas"], { category: "交通", subcategory: "加油" }],
  [["停車", "parking"], { category: "交通", subcategory: "停車" }],
  [["公車", "bus", "巴士"], { category: "交通", subcategory: "捷運" }],
  [["火車", "高鐵", "台鐵", "train"], { category: "交通", subcategory: "捷運" }],
  // 餐飲
  [
    ["咖啡", "coffee", "拿鐵", "latte", "星巴克", "starbucks"],
    { category: "餐飲", subcategory: "飲料" },
  ],
  [["飲料", "手搖", "珍奶", "bubble tea", "tea"], { category: "餐飲", subcategory: "飲料" }],
  [
    ["便當", "外食", "lunch", "dinner", "午餐", "晚餐", "早餐", "breakfast"],
    { category: "餐飲", subcategory: "外食" },
  ],
  [
    ["點心", "snack", "零食", "甜點", "dessert", "蛋糕", "cake"],
    { category: "餐飲", subcategory: "點心" },
  ],
  [["菜", "菜錢", "超市", "grocery", "食材"], { category: "餐飲", subcategory: "菜錢" }],
  // 居住
  [["房租", "rent", "租金"], { category: "居住", subcategory: "房租" }],
  [
    ["水電", "電費", "水費", "utility", "utilities", "瓦斯"],
    { category: "居住", subcategory: "水電" },
  ],
  [["管理費", "hoa"], { category: "居住", subcategory: "管理費" }],
  // 收入
  [
    ["薪資", "薪水", "salary", "payroll", "工資", "月薪"],
    { category: "收入", subcategory: "薪資" },
  ],
  [["獎金", "bonus", "年終"], { category: "收入", subcategory: "獎金" }],
  [["退款", "refund", "退費"], { category: "收入", subcategory: "退款" }],
  [["利息", "interest"], { category: "收入", subcategory: "獎金" }],
];

/** Build a flat Map<lowercased-token, SeedCategory> for O(1) lookup. */
export function buildSeedKeywordMap(): Map<string, SeedCategory> {
  const map = new Map<string, SeedCategory>();
  for (const [tokens, cat] of SEED_KEYWORDS) {
    for (const t of tokens) {
      if (!map.has(t.toLowerCase())) map.set(t.toLowerCase(), cat);
    }
  }
  return map;
}
