import type { TranscriptionInput, TranscriptionResult } from "@/lib/transcription/types";

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
