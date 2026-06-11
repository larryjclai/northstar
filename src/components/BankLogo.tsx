import { useEffect, useState } from "react";
import { useUiPreferences } from "../state/uiPreferences";
import { resolveBankBrand, bankLogoUrl } from "../domain/bankBrands";

/**
 * Optional bank / broker logo overlay for an account marker. Resolves the brand
 * from the account name and, when the user has opted in (`bankLogosEnabled`),
 * overlays the logo on top of the existing icon marker. Renders nothing when
 * the feature is off, the brand is unknown, or the logo fails to load — so the
 * user-chosen Glyph underneath always remains the fallback.
 *
 * Privacy note: showing a logo sends the brand domain to a logo CDN. Off by
 * default, mirroring AssetLogo.
 */
export function BankLogo({ accountName, size }: { accountName: string; size: number }) {
  const enabled = useUiPreferences((state) => state.bankLogosEnabled);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [accountName]);

  if (!enabled || failed) return null;
  const brand = resolveBankBrand(accountName);
  if (!brand) return null;

  return (
    <img
      src={bankLogoUrl(brand.domain, Math.max(64, size * 2))}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        background: "#fff",
        borderRadius: "inherit",
      }}
    />
  );
}
