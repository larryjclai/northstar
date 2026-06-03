import type { ComponentType } from "react";
import {
  Bank, Wallet, CreditCard, Cardholder, PiggyBank, Vault, Coins, Money, Receipt,
  CurrencyCircleDollar, CurrencyBtc, HandCoins,
  ChartLineUp, ChartPieSlice, TrendUp, Briefcase, Scales,
  House, Buildings, Bed, Plant,
  Car, Airplane, Train, Bus, Bicycle, GasPump,
  ForkKnife, Coffee, Pizza, Wine, Cake,
  ShoppingCart, ShoppingBag, Handbag, Tag, Package, Gift,
  Heart, FirstAid, Pill, Barbell, GraduationCap, BookOpen, PawPrint,
  FilmSlate, GameController, MusicNotes, Camera, Headphones, SoccerBall, Confetti,
  Lightning, Drop, Flame, Phone, DeviceMobile, Laptop, WifiHigh,
  Target, Star, Trophy, Globe, MapPin, Wrench, Sun, Leaf, Mountains, Umbrella,
} from "@phosphor-icons/react";
import type { IconWeight } from "@phosphor-icons/react";
import type { AccountType } from "../domain/types";

export type PhosphorIcon = ComponentType<{
  size?: number | string;
  weight?: IconWeight;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}>;

/**
 * Curated set of finance-relevant Phosphor icons used as account / category
 * markers. Keyed by the Phosphor component name, which is what we persist in
 * `iconName`. Keep this the single source of truth for both the picker and the
 * renderer so a stored name always resolves back to the same glyph.
 */
export const ICON_REGISTRY: Record<string, PhosphorIcon> = {
  Bank, Wallet, CreditCard, Cardholder, PiggyBank, Vault, Coins, Money, Receipt,
  CurrencyCircleDollar, CurrencyBtc, HandCoins,
  ChartLineUp, ChartPieSlice, TrendUp, Briefcase, Scales,
  House, Buildings, Bed, Plant,
  Car, Airplane, Train, Bus, Bicycle, GasPump,
  ForkKnife, Coffee, Pizza, Wine, Cake,
  ShoppingCart, ShoppingBag, Handbag, Tag, Package, Gift,
  Heart, FirstAid, Pill, Barbell, GraduationCap, BookOpen, PawPrint,
  FilmSlate, GameController, MusicNotes, Camera, Headphones, SoccerBall, Confetti,
  Lightning, Drop, Flame, Phone, DeviceMobile, Laptop, WifiHigh,
  Target, Star, Trophy, Globe, MapPin, Wrench, Sun, Leaf, Mountains, Umbrella,
};

/** Picker layout: grouped icon names with zh search keywords. */
export const ICON_GROUPS: { label: string; names: string[] }[] = [
  { label: "金融", names: ["Bank", "Wallet", "CreditCard", "Cardholder", "PiggyBank", "Vault", "Coins", "Money", "Receipt", "CurrencyCircleDollar", "CurrencyBtc", "HandCoins"] },
  { label: "投資", names: ["ChartLineUp", "ChartPieSlice", "TrendUp", "Briefcase", "Scales"] },
  { label: "居家", names: ["House", "Buildings", "Bed", "Plant"] },
  { label: "交通", names: ["Car", "Airplane", "Train", "Bus", "Bicycle", "GasPump"] },
  { label: "餐飲", names: ["ForkKnife", "Coffee", "Pizza", "Wine", "Cake"] },
  { label: "購物", names: ["ShoppingCart", "ShoppingBag", "Handbag", "Tag", "Package", "Gift"] },
  { label: "生活", names: ["Heart", "FirstAid", "Pill", "Barbell", "GraduationCap", "BookOpen", "PawPrint"] },
  { label: "娛樂", names: ["FilmSlate", "GameController", "MusicNotes", "Camera", "Headphones", "SoccerBall", "Confetti"] },
  { label: "帳單", names: ["Lightning", "Drop", "Flame", "Phone", "DeviceMobile", "Laptop", "WifiHigh"] },
  { label: "其他", names: ["Target", "Star", "Trophy", "Globe", "MapPin", "Wrench", "Sun", "Leaf", "Mountains", "Umbrella"] },
];

