import { useEffect, useState } from "react";
import { resolveBankBrand } from "../domain/bankBrands";
import { getBankLogoAsset } from "../domain/bankLogoAssets";

/**
 * Bank / broker logo overlay for an account marker. Resolves the brand from
 * the account name (or a manual override) and overlays a *bundled* logo on
 * top of the icon marker. All logos are local — no network request is made.
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [accountName, bankBrandDomain]);

  if (failed) return null;
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
