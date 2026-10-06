import { log } from "@/lib/logger";
import { jsonError } from "@/lib/project-api";
import { getExportableSubtitle } from "@/lib/subtitle-export/service";
import { formatSrt } from "@/lib/subtitle-export/srt";
import { formatAss } from "@/lib/subtitle-export/ass";
import { subtitleContentDisposition } from "@/lib/subtitle-export/filename";
import { parseExportMode, parseSubtitleFormat, SubtitleExportError } from "@/lib/subtitle-export/types";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => key !== "format" && key !== "mode") || query.getAll("format").length > 1 || query.getAll("mode").length > 1) throw new SubtitleExportError("INVALID_EXPORT_QUERY");
    const format = parseSubtitleFormat(query.get("format") ?? "srt");
    const mode = parseExportMode(query.get("mode") ?? "all");
    const subtitle = await getExportableSubtitle({ movieId: id, mode });
    const content = format === "srt" ? formatSrt(subtitle.segments) : formatAss(subtitle.segments);
    return new Response(content, { headers: {
      "Content-Type": format === "srt" ? "application/x-subrip; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": subtitleContentDisposition(subtitle.filenames[format]),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof SubtitleExportError) return jsonError(error.code, error.message, error.status);
    log("error", "subtitles_route_diagnostic");
    return jsonError("SUBTITLE_EXPORT_FAILED", "Unable to export subtitles; please try again", 500);
  }
}
