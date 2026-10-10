BEGIN;
-- Phase 21.2A columns, recipe constraints and immutable trigger are untouched.
CREATE TABLE "RenderDispatch" (
  "renderJobId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 0,
  "nextDispatchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dispatchedAt" TIMESTAMP(3),
  "dispatchToken" TEXT,
  "dispatchLeaseUntil" TIMESTAMP(3),
  "dispatchFailures" INTEGER NOT NULL DEFAULT 0,
  "activeToken" TEXT,
  "activeLeaseUntil" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "deferredAt" TIMESTAMP(3),
  CONSTRAINT "RenderDispatch_pkey" PRIMARY KEY ("renderJobId"),
  CONSTRAINT "RenderDispatch_counters_check" CHECK ("generation" >= 0 AND "dispatchFailures" >= 0),
  CONSTRAINT "RenderDispatch_owner_check" CHECK (
    ("dispatchToken" IS NULL) = ("dispatchLeaseUntil" IS NULL) AND
    ("activeToken" IS NULL) = ("activeLeaseUntil" IS NULL)
  ),
  CONSTRAINT "RenderDispatch_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RenderDispatch_nextDispatchAt_idx" ON "RenderDispatch"("nextDispatchAt");
CREATE INDEX "RenderDispatch_activeLeaseUntil_idx" ON "RenderDispatch"("activeLeaseUntil");

-- Recover pre-queue foundation records without changing any existing record.
INSERT INTO "RenderDispatch" ("renderJobId", "generation")
SELECT "id", "generation" FROM "RenderJob" WHERE "state" IN ('QUEUED', 'ACTIVE');

-- A transport receipt cannot establish video completion. Disk verification must
-- precede the future RenderOutput insert; the DB guard also requires its receipt.
CREATE FUNCTION guard_render_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" = 'COMPLETED' AND NOT EXISTS (
    SELECT 1 FROM "RenderOutput" WHERE "renderJobId" = NEW."id" AND "verifiedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verified render output required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RenderJob_verified_completion" BEFORE INSERT OR UPDATE ON "RenderJob"
FOR EACH ROW EXECUTE FUNCTION guard_render_completion();
COMMIT;
