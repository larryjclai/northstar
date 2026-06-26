#!/usr/bin/env python3
"""Build the user-agnostic ETF sector-weights feed (Plan 071).

Server-side only — NOT part of the Tauri app build. Given a list of ETF tickers,
fetch each fund's sector weightings + asset classes via yfinance, map the Yahoo
GICS-ish sector keys onto Plan 070's canonical taxonomy, and emit a single static
`etf-sector-feed.json`. A weekly GitHub Action runs this and publishes the file to
GitHub Pages; the client pulls the whole public file (never per-ticker), so the
request reveals no holdings.

The feed contains ONLY public ETF facts (keyed by public ticker) — never a user id,
never a log of who fetched what. Keep it that way (local-first / privacy invariant).

Usage:
    python3 scripts/etf-feed/build_feed.py VOO VTI 0050.TW           # tickers as args
    python3 scripts/etf-feed/build_feed.py --tickers-file list.txt    # one per line
    python3 scripts/etf-feed/build_feed.py VOO --out public/etf-sector-feed.json

Output schema (matches docs/etf-feed-pipeline.md §4 and src/domain/etfSectorFeed.ts):

    {
      "schemaVersion": 1,
      "source": "yahoo/yfinance@<version>",
      "generatedAt": "<ISO8601 Z>",
      "funds": {
        "VOO": {
          "asOf": "<ISO8601 Z>",
          "assetClasses": { "stock": 0.999, "bond": 0.0, "cash": 0.001, "other": 0.0 },
          "sectorWeights": [ { "sector": "technology", "weight": 0.3913 }, ... ]  // canonical keys
        }
        // bond / no-sector ETFs → empty "sectorWeights" (+ assetClasses) so the client buckets them
      }
    }
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from typing import Any, Dict, List, Optional

# ─── Canonical sector mapping (Plan 070) ─────────────────────────────────────
#
# SOURCE OF TRUTH: src/domain/canonicalSector.ts#GICS_NAME_TO_CANONICAL.
# This Python table is a deliberate, hand-kept MIRROR of that TS table so the
# feed bakes in canonical keys and the client stays dumb. If you add/rename a
# canonical key or a Yahoo alias there, update it here too (and vice-versa).
# The 11 snake_case keys yfinance emits for `funds_data.sector_weightings` are
# all present below; extra aliases mirror the TS file for resilience.
GICS_NAME_TO_CANONICAL: Dict[str, str] = {
    "technology": "technology",
    "information technology": "technology",
    "information_technology": "technology",
    "financial services": "financials",
    "financial_services": "financials",
    "financials": "financials",
    "financial": "financials",
    "healthcare": "healthcare",
    "health care": "healthcare",
    "health_care": "healthcare",
    "consumer cyclical": "consumer_cyclical",
    "consumer_cyclical": "consumer_cyclical",
    "consumer discretionary": "consumer_cyclical",
    "consumer_discretionary": "consumer_cyclical",
    "consumer defensive": "consumer_defensive",
    "consumer_defensive": "consumer_defensive",
    "consumer staples": "consumer_defensive",
    "consumer_staples": "consumer_defensive",
    "industrials": "industrials",
    "industrial": "industrials",
    "energy": "energy",
    "basic materials": "materials",
    "basic_materials": "materials",
    "materials": "materials",
    "real estate": "real_estate",
    "real_estate": "real_estate",
    "realestate": "real_estate",
    "utilities": "utilities",
    "communication services": "communication",
    "communication_services": "communication",
    "communication": "communication",
    "communications": "communication",
}


def to_canonical_sector(raw: Optional[str]) -> Optional[str]:
    """Mirror of toCanonicalSector for Yahoo GICS names (sector half only).

    The TS function also handles TWSE numeric codes, but yfinance ETF sector
    keys are always Yahoo GICS-ish names, so only that branch is replicated.
    Returns None when the key can't be classified (caller drops it).
    """
    if not raw:
        return None
    return GICS_NAME_TO_CANONICAL.get(raw.strip().lower())


# ─── Feed building ───────────────────────────────────────────────────────────

SCHEMA_VERSION = 1


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _round(value: float, places: int = 4) -> float:
    return round(float(value), places)


def _normalize_asset_classes(raw: Optional[Dict[str, Any]]) -> Dict[str, float]:
    """Collapse yfinance asset_classes into { stock, bond, cash, other }.

    yfinance keys look like `stockPosition`, `bondPosition`, `cashPosition`,
    `preferredPosition`, `convertiblePosition`, `otherPosition`. Anything not
    stock/bond/cash is summed into `other`.
    """
    out = {"stock": 0.0, "bond": 0.0, "cash": 0.0, "other": 0.0}
    if not raw:
        return out
    for key, value in raw.items():
        try:
            v = float(value)
        except (TypeError, ValueError):
            continue
        k = key.lower()
        if "stock" in k:
            out["stock"] += v
        elif "bond" in k:
            out["bond"] += v
        elif "cash" in k:
            out["cash"] += v
        else:
            out["other"] += v
    return {k: _round(v) for k, v in out.items()}


def _canonical_sector_weights(raw: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map yfinance sector_weightings → canonical-keyed, merged + sorted list.

    Several Yahoo keys can collapse to one canonical key (none do today, but be
    safe), so weights are summed per canonical key. Empty/None input → [] (the
    client treats that as a bond/mixed ETF → 068 bucket).
    """
    if not raw:
        return []
    merged: Dict[str, float] = {}
    for key, value in raw.items():
        canonical = to_canonical_sector(key)
        if canonical is None:
            continue
        try:
            w = float(value)
        except (TypeError, ValueError):
            continue
        if w <= 0:
            continue
        merged[canonical] = merged.get(canonical, 0.0) + w
    items = [{"sector": k, "weight": _round(v)} for k, v in merged.items()]
    items.sort(key=lambda x: x["weight"], reverse=True)
    return items


