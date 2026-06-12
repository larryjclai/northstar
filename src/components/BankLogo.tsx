import { useEffect, useState } from "react";
import { useUiPreferences } from "../state/uiPreferences";
import { resolveBankBrand } from "../domain/bankBrands";
import { getBankLogoAsset } from "../domain/bankLogoAssets";

/**
 * Optional bank / broker logo overlay for an account marker. Resolves the brand
 * from the account name (or a manual override) and, when the user has opted in
 * (`bankLogosEnabled`), overlays a *bundled* logo on top of the icon marker.
 *
 * Logos are shipped with the app — see `domain/bankLogoAssets.ts` for how to
 * add them. No network request is made: if a brand has no bundled asset (or the
 * asset fails to load), this renders nothing and the user-chosen Glyph beneath
 * stays visible.
 */
export function BankLogo({
  accountName,
  bankBrandDomain,
  size: _size,
}: {
  accountName: string;
  bankBrandDomain?: string | null;
  /** Marker size in px. Kept for call-site compatibility; the overlay fills its parent. */
  size?: number;
}) {
  const enabled = useUiPreferences((state) => state.bankLogosEnabled);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [accountName, bankBrandDomain]);

  if (!enabled || failed) return null;
  const brand = resolveBankBrand(accountName, bankBrandDomain);
  if (!brand) return null;
  const asset = getBankLogoAsset(brand.domain);
  if (!asset) return null;

  return (
    <img
      src={asset}
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
