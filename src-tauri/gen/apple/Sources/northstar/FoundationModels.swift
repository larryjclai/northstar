// Apple Foundation Models plugin — Tier 1 on-device NL parsing.
//
// Availability: macOS 26+ / iOS 26+ with Apple Intelligence enabled.
// On older OS or unsupported hardware, all entry points return early
// so the Rust caller falls back to Tier 0 gracefully.
//
// Bridge pattern: @_cdecl functions export C-compatible symbols that
// are called from Rust via extern "C" declarations in lib.rs.
// Memory: result strings are allocated with strdup() (C malloc), so the
// Rust caller must invoke northstar_free_string() after copying the value.

import Foundation
import FoundationModels

// ── Input context passed from Rust as JSON ────────────────────────────────

private struct AccountInfo: Decodable {
    let id: String
    let name: String
}

private struct OnDeviceContext: Decodable {
    let accounts: [AccountInfo]
    let categories: [String]
    let today: String           // YYYY-MM-DD
    let nowDatetimeLocal: String // YYYY-MM-DDTHH:mm
    let mode: String?
}

// ── Foundation Models guided-generation output type ───────────────────────

@available(iOS 26.0, macOS 26.0, *)
@Generable
private struct ParsedDraft {
    @Guide(description: "ledger or investment")
    var kind: String

    @Guide(description: "expense or income; null when kind is investment")
    var entryType: String?

    @Guide(description: "transaction amount as a positive number; null when not present")
    var amount: Double?

    @Guide(description: "must be EXACTLY one of the provided account IDs. Set null unless the text explicitly names an account/payment method. Never guess.")
    var accountId: String?

    @Guide(description: "store / vendor / payee name only, e.g. 全家便利商店, 星巴克, 7-11; null when no store is mentioned")
    var merchant: String?

    @Guide(description: "the item or short description, e.g. 午餐, 拿鐵, 計程車; distinct from merchant; null when not present")
    var name: String?

    @Guide(description: "must be one of the provided category names; null when not identifiable")
    var category: String?

    @Guide(description: "subcategory within the chosen category; null when not identifiable")
    var subcategory: String?

    @Guide(description: "ISO datetime-local YYYY-MM-DDTHH:mm resolved from any date keyword in the input; null means use today")
    var date: String?

    // Investment fields (null when kind is ledger)
    @Guide(description: "buy or sell; null when kind is ledger")
    var action: String?

    @Guide(description: "ticker symbol, e.g. AAPL or 2330.TW; null when kind is ledger")
    var ticker: String?

    @Guide(description: "number of shares or units; null when kind is ledger")
    var quantity: Double?

    @Guide(description: "price per share; null when kind is ledger")
    var price: Double?
}

// ── Core async parse function ─────────────────────────────────────────────

@available(iOS 26.0, macOS 26.0, *)
private func performParse(text: String, context: OnDeviceContext) async -> String? {
    guard SystemLanguageModel.default.availability == .available else { return nil }

    let accountList = context.accounts
        .map { "  \($0.id): \($0.name)" }
        .joined(separator: "\n")

    let categoryList = context.categories.isEmpty
        ? "(none provided)"
        : context.categories.joined(separator: ", ")

    let instructions = """
    You are a financial transaction parser for a personal finance app (Northstar).
    Extract structured data from the user's natural language input.

    Available accounts (id: name):
    \(accountList)

    Available categories: \(categoryList)

    Today's date: \(context.today)
    Current datetime: \(context.nowDatetimeLocal)
    Parse mode: \(context.mode ?? "auto")

    Rules:
    - For expenses set kind=ledger, entryType=expense.
    - For income (keywords: +, 收入, salary, income) set entryType=income.
    - For investments (買/賣/buy/sell, or mode=investment) set kind=investment.
    - merchant = the store/vendor/payee (e.g. 全家便利商店, 星巴克). name = the
      item or short description (e.g. 午餐, 拿鐵). Keep them separate. If only one
      is present, fill the one that fits and leave the other null.
    - accountId: ONLY set when the text explicitly names an account or payment
      method that matches a provided ID. If no account is mentioned, set null.
      Do NOT guess or default to any account.
    - category must exactly match one of the provided category names or be null.
    - subcategory: leave null unless the text clearly states one; never invent it.
    - date: if the input contains a date keyword (昨天, yesterday, 週三, 3/15, etc.),
      resolve it relative to today and output as YYYY-MM-DDTHH:mm (midnight T00:00).

    CRITICAL — only extract what is actually written. Leave fields null rather
    than inventing them. Never invent a store name, and never default an account.

    Examples (assume accounts include 信用卡, 錢包/現金):
    - "拿鐵 120 信用卡" → name=拿鐵, merchant=null (no store named), amount=120,
      accountId=信用卡's id, category=飲食
    - "我在全家 午餐 300" → name=午餐, merchant=全家便利商店, amount=300,
      accountId=null (no account named), category=飲食
    - "計程車 250 現金" → name=計程車, merchant=null, amount=250,
      accountId=錢包's id, category=交通
    """

    let session = LanguageModelSession(instructions: instructions)

    do {
        let response = try await session.respond(to: text, generating: ParsedDraft.self)
        return draftToJson(response.content, nowDatetimeLocal: context.nowDatetimeLocal)
    } catch {
        return nil
    }
}