def build_fund_entry(ticker: str) -> Optional[Dict[str, Any]]:
    """Fetch + map one ticker. Returns the fund entry dict, or None on hard failure.

    A bond/no-sector ETF returns an entry with empty `sectorWeights` (+ its
    asset_classes) so the client can bucket it; that is NOT a failure.
    """
    import yfinance as yf  # imported lazily so --help works without the dep

    try:
        funds = yf.Ticker(ticker).funds_data
    except Exception as exc:  # noqa: BLE001 — network/parse fragility is expected
        print(f"[etf-feed] {ticker}: failed to load funds_data: {exc}", file=sys.stderr)
        return None

    sector_raw: Optional[Dict[str, Any]] = None
    asset_raw: Optional[Dict[str, Any]] = None
    try:
        sector_raw = funds.sector_weightings
    except Exception as exc:  # noqa: BLE001 — bond ETFs 404 here; that's fine
        print(f"[etf-feed] {ticker}: no sector_weightings ({exc}); empty split.", file=sys.stderr)
    try:
        asset_raw = funds.asset_classes
    except Exception as exc:  # noqa: BLE001
        print(f"[etf-feed] {ticker}: no asset_classes ({exc}).", file=sys.stderr)

    sector_weights = _canonical_sector_weights(sector_raw)
    asset_classes = _normalize_asset_classes(asset_raw)

    # A fund with neither sector weights nor any asset-class signal is a real
    # miss (delisted / bad ticker) — skip it so the feed only carries facts.
    if not sector_weights and not any(v > 0 for v in asset_classes.values()):
        print(f"[etf-feed] {ticker}: no usable data; skipped.", file=sys.stderr)
        return None

    return {
        "asOf": _now_iso(),
        "assetClasses": asset_classes,
        "sectorWeights": sector_weights,
    }


def build_feed(tickers: List[str]) -> Dict[str, Any]:
    try:
        import yfinance as yf

        version = getattr(yf, "__version__", "unknown")
    except Exception:  # noqa: BLE001
        version = "unknown"

    funds: Dict[str, Any] = {}
    for ticker in tickers:
        sym = ticker.strip().upper()
        if not sym:
            continue
        entry = build_fund_entry(sym)
        if entry is not None:
            funds[sym] = entry
            n = len(entry["sectorWeights"])
            print(f"[etf-feed] {sym}: {n} canonical sector(s).", file=sys.stderr)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": f"yahoo/yfinance@{version}",
        "generatedAt": _now_iso(),
        "funds": funds,
    }


def _read_ticker_file(path: str) -> List[str]:
    out: List[str] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            stripped = line.split("#", 1)[0].strip()
            if stripped:
                out.append(stripped)
    return out


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build the ETF sector-weights feed (Plan 071).")
    parser.add_argument("tickers", nargs="*", help="ETF tickers (e.g. VOO 0050.TW).")
    parser.add_argument("--tickers-file", help="File with one ticker per line (# comments allowed).")
    parser.add_argument("--out", help="Write JSON here instead of stdout.")
    args = parser.parse_args(argv)

    tickers: List[str] = list(args.tickers)
    if args.tickers_file:
        tickers.extend(_read_ticker_file(args.tickers_file))
    if not tickers:
        parser.error("no tickers given (pass them as args or via --tickers-file).")

    # De-dup, preserve order.
    seen = set()
    unique = []
    for t in tickers:
        u = t.strip().upper()
        if u and u not in seen:
            seen.add(u)
            unique.append(u)

    feed = build_feed(unique)
    payload = json.dumps(feed, ensure_ascii=False, indent=2) + "\n"

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print(f"[etf-feed] wrote {len(feed['funds'])} fund(s) → {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
