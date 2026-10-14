-- REVIEW ONLY / DISPOSABLE TEST PROOF. NEVER DEPLOY THIS FILE.
-- Synthetic principal rows are installed only by the newly owned test cluster.
-- No application bootstrap, real operator, media, provider, or paid request uses them.
-- Apply after baseline + M1 + M2 + admission ledger drafts. Final ROLLBACK is deliberate.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE ROLE storyline_synthetic_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE storyline_admission_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE storyline_checkpoint_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO storyline_synthetic_issuer, storyline_admission_writer, storyline_checkpoint_worker;

-- Function owner must own the paid tables; it is NOLOGIN and never a runtime credential.
ALTER TABLE public."StoryTask" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTaskDispatch" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryPaidConfirmation" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryProviderSubmission" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTaskResult" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTaskEvent" OWNER TO storyline_migration_owner;
ALTER TABLE public."StorySpendingDecision" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryAdmission" OWNER TO storyline_migration_owner;

-- Private fixture mapping: session_user is the authenticated disposable login.
-- This is NOT a real application identity provider. No nonowner DML is granted.
CREATE TABLE public."StorySyntheticAuthority" (
  "loginName" TEXT PRIMARY KEY,
  "roleKind" TEXT NOT NULL CHECK ("roleKind" IN ('ISSUER','ADMISSION')),
  "subjectId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "movieId" TEXT NOT NULL, "studioId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "kind" public."StoryTaskKind" NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL, "sourceContentHash" VARCHAR(64) NOT NULL, "sourceContextHash" VARCHAR(64) NOT NULL,
  "scriptVersionId" TEXT, "scriptHash" VARCHAR(64),
  "recipeHash" VARCHAR(64) NOT NULL, "canonicalRecipe" TEXT NOT NULL,
  "profileHash" VARCHAR(64) NOT NULL, "costPolicyHash" VARCHAR(64) NOT NULL,
  "quoteMaxUsdMicros" BIGINT NOT NULL, "expectedStudioRevision" INTEGER NOT NULL,
  "canCreate" BOOLEAN NOT NULL, "canSpend" BOOLEAN NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorySyntheticAuthority_scope_fkey" FOREIGN KEY ("studioId","projectId","movieId")
    REFERENCES public."StorylineStudio"("id","projectId","movieId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StorySyntheticAuthority_bounds" CHECK (
    octet_length("subjectId") BETWEEN 1 AND 128 AND octet_length("idempotencyKey") BETWEEN 1 AND 128 AND
    public.story_m1_is_hash("recipeHash") AND public.story_m1_is_hash("profileHash") AND
    public.story_m1_is_hash("costPolicyHash") AND octet_length("canonicalRecipe") BETWEEN 1 AND 16384 AND
    "recipeHash" = encode(pg_catalog.sha256(pg_catalog.convert_to('story-task-recipe-v1' || E'\n' || "canonicalRecipe", 'UTF8')), 'hex') AND
    "quoteMaxUsdMicros" BETWEEN 1 AND 100000000 AND "expectedStudioRevision" >= 0 AND
    isfinite("acknowledgedAt")
  )
);
ALTER TABLE public."StorySyntheticAuthority" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StorySyntheticAuthority" FROM PUBLIC, storyline_runtime,
  storyline_verification_issuer, storyline_synthetic_issuer, storyline_admission_writer, storyline_checkpoint_worker;

CREATE FUNCTION public.story_m2_test_issue_decision(ttl_millis integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE a public."StorySyntheticAuthority"%ROWTYPE; issued timestamp(3); decision_id text;
BEGIN
  IF ttl_millis NOT BETWEEN 50 AND 120000 THEN
    RAISE EXCEPTION 'Invalid synthetic decision TTL' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO STRICT a FROM public."StorySyntheticAuthority"
    WHERE "loginName" = session_user AND "roleKind" = 'ISSUER';
  IF NOT a."canCreate" OR NOT a."canSpend" OR a."acknowledgedAt" > clock_timestamp() THEN
    RAISE EXCEPTION 'Synthetic authority denied' USING ERRCODE = '42501';
  END IF;
  IF a."recipeHash" <> encode(pg_catalog.sha256(pg_catalog.convert_to('story-task-recipe-v1' || E'\n' || a."canonicalRecipe", 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Synthetic recipe hash mismatch' USING ERRCODE = '23514';
  END IF;
  -- Project → Movie → Studio. No caller-supplied identity or scope is accepted.
  PERFORM 1 FROM public."Project" WHERE id = a."projectId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic scope stale' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public."Movie" WHERE id = a."movieId" AND "projectId" = a."projectId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic scope stale' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public."StorylineStudio" WHERE id = a."studioId" AND "projectId" = a."projectId"
    AND "movieId" = a."movieId" AND revision = a."expectedStudioRevision"
    AND "currentSnapshotId" = a."sourceSnapshotId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic source stale' USING ERRCODE = '23514'; END IF;
  issued := clock_timestamp();
  decision_id := 'synthetic-decision-' || gen_random_uuid()::text;
  INSERT INTO public."StorySpendingDecision" (
    id,"studioId","projectId","movieId","subjectId","idempotencyKey","authorityProvider","authorityVersion",
    "taskCreateAllowed","spendAllowed","sourceSnapshotId","sourceContentHash","sourceContextHash",
    "scriptVersionId","scriptHash",kind,"recipeHash","canonicalRecipe","profileHash","costPolicyHash",
    "quoteMaxUsdMicros","expectedStudioRevision",generation,"maxSubmissions","nonceHash",
    "acknowledgedAt","issuedAt","expiresAt") VALUES (
    decision_id,a."studioId",a."projectId",a."movieId",a."subjectId",a."idempotencyKey",
    'DISPOSABLE_TEST_ONLY','synthetic-v1',true,true,a."sourceSnapshotId",a."sourceContentHash",a."sourceContextHash",
    a."scriptVersionId",a."scriptHash",a.kind,a."recipeHash",a."canonicalRecipe",a."profileHash",a."costPolicyHash",
    a."quoteMaxUsdMicros",a."expectedStudioRevision",0,1,encode(sha256(gen_random_uuid()::text::bytea),'hex'),
    a."acknowledgedAt",issued,issued + make_interval(secs => ttl_millis::double precision / 1000)
  );
  RETURN decision_id;
END;
$$;
ALTER FUNCTION public.story_m2_test_issue_decision(integer) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m2_test_issue_decision(integer) FROM PUBLIC, storyline_runtime,
  storyline_verification_issuer, storyline_admission_writer, storyline_checkpoint_worker;
GRANT EXECUTE ON FUNCTION public.story_m2_test_issue_decision(integer) TO storyline_synthetic_issuer;

CREATE FUNCTION public.story_m2_test_admit(decision_id text, expected_generation integer, expected_task_revision integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE a public."StorySyntheticAuthority"%ROWTYPE; d public."StorySpendingDecision"%ROWTYPE;
        existing_task public."StoryTask"%ROWTYPE; existing_admission public."StoryAdmission"%ROWTYPE;
        task_id text; confirmation_id text; stamp timestamp(3);
BEGIN
  SELECT * INTO STRICT a FROM public."StorySyntheticAuthority"
    WHERE "loginName" = session_user AND "roleKind" = 'ADMISSION';
  IF NOT a."canCreate" OR NOT a."canSpend" OR a."acknowledgedAt" > clock_timestamp() THEN
    RAISE EXCEPTION 'Synthetic admission denied' USING ERRCODE = '42501';
  END IF;
  IF a."recipeHash" <> encode(pg_catalog.sha256(pg_catalog.convert_to('story-task-recipe-v1' || E'\n' || a."canonicalRecipe", 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Synthetic recipe hash mismatch' USING ERRCODE = '23514';
  END IF;
  -- Scope lock serializes logical task creation for this Studio.
  PERFORM 1 FROM public."Project" WHERE id = a."projectId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public."Movie" WHERE id = a."movieId" AND "projectId" = a."projectId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movie unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public."StorylineStudio" WHERE id = a."studioId" AND "projectId" = a."projectId"
    AND "movieId" = a."movieId" AND revision = a."expectedStudioRevision"
    AND "currentSnapshotId" = a."sourceSnapshotId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Studio or source stale' USING ERRCODE = '23514'; END IF;
  SELECT * INTO existing_task FROM public."StoryTask" WHERE "studioId" = a."studioId" AND kind = a.kind
    AND "recipeHash" = a."recipeHash" FOR UPDATE;
  SELECT * INTO existing_admission FROM public."StoryAdmission" WHERE "subjectId" = a."subjectId"
    AND "projectId" = a."projectId" AND "movieId" = a."movieId" AND "idempotencyKey" = a."idempotencyKey";
  IF existing_admission.id IS NOT NULL THEN
    IF existing_admission."decisionId" <> decision_id OR
       existing_admission."recipeHash" <> a."recipeHash" OR
       existing_admission."canonicalRecipe" <> a."canonicalRecipe" OR
       existing_task.id IS DISTINCT FROM existing_admission."taskId" OR
       existing_task."canonicalRecipe" <> a."canonicalRecipe" THEN
      RAISE EXCEPTION 'Scoped idempotency conflict' USING ERRCODE = '23505';
    END IF;
    RETURN existing_admission."taskId";
  END IF;
  IF existing_task.id IS NOT NULL OR expected_generation <> 0 OR expected_task_revision <> 0 THEN
    RAISE EXCEPTION 'Recipe already admitted or stale task token' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO STRICT d FROM public."StorySpendingDecision" WHERE id = decision_id FOR UPDATE;
  IF (d."studioId",d."projectId",d."movieId",d."subjectId",d."idempotencyKey",d.kind,d."sourceSnapshotId",
      d."sourceContentHash",d."sourceContextHash",d."scriptVersionId",d."scriptHash",d."recipeHash",d."canonicalRecipe",
      d."profileHash",d."costPolicyHash",d."quoteMaxUsdMicros",d."expectedStudioRevision") IS DISTINCT FROM
     (a."studioId",a."projectId",a."movieId",a."subjectId",a."idempotencyKey",a.kind,a."sourceSnapshotId",
      a."sourceContentHash",a."sourceContextHash",a."scriptVersionId",a."scriptHash",a."recipeHash",a."canonicalRecipe",
      a."profileHash",a."costPolicyHash",a."quoteMaxUsdMicros",a."expectedStudioRevision") OR
     d."generation" <> 0 OR d."expiresAt" <= clock_timestamp() OR
     NOT d."taskCreateAllowed" OR NOT d."spendAllowed" OR d."maxSubmissions" <> 1 THEN
    RAISE EXCEPTION 'Decision binding stale or forged' USING ERRCODE = '23514';
  END IF;
  stamp := clock_timestamp();
  task_id := 'synthetic-task-' || d.id;
  confirmation_id := 'synthetic-confirmation-' || d.id;
  INSERT INTO public."StoryTask" (id,"studioId","projectId","movieId","sourceSnapshotId","sourceContentHash",
    "sourceContextHash","scriptVersionId","scriptHash",kind,"recipeHash","canonicalRecipe","profileHash",
    "expectedStudioRevision") VALUES (task_id,d."studioId",d."projectId",d."movieId",d."sourceSnapshotId",
    d."sourceContentHash",d."sourceContextHash",d."scriptVersionId",d."scriptHash",d.kind,d."recipeHash",
    d."canonicalRecipe",d."profileHash",d."expectedStudioRevision");
  INSERT INTO public."StoryPaidConfirmation" (id,"studioId",generation,"recipeHash","profileHash",
    "expectedStudioRevision","quoteMaxUsdMicros","authorityRef",state,"preparedAt","expiresAt")
    VALUES (confirmation_id,d."studioId",0,d."recipeHash",d."profileHash",d."expectedStudioRevision",
      d."quoteMaxUsdMicros",d.id,'PREPARED',stamp,d."expiresAt");
  UPDATE public."StoryPaidConfirmation" SET "taskId" = task_id, state = 'CONSUMED', "consumedAt" = clock_timestamp()
    WHERE id = confirmation_id AND state = 'PREPARED' AND "taskId" IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Confirmation consumption failed' USING ERRCODE = '23514'; END IF;
  INSERT INTO public."StoryTaskDispatch" ("taskId",generation,"nextDispatchAt") VALUES (task_id,0,clock_timestamp());
  INSERT INTO public."StoryTaskEvent" (id,"taskId",generation,sequence,state,"reasonCode")
    VALUES ('synthetic-event-' || d.id,task_id,0,0,'QUEUED','STORY_TASK_ADMITTED');
  INSERT INTO public."StoryAdmission" (id,"decisionId","studioId","projectId","movieId","subjectId",
    "idempotencyKey","taskId","recipeHash","canonicalRecipe",generation,"confirmationId")
    VALUES ('synthetic-admission-' || d.id,d.id,d."studioId",d."projectId",d."movieId",d."subjectId",
      d."idempotencyKey",task_id,d."recipeHash",d."canonicalRecipe",0,confirmation_id);
  RETURN task_id;
END;
$$;
ALTER FUNCTION public.story_m2_test_admit(text,integer,integer) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m2_test_admit(text,integer,integer) FROM PUBLIC, storyline_runtime,
  storyline_verification_issuer, storyline_synthetic_issuer, storyline_checkpoint_worker;
GRANT EXECUTE ON FUNCTION public.story_m2_test_admit(text,integer,integer) TO storyline_admission_writer;

-- No checkpoint function or direct paid-table DML is granted to admission.
ROLLBACK;