// ── JSON serialisation ────────────────────────────────────────────────────

@available(iOS 26.0, macOS 26.0, *)
private func draftToJson(_ d: ParsedDraft, nowDatetimeLocal: String) -> String? {
    var dict: [String: Any] = ["kind": d.kind, "source": "on-device"]

    if d.kind == "ledger" {
        var ledger: [String: Any] = [:]
        ledger["entryType"]   = field(d.entryType ?? "expense", conf: d.entryType != nil ? "high" : "low")
        ledger["amount"]      = field(d.amount,     conf: d.amount != nil     ? "high" : "none")
        ledger["accountId"]   = field(d.accountId,  conf: d.accountId != nil  ? "high" : "none")
        ledger["merchant"]    = field(d.merchant,   conf: d.merchant != nil   ? "high" : "none")
        ledger["name"]        = field(d.name,        conf: d.name != nil       ? "high" : "none")
        ledger["category"]    = field(d.category,   conf: d.category != nil   ? "high" : "none")
        ledger["subcategory"] = field(d.subcategory,conf: d.subcategory != nil ? "high" : "none")
        ledger["date"]        = field(d.date,        conf: d.date != nil       ? "high" : "none")
        dict["ledger"] = ledger
    } else if d.kind == "investment" {
        var inv: [String: Any] = [:]
        inv["action"]    = field(d.action ?? "buy", conf: d.action != nil    ? "high" : "low")
        inv["ticker"]    = field(d.ticker,          conf: d.ticker != nil    ? "high" : "none")
        inv["quantity"]  = field(d.quantity,        conf: d.quantity != nil  ? "high" : "none")
        inv["price"]     = field(d.price,           conf: d.price != nil     ? "high" : "none")
        inv["accountId"] = field(d.accountId,       conf: d.accountId != nil ? "high" : "none")
        inv["date"]      = field(d.date,            conf: d.date != nil      ? "high" : "none")
        dict["investment"] = inv
    } else {
        return nil
    }

    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let json = String(data: data, encoding: .utf8) else { return nil }
    return json
}

private func field<T>(_ value: T?, conf: String) -> [String: Any] {
    if let v = value {
        return ["value": v, "confidence": conf]
    }
    return ["value": NSNull(), "confidence": conf]
}

// ── C-compatible entry points (called from Rust via extern "C") ───────────

@_cdecl("northstar_foundation_models_available")
public func foundationModelsAvailable() -> Bool {
    if #available(iOS 26.0, macOS 26.0, *) {
        return SystemLanguageModel.default.availability == .available
    }
    return false
}

/// Parse text using Foundation Models. Returns a JSON string (caller must
/// free with northstar_free_string) or NULL on failure / unavailability.
/// Blocks the calling thread via DispatchSemaphore while the async task runs
/// on a detached Task so it never runs on the main actor.
@_cdecl("northstar_parse_on_device")
public func parseOnDevice(
    textPtr: UnsafePointer<CChar>?,
    contextPtr: UnsafePointer<CChar>?
) -> UnsafeMutablePointer<CChar>? {
    guard #available(iOS 26.0, macOS 26.0, *),
          let textPtr, let contextPtr else { return nil }

    let text = String(cString: textPtr)
    let contextJson = String(cString: contextPtr)

    guard let contextData = contextJson.data(using: .utf8),
          let context = try? JSONDecoder().decode(OnDeviceContext.self, from: contextData)
    else { return nil }

    var resultJson: String? = nil
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        resultJson = await performParse(text: text, context: context)
        semaphore.signal()
    }

    // Hard 5-second timeout — the JS side applies its own 4-second gate,
    // so this is a safety net only.
    let outcome = semaphore.wait(timeout: .now() + 5.0)
    guard outcome == .success, let json = resultJson else { return nil }
    return strdup(json)
}

/// Warm up the model so the first real parse call has minimal cold-start latency.
@_cdecl("northstar_foundation_models_prewarm")
public func prewarmFoundationModels() {
    guard #available(iOS 26.0, macOS 26.0, *),
          SystemLanguageModel.default.availability == .available else { return }
    Task.detached(priority: .background) {
        // Prewarm by creating a session and sending a trivial prompt.
        let session = LanguageModelSession()
        _ = try? await session.respond(to: "hello")
    }
}

/// Free a string returned by northstar_parse_on_device.
@_cdecl("northstar_free_string")
public func freeString(ptr: UnsafeMutablePointer<CChar>?) {
    free(ptr)
}
