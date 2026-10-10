// Single byte ranges only. Multiple ranges are deliberately rejected rather
// than building multipart bodies for a native video player.
export function parseByteRange(value: string | null, size: number): { start: number; end: number } | null {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new RangeError("Invalid byte range");
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) throw new RangeError("Invalid byte range");
  if (first === null) {
    if (!last) throw new RangeError("Invalid byte range");
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== null && last < first)) throw new RangeError("Invalid byte range");
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}
