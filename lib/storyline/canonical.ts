import "server-only";
import { createHash } from "node:crypto";
import { fail, validUnicode } from "./validation";

// JSON only: no getters, toJSON, Dates, cycles, holes, bigint or lossy surrogate replacement.
export function canonicalJson(value: unknown, maxBytes = 16 * 1024 * 1024): string {
  const ancestors = new Set<object>(); let nodes = 0; let bytes = 0;
  function visit(value: unknown, depth: number): string {
    if (depth > 32 || ++nodes > 500000) fail("SIZE_LIMIT", "serialization");
    if (value === null) return "null";
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail("INVALID_SERIALIZATION", "serialization");
      return String(value);
    }
    if (typeof value === "string") {
      if (value.length > maxBytes) fail("SIZE_LIMIT", "serialization");
      validUnicode(value, "serialization");
      bytes += Buffer.byteLength(value, "utf8");
      if (bytes > maxBytes) fail("SIZE_LIMIT", "serialization");
      return JSON.stringify(value);
    }
    if (!value || typeof value !== "object" || ancestors.has(value)) fail("INVALID_SERIALIZATION", "serialization");
    ancestors.add(value);
    let result: string;
    if (Array.isArray(value)) {
      if (value.length > 500000 - nodes) fail("SIZE_LIMIT", "serialization");
      if (Reflect.ownKeys(value).length !== value.length + 1) fail("INVALID_SERIALIZATION", "serialization");
      result = `[${Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!descriptor || !("value" in descriptor)) fail("INVALID_SERIALIZATION", "serialization");
        return visit(descriptor.value, depth + 1);
      }).join(",")}]`;
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("INVALID_SERIALIZATION", "serialization");
      const keys = Object.keys(value).sort();
      if (Reflect.ownKeys(value).length !== keys.length) fail("INVALID_SERIALIZATION", "serialization");
      result = `{${keys.map(key => {
        if (key.length > maxBytes) fail("SIZE_LIMIT", "serialization");
        validUnicode(key, "serialization");
        bytes += Buffer.byteLength(key, "utf8");
        if (bytes > maxBytes) fail("SIZE_LIMIT", "serialization");
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!("value" in descriptor)) fail("INVALID_SERIALIZATION", "serialization");
        return `${JSON.stringify(key)}:${visit(descriptor.value, depth + 1)}`;
      }).join(",")}}`;
    }
    ancestors.delete(value);
    if (Buffer.byteLength(result, "utf8") > maxBytes) fail("SIZE_LIMIT", "serialization");
    return result;
  }
  const result = visit(value, 0);
  if (Buffer.byteLength(result, "utf8") > maxBytes) fail("SIZE_LIMIT", "serialization");
  return result;
}
export function contractHash(domain: string, value: unknown): string {
  return createHash("sha256").update(`${domain}\n`, "utf8").update(canonicalJson(value), "utf8").digest("hex");
}
