type Token = number | "+" | "-" | "*" | "/" | "(" | ")";

export function evaluateAmountExpression(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    throw new Error("Amount expression is empty.");
  }
  const parser = new Parser(tokens);
  const value = parser.parseExpression();
  if (!parser.isAtEnd()) {
    throw new Error("Unexpected token in amount expression.");
  }
  if (!Number.isFinite(value)) {
    throw new Error("Amount expression did not produce a finite value.");
  }
  return value;
}

export function looksLikeExpression(input: string): boolean {
  return /[+\-*/()]/.test(input.trim());
}

function tokenize(input: string): Token[] {
  const normalized = input.replaceAll(",", ".").replace(/\s+/g, "");
  const tokens: Token[] = [];
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index];
    if ("+-*/()".includes(char)) {
      tokens.push(char as Token);
      index += 1;
      continue;
    }

    if (/\d|\./.test(char)) {
      let end = index + 1;
      while (end < normalized.length && /[\d.]/.test(normalized[end])) {
        end += 1;
      }
      const raw = normalized.slice(index, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${raw}`);
      }
      tokens.push(value);
      index = end;
      continue;
    }

    throw new Error(`Invalid character: ${char}`);
  }

  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  isAtEnd() {
    return this.index >= this.tokens.length;
  }

  parseExpression(): number {
    let value = this.parseTerm();
    while (this.match("+", "-")) {
      const operator = this.previous();
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (this.match("*", "/")) {
      const operator = this.previous();
      const right = this.parseFactor();
      if (operator === "/" && right === 0) {
        throw new Error("Division by zero.");
      }
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private parseFactor(): number {
    if (this.match("+")) return this.parseFactor();
    if (this.match("-")) return -this.parseFactor();

    if (this.match("(")) {
      const value = this.parseExpression();
      this.consume(")", "Expected closing parenthesis.");
      return value;
    }

    const token = this.advance();
    if (typeof token === "number") return token;
    throw new Error("Expected number.");
  }

  private match(...expected: Token[]): boolean {
    if (this.isAtEnd()) return false;
    if (!expected.includes(this.tokens[this.index])) return false;
    this.index += 1;
    return true;
  }

  private consume(expected: Token, message: string) {
    if (this.match(expected)) return;
    throw new Error(message);
  }

  private advance(): Token {
    if (this.isAtEnd()) throw new Error("Unexpected end of expression.");
    this.index += 1;
    return this.previous();
  }

  private previous(): Token {
    return this.tokens[this.index - 1];
  }
}
