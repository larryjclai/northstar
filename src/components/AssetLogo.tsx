import { useEffect, useState } from "react";
import { useUiPreferences } from "../state/uiPreferences";

const PALETTE = [
  "#f0c050",
  "#6fb3ff",
  "#a99cff",
  "#6ee49a",
  "#ff7d6b",
  "#34c5b0",
  "#f0a050",
  "#9fe870",
  "#d97a9c",
  "#868685",
];

function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Brand logo for an investment ticker, fetched from a public logo CDN by
 * symbol. Falls back to a colored monogram if the logo can't be loaded (TW
 * tickers, ETFs, offline, blocked requests), so the UI always looks finished.
 *
 * Privacy note: rendering a logo sends the bare ticker to the CDN. The monogram
 * fallback keeps the feature fully functional even when the network is blocked.
 */
export function AssetLogo({
  ticker,
  name,
  size = 32,
}: {
  ticker: string;
  name?: string;
  size?: number;
}) {
  const logosEnabled = useUiPreferences((state) => state.assetLogosEnabled);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [ticker]);

  const symbol = (ticker || "").split(".")[0].trim().toUpperCase();
  const label = (name?.trim() || ticker || "?").slice(0, 2).toUpperCase();
  // Only hit the third-party CDN when the user has opted in; otherwise the
  // colored monogram is shown and no ticker leaves the device.
  const src =
    logosEnabled && symbol
      ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png&size=64`
      : "";
  const radius = Math.round(size * 0.28);

  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        background: hashColor(symbol || label),
        color: "#fff",
        fontWeight: 600,
        fontSize: size * 0.4,
        overflow: "hidden",
        lineHeight: 1,
      }}
    >
      {label}
      {!failed && src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            background: "#fff",
            borderRadius: radius,
          }}
        />
      ) : null}
    </span>
  );
}
