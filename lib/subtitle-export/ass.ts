import { normalizeExportSegments, normalizeLineEndings } from "./segments";
import type { SubtitleExportSegment } from "./types";

// Floor both bounds to centiseconds; this monotonic conversion cannot reverse a range.
export function formatAssTimestamp(milliseconds: number): string {
  const centiseconds = Math.floor(milliseconds / 10);
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor(centiseconds / 6_000) % 60;
  const seconds = Math.floor(centiseconds / 100) % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

export function escapeAssText(text: string): string {
  return normalizeLineEndings(text).replace(/[\\{}\n]/g, (character) => {
    // Doubling a backslash does NOT neutralize \N/\n/\h in libass.
    // An invisible WORD JOINER separates a literal slash from command characters.
    if (character === "\\") return "\\\u2060";
    // The empty block prevents VSFilter from interpreting following text as a tag.
    // Libass renders the escaped brace and ignores the empty block.
    if (character === "{") return "\\{{}";
    if (character === "}") return "\\}";
    return "\\N";
  });
}

const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes
Language: my

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,sans-serif,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,80,80,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

export function formatAss(segments: readonly SubtitleExportSegment[]): string {
  return header + normalizeExportSegments(segments).map((segment) =>
    `Dialogue: 0,${formatAssTimestamp(segment.startMs)},${formatAssTimestamp(segment.endMs)},Default,,0,0,0,,${escapeAssText(segment.text)}\n`,
  ).join("");
}
