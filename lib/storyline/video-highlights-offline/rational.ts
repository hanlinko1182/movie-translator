import "server-only";
import { deny, fields, integer, OFFLINE_VIDEO as V, type ExactSeconds } from "./contracts";

const zero = BigInt(0), one = BigInt(1), max = BigInt(Number.MAX_SAFE_INTEGER);
function gcd(a: bigint, b: bigint): bigint { if (a < zero) a = -a; while (b !== zero) { const r = a % b; a = b; b = r; } return a; }
/** Internal arithmetic accepts signed differences; every result is reduced before safe-number conversion. */
function result(n: bigint, d: bigint): ExactSeconds {
  if (d <= zero) deny("INVALID_RATIONAL");
  const g = gcd(n, d); n /= g; d /= g;
  if (n < -max || n > max || d > max) deny("RATIONAL_OVERFLOW");
  return Object.freeze({ numerator: Number(n), denominator: Number(d) });
}
export const ZERO_SECONDS: ExactSeconds = Object.freeze({ numerator: 0, denominator: 1 });
/** Canonical input only. No negative, floating, unsafe, unreduced or negative-zero terms. */
export function parseSeconds(value: unknown, maxTerm: number = V.maxInputTerm): ExactSeconds {
  const r = fields(value, ["numerator", "denominator"]), n = integer(r.numerator, 0, maxTerm), d = integer(r.denominator, 1, maxTerm);
  if (gcd(BigInt(n), BigInt(d)) !== one) deny("NONCANONICAL_RATIONAL");
  return Object.freeze({ numerator: n, denominator: d });
}
export function compare(a: ExactSeconds, b: ExactSeconds): -1 | 0 | 1 {
  const delta = BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator);
  return delta < zero ? -1 : delta > zero ? 1 : 0;
}
export function add(a: ExactSeconds, b: ExactSeconds): ExactSeconds {
  return result(BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
}
export function subtract(a: ExactSeconds, b: ExactSeconds): ExactSeconds {
  return result(BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
}
