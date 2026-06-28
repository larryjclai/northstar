// Thin wrapper around the Tauri `parse_quick_add_on_device` and
// `foundation_models_available` commands.  Returns null / false on any error
// so callers never need to catch — unavailability is a silent no-op.
//
// On non-Apple platforms (Windows, Linux) the Rust command immediately returns
// an error, which this module catches and converts to null/false.

import { invoke } from "@tauri-apps/api/core";
import type { QuickAddContext, QuickAddParseResult } from "../domain/quickAdd";
import type { NlParser } from "../domain/nlParser";
import type { MonthlySummaryInput } from "../domain/monthlySummary";

interface OnDeviceContext {
  accounts: Array<{ id: string; name: string }>;
  categories: string[];
  today: string; // YYYY-MM-DD
  nowDatetimeLocal: string; // YYYY-MM-DDTHH:mm
  mode?: "ledger" | "investment";
}

export function buildOnDeviceCtx(ctx: QuickAddContext): OnDeviceContext {
  const today = ctx.nowDatetimeLocal?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return {
    accounts: ctx.accounts.map((a) => ({ id: a.id, name: a.name })),
    // top-level category names the model must choose from; empty when the caller provides none
    categories: ctx.categories ?? [],
    today,
    nowDatetimeLocal: ctx.nowDatetimeLocal ?? `${today}T00:00`,
    mode: ctx.mode,
  };
}

export async function isAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("foundation_models_available");
  } catch {
    return false;
  }
}

async function parseOnDevice(
  text: string,
  ctx: QuickAddContext,
): Promise<QuickAddParseResult | null> {
  try {
    const contextJson = JSON.stringify(buildOnDeviceCtx(ctx));
    const resultJson = await invoke<string>("parse_quick_add_on_device", {
      text,
      contextJson,
    });
    return JSON.parse(resultJson) as QuickAddParseResult;
  } catch {
    return null;
  }
}

async function prewarm(): Promise<void> {
  try {
    await invoke("foundation_models_prewarm");
  } catch {
    // Prewarm is best-effort; ignore errors silently.
  }
}

/**
 * Generate a monthly financial summary narrative on-device.
 * Returns the zh-TW text, or null on any error / unavailability.
 * Privacy: the input must be a MonthlySummaryInput (aggregate numbers only).
 */
export async function generateMonthlySummary(
  input: MonthlySummaryInput,
): Promise<string | null> {
  try {
    const inputJson = JSON.stringify(input);
    return await invoke<string>("monthly_summary_on_device", { inputJson });
  } catch {
    return null;
  }
}

/**
 * Create a Foundation Models NlParser backed by Tauri invoke().
 * Returns null gracefully when the Tauri command is not registered
 * (e.g. when running in a browser or a non-Apple build).
 */
export function createOnDeviceParser(): NlParser {
  return {
    available: isAvailable,
    parse: parseOnDevice,
    prewarm,
  };
}
