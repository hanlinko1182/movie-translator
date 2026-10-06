import type { RecapInput, RecapBatchResult } from "./types";
export interface RecapProvider { generate(input: RecapInput): Promise<RecapBatchResult> }
