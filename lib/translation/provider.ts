import type { TranslationRequest, TranslationResult } from "@/lib/translation/types";

export interface TranslationProvider {
  translate(input: TranslationRequest): Promise<TranslationResult>;
}
