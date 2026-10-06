import { createHash } from "node:crypto";
export function normalizeName(value: string) { return value.normalize("NFC").trim().replace(/\s+/gu, " "); }
export function hashValue(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function uncertainName(value: string) { return /^(?:speaker(?:\s+[a-z0-9]+)?|unknown(?:\s+(?:speaker|character|person))?(?:\s+[a-z0-9]+)?|narrator|unnamed(?:\s+(?:speaker|character))?(?:\s+[a-z0-9]+)?)$/iu.test(normalizeName(value)); }
