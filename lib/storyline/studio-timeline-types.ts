/** Erased DTO/service bridge. No runtime authority, transport or loader. */
export type { RecapTimelineInput, RecapTimelinePlan, TimelineSegment } from "./timeline/contracts";
export type { TimelineStoreScope, TimelineRecordView, TimelineHistoryView, SaveTimelineProposal } from "./timeline-persistence/contracts";
export type { DisposableTimelineRepository } from "./timeline-persistence/service";
export type { HighlightSourceReference } from "./highlights/contracts";
