// User-correction feedback store for the Quick Add parser.
// When a user fixes the parser's wrong account or category guess in the
// confirm card and submits, we persist a correction so the same token
// resolves correctly next time (without waiting for ledger history to grow).
//
// Storage: localStorage JSON object keyed by lowercased merchant token.
// Applied by buildUserLexicon at weight 20 (higher than any other source).

export interface QuickAddCorrection {
  accountId?: string;
  category?: string;
  subcategory?: string;
}

/** lowercased merchant token → persisted correction */
export type CorrectionStore = Record<string, QuickAddCorrection>;

const CORRECTIONS_KEY = "ns_quick_add_corrections";
const MAX_CORRECTIONS = 300;

export function loadCorrections(): CorrectionStore {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    return raw ? (JSON.parse(raw) as CorrectionStore) : {};
  } catch {
    return {};
  }
}

/**
 * Merge `correction` into the stored entry for `merchant` and persist.
 * Fields are merged (not replaced) so account and category corrections
 * can accumulate independently across separate submissions.
 */
export function saveCorrection(merchant: string, correction: QuickAddCorrection): void {
  const key = merchant.toLowerCase().trim();
  if (!key) return;
  try {
    const store = loadCorrections();
    store[key] = { ...store[key], ...correction };

    // Prune oldest entries when the store grows too large.
    // Object.keys preserves insertion order in V8/modern engines.
    const keys = Object.keys(store);
    if (keys.length > MAX_CORRECTIONS) {
      const pruned: CorrectionStore = {};
      for (const k of keys.slice(keys.length - MAX_CORRECTIONS)) pruned[k] = store[k];
      localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(store));
    }
  } catch {
    // localStorage unavailable (Tauri private mode, test env, etc.)
  }
}
