import type { SubtitleFormat } from "./types";

export function subtitleFilename(originalFilename: string | null, title: string, format: SubtitleFormat): string {
  const name = originalFilename?.trim() || title.trim() || "movie";
  let base = (originalFilename?.trim() ? name.replace(/\.[a-z0-9]{1,10}$/i, "") : name)
    .toWellFormed()
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
  // Limit UTF-8 bytes, preserving complete Unicode code points and safe suffixes.
  let limited = "";
  const encoder = new TextEncoder();
  for (const character of base) {
    if (encoder.encode(limited + character).length > 160) break;
    limited += character;
  }
  base = limited.replace(/[.\s-]+$/g, "") || "movie";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `movie-${base}`;
  return `${base}.my.${format}`;
}

export function subtitleContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^a-z0-9._-]/gi, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