/** Chinese search keywords per icon name (used by the picker's search box). */
export const ICON_KEYWORDS: Record<string, string> = {
  Bank: "銀行 存款", Wallet: "錢包 皮夾", CreditCard: "信用卡", Cardholder: "卡片",
  PiggyBank: "存錢 撲滿 儲蓄", Vault: "保險箱 金庫", Coins: "硬幣 零錢", Money: "鈔票 現金",
  Receipt: "收據 發票 帳單", CurrencyCircleDollar: "美元 貨幣 錢", CurrencyBtc: "比特幣 加密貨幣",
  HandCoins: "薪水 收入 借貸", ChartLineUp: "投資 股票 成長", ChartPieSlice: "資產配置 圓餅",
  TrendUp: "上漲 趨勢", Briefcase: "工作 公事包", Scales: "貸款 天秤 平衡",
  House: "房子 房產 居家", Buildings: "大樓 房地產", Bed: "床 寢具 飯店", Plant: "植物 園藝",
  Car: "汽車 交通", Airplane: "飛機 旅行 機票", Train: "火車 高鐵 捷運", Bus: "公車 巴士",
  Bicycle: "腳踏車 單車", GasPump: "加油 油費", ForkKnife: "餐廳 飲食 吃飯", Coffee: "咖啡 飲料",
  Pizza: "披薩 速食", Wine: "酒 紅酒 聚餐", Cake: "蛋糕 甜點 生日", ShoppingCart: "購物 超市 買菜",
  ShoppingBag: "購物 逛街", Handbag: "包包 精品", Tag: "標籤 分類 折扣", Package: "包裹 網購 物流",
  Gift: "禮物 送禮", Heart: "健康 愛 醫療", FirstAid: "醫療 急救 看病", Pill: "藥 保健",
  Barbell: "健身 運動 重訓", GraduationCap: "教育 學費 學習", BookOpen: "書 閱讀 學習",
  PawPrint: "寵物 貓狗", FilmSlate: "電影 影音", GameController: "遊戲 娛樂", MusicNotes: "音樂 訂閱",
  Camera: "相機 攝影", Headphones: "耳機 音樂", SoccerBall: "運動 球賽", Confetti: "慶祝 派對 娛樂",
  Lightning: "電費 電力", Drop: "水費 水", Flame: "瓦斯 燃氣", Phone: "電話 話費",
  DeviceMobile: "手機 通訊", Laptop: "電腦 3C", WifiHigh: "網路 寬頻", Target: "目標",
  Star: "星 收藏 重要", Trophy: "獎盃 成就", Globe: "世界 國際 海外", MapPin: "地點 位置",
  Wrench: "維修 工具 保養", Sun: "天氣 戶外", Leaf: "環保 自然", Mountains: "戶外 登山 旅遊",
  Umbrella: "保險 雨天",
};

/** Default marker icon per account type (used when iconName is unset). */
export const DEFAULT_ACCOUNT_ICON: Record<AccountType, string> = {
  depository: "Bank",
  cash: "Money",
  credit: "CreditCard",
  loan: "Scales",
  investment: "ChartLineUp",
  alternative: "House",
  other: "Wallet",
};

export function isPhosphorIcon(name: string | null | undefined): boolean {
  return !!name && name in ICON_REGISTRY;
}

/**
 * Renders an account / category marker. Resolves a stored `iconName` to a
 * Phosphor glyph when it matches the registry; otherwise falls back to
 * rendering the raw string (legacy emoji data) or an optional letter fallback.
 */
export function Glyph({
  name,
  size = 18,
  weight = "regular",
  color,
  fallbackText,
  className,
  style,
}: {
  name: string | null | undefined;
  size?: number;
  weight?: IconWeight;
  color?: string;
  /** Shown when name is empty/null (e.g. first letters of an account name). */
  fallbackText?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (name && ICON_REGISTRY[name]) {
    const Icon = ICON_REGISTRY[name];
    return <Icon size={size} weight={weight} color={color} className={className} style={style} />;
  }
  const text = name || fallbackText;
  if (text) {
    return (
      <span className={className} style={{ fontSize: name ? size : Math.round(size * 0.7), color, lineHeight: 1, ...style }}>
        {text}
      </span>
    );
  }
  return null;
}
