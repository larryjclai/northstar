import Foundation
import SwiftUI

enum LedgerEntryType: String, CaseIterable, Identifiable {
    case income
    case expense
    case transfer

    var id: String { rawValue }

    var displayTitle: String {
        switch self {
        case .income: return "收入"
        case .expense: return "支出"
        case .transfer: return "轉帳 / 調整"
        }
    }

    var symbolName: String {
        switch self {
        case .income: return "arrow.down.left.circle.fill"
        case .expense: return "arrow.up.right.circle.fill"
        case .transfer: return "arrow.left.arrow.right.circle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .income: return NorthstarTheme.income
        case .expense: return NorthstarTheme.spending
        case .transfer: return NorthstarTheme.netWorth
        }
    }

    /// Apply the sign to a positive magnitude based on this entry's intent.
    func signedAmount(magnitude: Double) -> Double {
        switch self {
        case .income: return abs(magnitude)
        case .expense: return -abs(magnitude)
        case .transfer: return magnitude
        }
    }

    /// Infer entry type from an existing signed amount and category.
    static func infer(amount: Double, category: String) -> LedgerEntryType {
        if LedgerCategoryCatalog.investmentLinkedCategories.contains(category)
            || LedgerCategoryCatalog.adjustmentCategories.contains(category) {
            return .transfer
        }
        return amount >= 0 ? .income : .expense
    }
}

enum LedgerCategoryCatalog {
    static let incomeCategories: [String] = [
        "薪水", "獎金", "利息", "退稅", "業外收入", "其他收入"
    ]

    static let expenseCategories: [String] = [
        "伙食", "交通", "住宿", "購物", "娛樂", "醫療", "教育", "保險", "稅金", "訂閱", "其他支出"
    ]

    static let transferCategories: [String] = [
        "轉帳", "對帳調整", "外幣兌換"
    ]

    /// Categories that are produced automatically by investment linkage — shown read-only.
    static let investmentLinkedCategories: Set<String> = ["投資扣款", "投資入帳", "股利", "配股", "減資"]

    /// Categories used internally for reconciliation.
    static let adjustmentCategories: Set<String> = ["對帳調整"]

    /// Categories that should be excluded from real-income / real-expense totals.
    /// Investment-linked rows are produced by the linkage engine (not user spending) and
    /// transfer / FX-exchange rows are internal money movements between the user's own
    /// accounts — counting either would double-count or fabricate income.
    static let excludedFromCashFlowTotals: Set<String> = investmentLinkedCategories
        .union(["轉帳", "對帳調整", "外幣兌換"])

    static func suggestions(for type: LedgerEntryType) -> [String] {
        switch type {
        case .income: return incomeCategories
        case .expense: return expenseCategories
        case .transfer: return transferCategories
        }
    }

    static let custom = "自訂…"
}
