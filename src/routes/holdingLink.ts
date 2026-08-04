/**
 * Link target for a holding's detail page. Regular holdings use the ticker
 * route; custom (manually-priced, no-ticker) assets must go through the
 * id-based variant — `/holdings/$ticker` with an empty ticker resolves to
 * `/holdings/`, which matches no route and lands on a 404.
 */
export function holdingDetailLink(target: { ticker: string; assetId: string }):
  | { to: "/holdings/$ticker"; params: { ticker: string } }
  | { to: "/holdings/id/$assetId"; params: { assetId: string } } {
  const ticker = target.ticker.trim();
  return ticker
    ? { to: "/holdings/$ticker", params: { ticker } }
    : { to: "/holdings/id/$assetId", params: { assetId: target.assetId } };
}
