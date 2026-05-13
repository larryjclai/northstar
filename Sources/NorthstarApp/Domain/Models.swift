import Foundation
import SwiftData

enum InvestmentAction: String, Codable, CaseIterable, Identifiable {
    case buy = "Buy"
    case sell = "Sell"
    case cashDividend = "CashDividend"
    case stockDividend = "StockDividend"
    case capitalReduction = "CapitalReduction"

    var id: String { rawValue }
}

@Model
final class Account {
    @Attribute(.unique) var id: UUID
    var name: String
    var currency: String
    var balance: Double
    @Relationship(deleteRule: .cascade, inverse: \InvestmentRecord.linkedAccount)
    var investmentRecords: [InvestmentRecord] = []

    init(id: UUID = UUID(), name: String, currency: String, balance: Double = 0) {
        self.id = id
        self.name = name
        self.currency = currency
        self.balance = balance
    }
}

@Model
final class PortfolioAsset {
    @Attribute(.unique) var ticker: String
    var name: String
    var currency: String
    var totalQuantity: Double
    var averageCost: Double
    @Relationship(deleteRule: .cascade, inverse: \InvestmentRecord.asset)
    var records: [InvestmentRecord] = []

    init(
        ticker: String,
        name: String,
        currency: String,
        totalQuantity: Double = 0,
        averageCost: Double = 0
    ) {
        self.ticker = ticker
        self.name = name
        self.currency = currency
        self.totalQuantity = totalQuantity
        self.averageCost = averageCost
    }
}

@Model
final class InvestmentRecord {
    @Attribute(.unique) var id: UUID
    var date: Date
    var actionRawValue: String
    var price: Double
    var quantity: Double
    var fee: Double
    var note: String
    var isReviewed: Bool = false
    var linkedLedgerTransactionID: UUID?
    var asset: PortfolioAsset?
    var linkedAccount: Account?

    var action: InvestmentAction {
        get { InvestmentAction(rawValue: actionRawValue) ?? .buy }
        set { actionRawValue = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        date: Date,
        action: InvestmentAction,
        price: Double,
        quantity: Double,
        fee: Double = 0,
        note: String = "",
        isReviewed: Bool = false,
        linkedLedgerTransactionID: UUID? = nil,
        asset: PortfolioAsset? = nil,
        linkedAccount: Account? = nil
    ) {
        self.id = id
        self.date = date
        self.actionRawValue = action.rawValue
        self.price = price
        self.quantity = quantity
        self.fee = fee
        self.note = note
        self.isReviewed = isReviewed
        self.linkedLedgerTransactionID = linkedLedgerTransactionID
        self.asset = asset
        self.linkedAccount = linkedAccount
    }
}
