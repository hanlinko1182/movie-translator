-- DISPOSABLE PROOF ONLY. NEVER DEPLOY OR LOAD FROM APPLICATION BOOTSTRAP.
-- Requires M1 roles, M2 jobs/ledger and M2-03B gateway, in an owned scratch cluster.
-- pgcrypto is the installed PostgreSQL test extension, not an application dependency.
-- A fresh in-memory test key is installed by the test administrator only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA storyline_test_crypto;
CREATE EXTENSION pgcrypto WITH SCHEMA storyline_test_crypto;
REVOKE ALL ON SCHEMA storyline_test_crypto FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA storyline_test_crypto FROM PUBLIC;
GRANT USAGE ON SCHEMA storyline_test_crypto TO storyline_migration_owner;
GRANT EXECUTE ON FUNCTION storyline_test_crypto.hmac(bytea,bytea,text) TO storyline_migration_owner;
CREATE ROLE storyline_outbox NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE storyline_m2_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO storyline_outbox,storyline_m2_reader;

CREATE TABLE public."StoryTestValidationKey" (
  singleton boolean PRIMARY KEY CHECK (singleton), secret bytea NOT NULL CHECK (octet_length(secret)=32)
);
CREATE TABLE public."StoryTestAdmissionFence" (
  "transactionId" xid8 NOT NULL, "backendPid" integer NOT NULL, "loginName" text NOT NULL,
  "decisionId" text NOT NULL, challenge text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("transactionId","backendPid")
);
CREATE TABLE public."StoryTestAccess" (
  "loginName" text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('OUTBOX','READER')),
  "projectId" text NOT NULL, "movieId" text NOT NULL, "studioId" text NOT NULL,
  FOREIGN KEY ("studioId","projectId","movieId") REFERENCES public."StorylineStudio"(id,"projectId","movieId")
);
ALTER TABLE public."StoryTestValidationKey" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTestAdmissionFence" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTestAccess" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryTestValidationKey",public."StoryTestAdmissionFence",public."StoryTestAccess"
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_checkpoint_worker,storyline_verification_issuer,storyline_outbox,storyline_m2_reader;

-- Read-only source access is needed by the existing M1 reconstruction inside the
-- admission connection's transaction. No source or paid-table DML is granted.
GRANT SELECT ON public."Project",public."Movie",public."Transcript",public."TranscriptSegment",
  public."Translation",public."TranslatedSegment",public."TranslationQcIssue",public."Scene",
  public."CharacterAnalysisRun",public."Character",public."CharacterAlias",public."CharacterEvidence",
  public."CharacterRelationship",public."CharacterRelationshipEvidence",public."Recap",public."RecapSection",
  public."RecapCharacterInsight",public."RecapRelationshipInsight",public."RecapEvidence",
  public."StorylineStudio",public."StorySourceSnapshot",public."StoryScriptVersion"
  TO storyline_admission_writer;

