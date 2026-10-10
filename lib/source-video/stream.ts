import "server-only";
import { Readable } from "node:stream";
import type { LocalStorageProvider } from "@/lib/storage/local";
import { StorageError } from "@/lib/storage/local";
import { parseByteRange } from "./range";

type Dependencies = {
  findMovie: (projectId: string, movieId: string) => Promise<{ storageKey: string | null } | null>;
  storage: Pick<LocalStorageProvider, "openFile">;
};
const safeHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};
function failure(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: safeHeaders });
}
const mime: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska" };

// No queue or provider dependency. Relationship checks are trusted-local scoping,
// not user authorization; authentication is required before public deployment.
export async function streamSourceVideo(request: Request, projectId: string, movieId: string, deps: Dependencies) {
  if (![projectId, movieId].every((id) => /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(id))) return failure("MOVIE_NOT_FOUND", "Movie not found in this project.", 404);
  let file: Awaited<ReturnType<LocalStorageProvider["openFile"]>> | undefined;
  try {
    const movie = await deps.findMovie(projectId, movieId);
    if (!movie) return failure("MOVIE_NOT_FOUND", "Movie not found in this project.", 404);
    if (!movie.storageKey) return failure("SOURCE_MEDIA_MISSING", "No uploaded source file is available.", 404);
    const key = /^movies\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|mkv)$/i.exec(movie.storageKey);
    if (!key) return failure("SOURCE_MEDIA_INVALID", "Source media cannot be accessed safely.", 422);
    file = await deps.storage.openFile(movie.storageKey);
    const { size } = await file.stat();
    if (!Number.isSafeInteger(size) || size <= 0) return failure("SOURCE_MEDIA_INVALID", "Source media is empty or invalid.", 422);
    const headers = new Headers({ ...safeHeaders, "Accept-Ranges": "bytes", "Content-Type": mime[key[1].toLowerCase()], "Content-Disposition": "inline" });
    let range;
    try { range = parseByteRange(request.headers.get("range"), size); }
    catch {
      headers.set("Content-Range", `bytes */${size}`);
      headers.set("Content-Length", "0");
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Length", String(range ? range.end - range.start + 1 : size));
    if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
    if (request.signal.aborted) return new Response(null, { status: 499, headers: safeHeaders });
    const stream = file.createReadStream(range ?? {});
    const abort = () => stream.destroy();
    request.signal.addEventListener("abort", abort, { once: true });
    stream.once("close", () => request.signal.removeEventListener("abort", abort));
    // createReadStream owns and closes this descriptor, including cancellation.
    file = undefined;
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    const missing = error instanceof StorageError && error.code === "STORAGE_FILE_MISSING" || !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    if (missing) return failure("SOURCE_MEDIA_MISSING", "The uploaded source file is unavailable.", 404);
    if (error instanceof StorageError && error.code === "INVALID_STORAGE_KEY") return failure("SOURCE_MEDIA_INVALID", "Source media cannot be accessed safely.", 422);
    return failure("SOURCE_MEDIA_UNAVAILABLE", "Source media could not be loaded. Please try again.", 503);
  } finally { await file?.close(); }
}
