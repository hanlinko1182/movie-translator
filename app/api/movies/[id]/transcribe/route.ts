import { jsonError } from "@/lib/project-api";
import { TranscriptionError } from "@/lib/transcription";
import { transcribeMovieAudio } from "@/lib/transcription/transcribe-movie";

export const runtime = "nodejs";

const DEVELOPMENT_MAX_AUDIO_BYTES = 5_000_000;
const DEVELOPMENT_MAX_TEXT_CHARACTERS = 1_000_000;
const DEVELOPMENT_MAX_SEGMENTS = 5_000;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const result = await transcribeMovieAudio(id, {
      maxInputBytes: DEVELOPMENT_MAX_AUDIO_BYTES,
    });
    if (
      result.text.length > DEVELOPMENT_MAX_TEXT_CHARACTERS ||
      result.segments.length > DEVELOPMENT_MAX_SEGMENTS
    ) {
      throw new TranscriptionError("TRANSCRIPTION_RESPONSE_TOO_LARGE");
    }
    return Response.json({ data: { movieId: id, ...result } });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return jsonError(error.code, error.message, error.status);
    }
    console.error("Transcription request failed.");
    return jsonError("TRANSCRIPTION_UNAVAILABLE", "Unable to transcribe movie audio", 500);
  }
}
