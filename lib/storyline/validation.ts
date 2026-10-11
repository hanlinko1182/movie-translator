export type Rule = "INVALID_OBJECT" | "UNKNOWN_FIELDS" | "MISSING_FIELD" | "INVALID_TEXT" | "SIZE_LIMIT"
  | "INVALID_NUMBER" | "INVALID_ENUM" | "INVALID_ARRAY" | "DUPLICATE_ID" | "INVALID_TIMESTAMP"
  | "SCOPE_MISMATCH" | "INVALID_INTERVAL" | "INVALID_ORDER" | "INVALID_ANCHOR" | "EVIDENCE_OWNERSHIP"
  | "CONFIDENCE_INVALID" | "STALE_CONTEXT" | "INFERENCE_INVALID" | "INFERENCE_CYCLE"
  | "UNTRUSTED_RECEIPT" | "RECEIPT_BINDING_INVALID" | "INVALID_SERIALIZATION";
export class StorylineContractError extends Error {
  constructor(readonly rule: Rule, readonly fieldPath: string) {
    super("Storyline contract validation failed"); this.name = "StorylineContractError";
  }
}
export function fail(rule: Rule, path: string): never { throw new StorylineContractError(rule, path); }
export function record(value: unknown, fields: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("INVALID_OBJECT", path);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== "string" || !fields.includes(key))) fail("UNKNOWN_FIELDS", path);
  for (const key of fields) {
    if (!Object.hasOwn(descriptors, key)) fail("MISSING_FIELD", `${path}.${key}`);
    if (!("value" in descriptors[key]) || !descriptors[key].enumerable) fail("INVALID_OBJECT", path);
  }
  return value as Record<string, unknown>;
}
export function validUnicode(value: string, path: string) {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) fail("INVALID_TEXT", path);
  }
}
export function text(value: unknown, max: number, path: string, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim())) fail("INVALID_TEXT", path);
  if (value.length > max * 2) fail("SIZE_LIMIT", path);
  validUnicode(value, path);
  if ([...value].length > max) fail("SIZE_LIMIT", path);
  return value; // Nonempty check only; never trim, normalize or rewrite stored text.
}
export function id(value: unknown, path: string): string {
  const result = text(value, 128, path);
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) fail("INVALID_TEXT", path);
  return result;
}
export function hash(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("INVALID_TEXT", path);
  return value;
}
export function integer(value: unknown, path: string, max = 2_147_483_647): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) fail("INVALID_NUMBER", path);
  return value as number;
}
export function enumeration<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) fail("INVALID_ENUM", path);
  return value as T[number];
}
export function literal<T extends string>(value: unknown, expected: T, path: string): T {
  return enumeration(value, [expected], path);
}
export function array(value: unknown, max: number, path: string, min = 0): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_ARRAY", path);
  if (value.length < min || value.length > max) fail("SIZE_LIMIT", path);
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail("INVALID_ARRAY", path);
  return value;
}
export function unique<T>(rows: readonly T[], key: (row: T) => string | number, path: string) {
  if (new Set(rows.map(key)).size !== rows.length) fail("DUPLICATE_ID", path);
}
export function date(value: unknown, path: string): string {
  const result = text(value, 24, path);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) fail("INVALID_TIMESTAMP", path);
  return result;
}
export function nullable<T>(value: unknown, parse: (v: unknown) => T): T | null { return value === null ? null : parse(value); }
export function interval(start: number, end: number, duration: number, path: string, allowPoint = false) {
  if (start > end || (!allowPoint && start === end) || end > duration) fail("INVALID_INTERVAL", path);
}
export function freeze<T>(value: T): import("./contracts").Immutable<T> {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value as import("./contracts").Immutable<T>;
}
