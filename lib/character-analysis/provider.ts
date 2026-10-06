import type { AnalysisBatch, BatchResult } from "./types";
export interface CharacterAnalysisProvider { analyze(input: AnalysisBatch): Promise<BatchResult> }