-- Reusable internal lock order. No restricted principal may execute this helper.
CREATE FUNCTION public.story_m2_test_scope_lock(p text,m text,s text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public."Project" WHERE id=p FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid scope' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."Movie" WHERE id=m AND "projectId"=p FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid scope' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StorylineStudio" WHERE id=s AND "projectId"=p AND "movieId"=m FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid scope' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION public.story_m2_test_open_fence(decision_id text,p text,m text,s text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public."StorySyntheticAuthority"%ROWTYPE; d public."StorySpendingDecision"%ROWTYPE; challenge text;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Admission requires fresh statement snapshots' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT a FROM public."StorySyntheticAuthority" WHERE "loginName"=session_user AND "roleKind"='ADMISSION';
  IF (a."projectId",a."movieId",a."studioId") IS DISTINCT FROM (p,m,s) THEN
    RAISE EXCEPTION 'Invalid admission scope' USING ERRCODE='23514'; END IF;
  PERFORM public.story_m2_test_scope_lock(p,m,s);
  PERFORM 1 FROM public."StorylineStudio" WHERE id=s AND revision=a."expectedStudioRevision"
    AND "currentSnapshotId"=a."sourceSnapshotId"
    AND (a."scriptVersionId" IS NULL OR "currentScriptVersionId"=a."scriptVersionId");
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale admission dependencies' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryTask" WHERE "studioId"=s AND kind=a.kind AND "recipeHash"=a."recipeHash" FOR UPDATE;
  SELECT * INTO STRICT d FROM public."StorySpendingDecision" WHERE id=decision_id FOR UPDATE;
  IF (d."subjectId",d."projectId",d."movieId",d."studioId",d."recipeHash",d."canonicalRecipe",d."idempotencyKey") IS DISTINCT FROM
    (a."subjectId",p,m,s,a."recipeHash",a."canonicalRecipe",a."idempotencyKey") OR d."expiresAt"<=clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid admission decision' USING ERRCODE='23514'; END IF;
  -- Private key is never returned. Challenge includes immutable bytes via their
  -- digest and is usable only by this backend/xid/login and this decision.
  challenge := jsonb_build_object('version','disposable-source-fence-v1','nonce',gen_random_uuid()::text,
    'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid(),'login',session_user,
    'decisionId',d.id,'projectId',p,'movieId',m,'studioId',s,'recipeHash',d."recipeHash",'sourceSnapshotId',d."sourceSnapshotId",
    'sourceContentHash',d."sourceContentHash",'sourceContextHash',d."sourceContextHash",
    'scriptHash',d."scriptHash",'studioRevision',d."expectedStudioRevision")::text;
  INSERT INTO public."StoryTestAdmissionFence" ("transactionId","backendPid","loginName","decisionId",challenge)
    VALUES (pg_current_xact_id(),pg_backend_pid(),session_user,d.id,challenge);
  RETURN challenge;
END $$;

CREATE FUNCTION public.story_m2_test_finalize(decision_id text,proof text,g integer,r integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public."StoryTestAdmissionFence"%ROWTYPE; secret_key bytea; task_id text;
BEGIN
  IF g IS DISTINCT FROM 0 OR r IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Invalid first-admission CAS' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT f FROM public."StoryTestAdmissionFence" WHERE "transactionId"=pg_current_xact_id()
    AND "backendPid"=pg_backend_pid() AND "loginName"=session_user AND "decisionId"=decision_id FOR UPDATE;
  SELECT secret INTO STRICT secret_key FROM public."StoryTestValidationKey" WHERE singleton;
  IF proof IS NULL OR proof !~ '^[a-f0-9]{64}$' OR
    decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(convert_to(f.challenge,'UTF8'),secret_key,'sha256') OR
    f."createdAt" < clock_timestamp()-interval '20 seconds' THEN
    RAISE EXCEPTION 'Untrusted transaction validation' USING ERRCODE='42501'; END IF;
  -- Original first-admission function remains owner-only. All earlier locks are
  -- still held. This call rechecks decision, expiry, exact bytes and idempotency.
  task_id := public.story_m2_test_admit(decision_id,g,r);
  DELETE FROM public."StoryTestAdmissionFence" WHERE "transactionId"=f."transactionId" AND "backendPid"=f."backendPid";
  RETURN task_id;
END $$;
REVOKE ALL ON FUNCTION public.story_m2_test_admit(text,integer,integer) FROM storyline_admission_writer;

-- Internal helper: exact scoped task → decision → confirmation → dispatch locks.
CREATE FUNCTION public.story_m2_test_dispatchable(state public."StoryTaskState") RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT state IN ('QUEUED','LEASED') $$;
CREATE FUNCTION public.story_m2_test_dispatch_lock(task_id text,g integer,r integer)
RETURNS public."StoryTask" LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public."StoryTestAccess"%ROWTYPE; t public."StoryTask"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT a FROM public."StoryTestAccess" WHERE "loginName"=session_user AND kind='OUTBOX';
  PERFORM public.story_m2_test_scope_lock(a."projectId",a."movieId",a."studioId");
  SELECT * INTO STRICT t FROM public."StoryTask" WHERE id=task_id AND "projectId"=a."projectId"
    AND "movieId"=a."movieId" AND "studioId"=a."studioId" FOR UPDATE;
  IF t.generation IS DISTINCT FROM g OR t."stateRevision" IS DISTINCT FROM r OR NOT public.story_m2_test_dispatchable(t.state) OR
    t."cancelRequestedAt" IS NOT NULL OR EXISTS (SELECT 1 FROM public."StoryProviderSubmission" WHERE "taskId"=t.id AND generation=g) THEN
    RAISE EXCEPTION 'Stale or unsafe dispatch' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StorySpendingDecision" d JOIN public."StoryAdmission" admitted ON admitted."decisionId"=d.id
    WHERE admitted."taskId"=t.id AND admitted.generation=g FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing admission' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryPaidConfirmation" c JOIN public."StoryAdmission" admitted ON admitted."confirmationId"=c.id
    WHERE admitted."taskId"=t.id AND admitted.generation=g AND c."taskId"=t.id AND c.generation=g AND c.state='CONSUMED'
      AND c."consumedAt" IS NOT NULL AND c."expiresAt">clock_timestamp() FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expired or missing grant' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryTaskDispatch" WHERE "taskId"=t.id AND generation=g FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing dispatch' USING ERRCODE='23514'; END IF;
  RETURN t;
END $$;

CREATE FUNCTION public.story_m2_test_claim_due(p text,m text,s text,batch_size integer)
RETURNS TABLE ("taskId" text,generation integer,"stateRevision" integer,owner text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public."StoryTestAccess"%ROWTYPE; candidate record; t public."StoryTask"%ROWTYPE; token text;
BEGIN
  IF batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT a FROM public."StoryTestAccess" WHERE "loginName"=session_user AND kind='OUTBOX';
  IF (p,m,s) IS DISTINCT FROM (a."projectId",a."movieId",a."studioId") THEN RAISE EXCEPTION 'Invalid outbox scope' USING ERRCODE='23514'; END IF;
  PERFORM public.story_m2_test_scope_lock(p,m,s);
  FOR candidate IN SELECT job.id,job.generation,job."stateRevision" FROM public."StoryTask" job JOIN public."StoryTaskDispatch" d ON d."taskId"=job.id
    WHERE job."studioId"=s AND public.story_m2_test_dispatchable(job.state) AND job."cancelRequestedAt" IS NULL
      AND (job.state='QUEUED' OR job."leaseUntil"<=clock_timestamp()) AND d.generation=job.generation
      AND (d."queueReceipt" IS NULL OR (job.state='LEASED' AND job."leaseUntil"<=clock_timestamp()))
      AND d."nextDispatchAt"<=clock_timestamp() AND d."publishAttempts"<3
      AND (d.owner IS NULL OR d."leaseUntil"<=clock_timestamp() OR (job.state='LEASED' AND job."leaseUntil"<=clock_timestamp()))
      ORDER BY job.id LIMIT batch_size
  LOOP
    t := public.story_m2_test_dispatch_lock(candidate.id,candidate.generation,candidate."stateRevision");
    IF t.state='LEASED' THEN
      UPDATE public."StoryTask" SET state='QUEUED',"stateRevision"="StoryTask"."stateRevision"+1,
        "leaseOwner"=NULL,"leaseUntil"=NULL,"stateChangedAt"=clock_timestamp()
        WHERE id=t.id AND "StoryTask".generation=t.generation AND "StoryTask"."stateRevision"=t."stateRevision";
      IF NOT FOUND THEN RAISE EXCEPTION 'Stale task recovery' USING ERRCODE='23514'; END IF;
      t."stateRevision" := t."stateRevision"+1;
      INSERT INTO public."StoryTaskEvent" (id,"taskId",generation,sequence,state,"reasonCode")
        SELECT gen_random_uuid()::text,t.id,t.generation,coalesce(max(e.sequence)+1,0),'QUEUED','STORY_TASK_PRECHECKPOINT_RECOVERY'
        FROM public."StoryTaskEvent" e WHERE e."taskId"=t.id;
    END IF;
    token := gen_random_uuid()::text;
    UPDATE public."StoryTaskDispatch" SET owner=token,"leaseUntil"=clock_timestamp()+interval '500 milliseconds',
      "publishAttempts"="publishAttempts"+1,"updatedAt"=clock_timestamp()
      WHERE "StoryTaskDispatch"."taskId"=t.id AND "StoryTaskDispatch".generation=t.generation AND "publishAttempts"<3;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch attempts exhausted' USING ERRCODE='23514'; END IF;
    RETURN QUERY SELECT t.id,t.generation,t."stateRevision",token;
  END LOOP;
END $$;

CREATE FUNCTION public.story_m2_test_delivery(task_id text,g integer,r integer,token text,succeeded boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public."StoryTask"%ROWTYPE; d public."StoryTaskDispatch"%ROWTYPE; receipt text;
BEGIN
  t := public.story_m2_test_dispatch_lock(task_id,g,r);
  SELECT * INTO STRICT d FROM public."StoryTaskDispatch" WHERE "taskId"=t.id;
  receipt := 'story-text-'||t.id||'-g'||g::text;
  IF d.owner IS DISTINCT FROM token OR token IS NULL OR t.state<>'QUEUED' THEN
    RAISE EXCEPTION 'Stale dispatch owner' USING ERRCODE='23514'; END IF;
  IF succeeded IS TRUE AND d."queueReceipt"=receipt AND d."leaseUntil" IS NULL THEN RETURN false; END IF;
  IF succeeded IS NULL OR d."leaseUntil" IS NULL OR d."leaseUntil"<=clock_timestamp() THEN
    RAISE EXCEPTION 'Expired dispatch owner' USING ERRCODE='23514'; END IF;
  UPDATE public."StoryTaskDispatch" SET "queueReceipt"=CASE WHEN succeeded THEN receipt ELSE NULL END,
    owner=CASE WHEN succeeded THEN token ELSE NULL END,"leaseUntil"=NULL,
    "nextDispatchAt"=clock_timestamp()+interval '25 milliseconds',"updatedAt"=clock_timestamp()
    WHERE "taskId"=t.id AND generation=g AND owner=token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale dispatch acknowledgement' USING ERRCODE='23514'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.story_m2_test_missing_receipt(task_id text,g integer,r integer,receipt text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public."StoryTask"%ROWTYPE; d public."StoryTaskDispatch"%ROWTYPE;
BEGIN
  t := public.story_m2_test_dispatch_lock(task_id,g,r);
  SELECT * INTO STRICT d FROM public."StoryTaskDispatch" WHERE "taskId"=t.id;
  IF t.state<>'QUEUED' OR receipt IS DISTINCT FROM 'story-text-'||task_id||'-g'||g::text OR
    (d."queueReceipt" IS NOT NULL AND d."queueReceipt"<>receipt) OR d."leaseUntil">clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid missing receipt recovery' USING ERRCODE='23514'; END IF;
  IF d."queueReceipt" IS NULL THEN RETURN false; END IF;
  UPDATE public."StoryTaskDispatch" SET "queueReceipt"=NULL,owner=NULL,"leaseUntil"=NULL,
    "nextDispatchAt"=clock_timestamp(),"updatedAt"=clock_timestamp() WHERE "taskId"=task_id AND generation=g;
  RETURN true;
END $$;

CREATE FUNCTION public.story_m2_test_status(p text,m text,s text,after_id text,batch_size integer)
RETURNS TABLE ("taskId" text,kind text,state text,generation integer,"createdAt" timestamp,"stateChangedAt" timestamp,
  "errorCode" text,"candidateAvailable" boolean,"usageClass" text,"inputTokens" integer,"outputTokens" integer,"costUsdMicros" bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 50 OR octet_length(coalesce(after_id,''))>256 OR NOT EXISTS (
    SELECT 1 FROM public."StoryTestAccess" a WHERE a."loginName"=session_user AND a.kind='READER'
      AND a."projectId"=p AND a."movieId"=m AND a."studioId"=s) THEN
    RAISE EXCEPTION 'Invalid status scope or page' USING ERRCODE='23514'; END IF;
  RETURN QUERY SELECT t.id,t.kind::text,t.state::text,t.generation,t."createdAt",t."stateChangedAt",
    CASE WHEN t."errorCode" IN ('STORY_TASK_INVALID','STORY_TASK_SCOPE_MISMATCH','STORY_TASK_SOURCE_STALE',
      'STORY_TASK_PROFILE_INVALID','STORY_TASK_COST_POLICY_MISSING','STORY_TASK_TRANSITION_INVALID',
      'STORY_TASK_CONFIRMATION_STALE','STORY_TASK_CONFIRMATION_UNTRUSTED','STORY_TASK_RETRY_UNSAFE',
      'STORY_TASK_IDEMPOTENCY_CONFLICT','STORY_TASK_PROVIDER_OUTCOME_UNKNOWN','STORY_TASK_PROVIDER_FAILED',
      'STORY_TASK_INVALID_RESPONSE','STORY_TASK_RESULT_STALE') THEN t."errorCode" ELSE NULL END,
    coalesce(t.state='COMPLETED' AND result.outcome='VALIDATED_CANDIDATE',false),
    CASE WHEN result."inputTokens" IS NOT NULL AND result."outputTokens" IS NOT NULL AND result."reportedUsdMicros" IS NOT NULL THEN 'REPORTED'
      WHEN result."inputTokens" IS NOT NULL OR result."outputTokens" IS NOT NULL OR result."reportedUsdMicros" IS NOT NULL THEN 'PARTIAL' ELSE 'UNKNOWN' END,
    result."inputTokens",result."outputTokens",result."reportedUsdMicros"
    FROM public."StoryTask" t LEFT JOIN public."StoryTaskResult" result ON result."taskId"=t.id AND result.generation=t.generation
    WHERE t."projectId"=p AND t."movieId"=m AND t."studioId"=s AND (after_id IS NULL OR t.id>after_id)
    ORDER BY t.id LIMIT batch_size;
END $$;

-- Every new entry point has a fixed signature and revokes default PUBLIC EXECUTE
-- in this transaction. Helpers are owner-only. No default privileges are changed.
ALTER FUNCTION public.story_m2_test_scope_lock(text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_open_fence(text,text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_finalize(text,text,integer,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_dispatch_lock(text,integer,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_dispatchable(public."StoryTaskState") OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_claim_due(text,text,text,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_delivery(text,integer,integer,text,boolean) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_missing_receipt(text,integer,integer,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_status(text,text,text,text,integer) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m2_test_scope_lock(text,text,text),public.story_m2_test_open_fence(text,text,text,text),
  public.story_m2_test_finalize(text,text,integer,integer),public.story_m2_test_dispatch_lock(text,integer,integer),
  public.story_m2_test_dispatchable(public."StoryTaskState"),
  public.story_m2_test_claim_due(text,text,text,integer),public.story_m2_test_delivery(text,integer,integer,text,boolean),
  public.story_m2_test_missing_receipt(text,integer,integer,text),public.story_m2_test_status(text,text,text,text,integer)
  FROM PUBLIC,storyline_runtime,storyline_synthetic_issuer,storyline_admission_writer,storyline_outbox,storyline_checkpoint_worker,storyline_verification_issuer,storyline_m2_reader;
GRANT EXECUTE ON FUNCTION public.story_m2_test_open_fence(text,text,text,text),public.story_m2_test_finalize(text,text,integer,integer)
  TO storyline_admission_writer;
GRANT EXECUTE ON FUNCTION public.story_m2_test_claim_due(text,text,text,integer),public.story_m2_test_delivery(text,integer,integer,text,boolean),
  public.story_m2_test_missing_receipt(text,integer,integer,text) TO storyline_outbox;
GRANT EXECUTE ON FUNCTION public.story_m2_test_status(text,text,text,text,integer) TO storyline_m2_reader;
ROLLBACK;
