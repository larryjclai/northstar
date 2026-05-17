import Foundation

/// Evaluates simple arithmetic expressions typed into amount fields, e.g. `120+85+30`.
///
/// Supports `+ - * /`, parentheses, unary minus, and decimal numbers. The grammar is
/// strict enough that malformed input returns `nil` rather than throwing — no `NSExpression`
/// involvement, so we never have to worry about ObjC exceptions on bad input.
enum AmountExpression {
    private static let maxLength = 64

    static func evaluate(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false, trimmed.count <= maxLength else { return nil }

        // Fast path: a plain decimal literal.
        if let value = Double(trimmed), value.isFinite { return value }

        // Normalize comma as decimal separator (common in zh / Eurozone numeric input).
        let normalized = trimmed.replacingOccurrences(of: ",", with: ".")
        var parser = Parser(input: Array(normalized))
        guard let result = parser.parseExpression(),
              parser.isAtEnd(),
              result.isFinite else { return nil }
        return result
    }

    private struct Parser {
        let input: [Character]
        var index: Int = 0

        mutating func isAtEnd() -> Bool {
            skipWhitespace()
            return index >= input.count
        }

        mutating func skipWhitespace() {
            while index < input.count, input[index].isWhitespace {
                index += 1
            }
        }

        mutating func peek() -> Character? {
            skipWhitespace()
            return index < input.count ? input[index] : nil
        }

        mutating func consume() -> Character? {
            skipWhitespace()
            guard index < input.count else { return nil }
            defer { index += 1 }
            return input[index]
        }

        /// expression := term (('+' | '-') term)*
        mutating func parseExpression() -> Double? {
            guard var lhs = parseTerm() else { return nil }
            while let op = peek(), op == "+" || op == "-" {
                _ = consume()
                guard let rhs = parseTerm() else { return nil }
                lhs = (op == "+") ? lhs + rhs : lhs - rhs
            }
            return lhs
        }

        /// term := factor (('*' | '/') factor)*
        mutating func parseTerm() -> Double? {
            guard var lhs = parseFactor() else { return nil }
            while let op = peek(), op == "*" || op == "/" {
                _ = consume()
                guard let rhs = parseFactor() else { return nil }
                if op == "/" {
                    guard rhs != 0 else { return nil }
                    lhs /= rhs
                } else {
                    lhs *= rhs
                }
            }
            return lhs
        }

        /// factor := '-' factor | '(' expression ')' | number
        mutating func parseFactor() -> Double? {
            guard let next = peek() else { return nil }
            if next == "-" {
                _ = consume()
                guard let inner = parseFactor() else { return nil }
                return -inner
            }
            if next == "+" {
                _ = consume()
                return parseFactor()
            }
            if next == "(" {
                _ = consume()
                guard let inner = parseExpression() else { return nil }
                guard peek() == ")" else { return nil }
                _ = consume()
                return inner
            }
            return parseNumber()
        }

        /// number := digit+ ('.' digit+)?
        mutating func parseNumber() -> Double? {
            skipWhitespace()
            let start = index
            var sawDigit = false
            while index < input.count, input[index].isASCIIDigit {
                index += 1
                sawDigit = true
            }
            if index < input.count, input[index] == "." {
                index += 1
                let beforeFraction = index
                while index < input.count, input[index].isASCIIDigit {
                    index += 1
                    sawDigit = true
                }
                if index == beforeFraction { return nil } // dangling decimal point
            }
            guard sawDigit, start < index else { return nil }
            return Double(String(input[start..<index]))
        }
    }
}

private extension Character {
    var isASCIIDigit: Bool {
        guard let scalar = unicodeScalars.first, unicodeScalars.count == 1 else { return false }
        return scalar.value >= 0x30 && scalar.value <= 0x39
    }
}
