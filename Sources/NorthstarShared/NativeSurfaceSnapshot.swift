import Foundation

enum NorthstarAppGroup {
    static let identifier = "group.com.northstar.shared"
    static let widgetSnapshotKey = "northstar.widget.snapshot"
}

struct NativeSurfaceSnapshot: Codable, Equatable {
    struct NetWorth: Codable, Equatable {
        let amount: Double
        let currency: String
    }

    struct MonthlyCashFlow: Codable, Equatable {
        let income: Double
        let expense: Double
        let net: Double
        let currency: String
    }

    struct Holding: Codable, Equatable {
        let ticker: String
        let name: String
        let marketValue: Double
        let currency: String
        let returnRate: Double
    }

    let updatedAt: Date
    let netWorth: NetWorth
    let monthlyCashFlow: MonthlyCashFlow
    let featuredHolding: Holding?

    static let placeholder = NativeSurfaceSnapshot(
        updatedAt: .distantPast,
        netWorth: NetWorth(amount: 0, currency: "TWD"),
        monthlyCashFlow: MonthlyCashFlow(income: 0, expense: 0, net: 0, currency: "TWD"),
        featuredHolding: nil
    )

    static func load() -> NativeSurfaceSnapshot {
        let defaults = UserDefaults(suiteName: NorthstarAppGroup.identifier) ?? .standard
        guard let data = defaults.data(forKey: NorthstarAppGroup.widgetSnapshotKey),
              let snapshot = try? JSONDecoder().decode(NativeSurfaceSnapshot.self, from: data) else {
            return .placeholder
        }
        return snapshot
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults.standard.set(data, forKey: NorthstarAppGroup.widgetSnapshotKey)
        UserDefaults(suiteName: NorthstarAppGroup.identifier)?
            .set(data, forKey: NorthstarAppGroup.widgetSnapshotKey)
    }
}
