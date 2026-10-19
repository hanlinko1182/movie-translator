/** Type-only DTO bridge. No executable exports, loader, authority or transport.
 * Preserve exact M6-02 service signatures without a browser runtime import. */
export type { HighlightStoreScope, HighlightRecordView, HighlightHistoryView, SaveHighlightProposal } from "./highlights-persistence/contracts";
export type { DisposableHighlightRepository } from "./highlights-persistence/service";
export type { HighlightPlan, HighlightSourceReference, HighlightPolicy, HighlightAudioReference } from "./highlights/contracts";
