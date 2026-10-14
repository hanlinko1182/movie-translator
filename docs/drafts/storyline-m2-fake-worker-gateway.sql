-- DISPOSABLE M2-04 ONLY. Never deploy from application bootstrap.
-- Requires owned baseline/M1 + M2-03B/C drafts; no provider checkpoint gateway.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE ROLE storyline_fake_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO storyline_fake_worker;
CREATE TABLE public."StoryTestWorkerAccess" (
  "loginName" text PRIMARY KEY, "projectId" text NOT NULL, "movieId" text NOT NULL, "studioId" text NOT NULL,
  FOREIGN KEY ("studioId","projectId","movieId") REFERENCES public."StorylineStudio"(id,"projectId","movieId")
);
CREATE TABLE public."StoryTestWorkerFence" (
  "transactionId" xid8 NOT NULL, "backendPid" integer NOT NULL, "loginName" text NOT NULL,
  "taskId" text NOT NULL, generation integer NOT NULL, revision integer NOT NULL,
  operation text NOT NULL, owner text, challenge text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY ("transactionId","backendPid")
);
ALTER TABLE public."StoryTestWorkerAccess" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTestWorkerFence" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryTestWorkerAccess",public."StoryTestWorkerFence" FROM PUBLIC,
  storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_checkpoint_worker,
  storyline_verification_issuer,storyline_outbox,storyline_m2_reader,storyline_fake_worker;
GRANT SELECT ON public."Project",public."Movie",public."Transcript",public."TranscriptSegment",
  public."Translation",public."TranslatedSegment",public."TranslationQcIssue",public."Scene",
  public."CharacterAnalysisRun",public."Character",public."CharacterAlias",public."CharacterEvidence",
  public."CharacterRelationship",public."CharacterRelationshipEvidence",public."Recap",public."RecapSection",
  public."RecapCharacterInsight",public."RecapRelationshipInsight",public."RecapEvidence",
  public."StorylineStudio",public."StorySourceSnapshot",public."StoryScriptVersion" TO storyline_fake_worker;

CREATE FUNCTION public.story_m2_test_worker_peek(task_id text,g integer)
RETURNS TABLE ("taskId" text,generation integer,"stateRevision" integer,state text,"leaseUntil" timestamp,
  "projectId" text,"movieId" text,"studioId" text,"sourceSnapshotId" text,"scriptVersionId" text,
  "expectedStudioRevision" integer,"canonicalRecipe" text,"recipeHash" text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  RETURN QUERY SELECT t.id,t.generation,t."stateRevision",t.state::text,t."leaseUntil",t."projectId",t."movieId",t."studioId",
    t."sourceSnapshotId",t."scriptVersionId",t."expectedStudioRevision",t."canonicalRecipe",t."recipeHash"::text
    FROM public."StoryTask" t JOIN public."StoryTestWorkerAccess" a ON a."loginName"=session_user
      AND (t."projectId",t."movieId",t."studioId")=(a."projectId",a."movieId",a."studioId")
    WHERE t.id=task_id AND t.generation=g;
END $$;

-- All mutable operations share Project -> Movie -> Studio -> Task -> Decision
-- -> Confirmation -> Dispatch ordering. No caller-selected operator identity.
CREATE FUNCTION public.story_m2_test_worker_lock(task_id text,g integer,r integer)
RETURNS public."StoryTask" LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public."StoryTestWorkerAccess"%ROWTYPE; t public."StoryTask"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT a FROM public."StoryTestWorkerAccess" WHERE "loginName"=session_user;
  PERFORM public.story_m2_test_scope_lock(a."projectId",a."movieId",a."studioId");
  SELECT * INTO STRICT t FROM public."StoryTask" WHERE id=task_id
    AND ("projectId","movieId","studioId")=(a."projectId",a."movieId",a."studioId") FOR UPDATE;
  IF t.generation IS DISTINCT FROM g OR t."stateRevision" IS DISTINCT FROM r OR t.state NOT IN ('QUEUED','LEASED') OR
    EXISTS (SELECT 1 FROM public."StoryProviderSubmission" WHERE "taskId"=task_id AND generation=g) THEN
    RAISE EXCEPTION 'Unsafe worker generation or revision' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StorySpendingDecision" d JOIN public."StoryAdmission" admitted ON admitted."decisionId"=d.id
    WHERE admitted."taskId"=t.id AND admitted.generation=g FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing admission' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryPaidConfirmation" c JOIN public."StoryAdmission" admitted ON admitted."confirmationId"=c.id
    WHERE admitted."taskId"=t.id AND admitted.generation=g AND c."taskId"=t.id AND c.generation=g
      AND c.state='CONSUMED' AND c."consumedAt" IS NOT NULL FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing consumed grant' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryTaskDispatch" WHERE "taskId"=t.id AND generation=g FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing dispatch' USING ERRCODE='23514'; END IF;
  RETURN t;
END $$;

CREATE FUNCTION public.story_m2_test_worker_open(task_id text,g integer,r integer,token text,op text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public."StoryTask"%ROWTYPE; c public."StoryPaidConfirmation"%ROWTYPE; d public."StoryTaskDispatch"%ROWTYPE; challenge text;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' OR op IS NULL OR op NOT IN ('CLAIM','HEARTBEAT','EXECUTE','RETRY','RECOVER','CANCEL') THEN
    RAISE EXCEPTION 'Invalid worker operation' USING ERRCODE='23514'; END IF;
  t:=public.story_m2_test_worker_lock(task_id,g,r);
  SELECT * INTO STRICT c FROM public."StoryPaidConfirmation" WHERE "taskId"=task_id AND generation=g;
  SELECT * INTO STRICT d FROM public."StoryTaskDispatch" WHERE "taskId"=task_id AND generation=g;
  IF op='CLAIM' AND (t.state<>'QUEUED' OR token IS NOT NULL OR c."expiresAt"<=clock_timestamp() OR
      t."cancelRequestedAt" IS NOT NULL OR d."queueReceipt" IS DISTINCT FROM 'story-text-'||t.id||'-g'||g::text OR d."publishAttempts">3) THEN
    RAISE EXCEPTION 'Worker claim denied' USING ERRCODE='23514'; END IF;
  IF op IN ('HEARTBEAT','EXECUTE','RETRY') AND (t.state<>'LEASED' OR token IS NULL OR t."leaseOwner" IS DISTINCT FROM token OR
      t."leaseUntil" IS NULL OR t."leaseUntil"<=clock_timestamp() OR c."expiresAt"<=clock_timestamp() OR t."cancelRequestedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Worker lease lost' USING ERRCODE='23514'; END IF;
  IF op='RECOVER' AND (t.state<>'LEASED' OR token IS NOT NULL OR t."leaseUntil" IS NULL OR t."leaseUntil">clock_timestamp()) THEN
    RAISE EXCEPTION 'Worker recovery not due' USING ERRCODE='23514'; END IF;
  IF op='CANCEL' AND token IS NOT NULL THEN RAISE EXCEPTION 'Invalid cancellation token' USING ERRCODE='23514'; END IF;
  challenge:=jsonb_build_object('version','disposable-worker-fence-v1','nonce',gen_random_uuid()::text,
    'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid(),'login',session_user,
    'taskId',task_id,'generation',g,'stateRevision',r,'operation',op,'owner',token,
    'projectId',t."projectId",'movieId',t."movieId",'studioId',t."studioId",'recipeHash',t."recipeHash")::text;
  INSERT INTO public."StoryTestWorkerFence" ("transactionId","backendPid","loginName","taskId",generation,revision,operation,owner,challenge)
    VALUES (pg_current_xact_id(),pg_backend_pid(),session_user,task_id,g,r,op,token,challenge);
  RETURN challenge;
END $$;

CREATE FUNCTION public.story_m2_test_worker_finish(task_id text,g integer,r integer,token text,op text,verdict text,proof text)
RETURNS TABLE ("stateRevision" integer,state text,owner text,"reasonCode" text,"errorCode" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public."StoryTestWorkerFence"%ROWTYPE; t public."StoryTask"%ROWTYPE; c public."StoryPaidConfirmation"%ROWTYPE;
  d public."StoryTaskDispatch"%ROWTYPE; secret_key bytea; next_state public."StoryTaskState"; reason text; err text; next_owner text; deadline timestamp;
BEGIN
  SELECT * INTO STRICT f FROM public."StoryTestWorkerFence" WHERE "transactionId"=pg_current_xact_id()
    AND "backendPid"=pg_backend_pid() AND "loginName"=session_user FOR UPDATE;
  SELECT secret INTO STRICT secret_key FROM public."StoryTestValidationKey" WHERE singleton;
  IF (task_id,g,r,op,token) IS DISTINCT FROM (f."taskId",f.generation,f.revision,f.operation,f.owner) OR
    verdict IS NULL OR verdict NOT IN ('CURRENT','SOURCE_STALE') OR proof IS NULL OR proof !~ '^[a-f0-9]{64}$' OR
    decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(convert_to(f.challenge||E'\n'||verdict,'UTF8'),secret_key,'sha256') OR
    f."createdAt"<clock_timestamp()-interval '20 seconds' THEN
    RAISE EXCEPTION 'Untrusted worker validation' USING ERRCODE='42501'; END IF;
  t:=public.story_m2_test_worker_lock(task_id,g,r);
  SELECT * INTO STRICT c FROM public."StoryPaidConfirmation" WHERE "taskId"=task_id AND generation=g;
  SELECT * INTO STRICT d FROM public."StoryTaskDispatch" WHERE "taskId"=task_id AND generation=g;
  IF op='CLAIM' THEN
    IF verdict<>'CURRENT' OR t.state<>'QUEUED' OR t."cancelRequestedAt" IS NOT NULL OR c."expiresAt"<=clock_timestamp() OR
      d."queueReceipt" IS DISTINCT FROM 'story-text-'||t.id||'-g'||g::text OR d."publishAttempts">3 THEN
      RAISE EXCEPTION 'Worker claim no longer valid' USING ERRCODE='23514'; END IF;
    next_state:='LEASED'; next_owner:=gen_random_uuid()::text; deadline:=least(c."expiresAt",clock_timestamp()+interval '500 milliseconds');
    reason:='STORY_TASK_FAKE_WORKER_CLAIMED';
  ELSIF op='CANCEL' THEN
    next_state:='CANCELLED'; reason:='STORY_TASK_CANCELLED_BEFORE_CHECKPOINT';
  ELSE
    IF t.state<>'LEASED' OR (op='RECOVER' AND (t."leaseUntil" IS NULL OR t."leaseUntil">clock_timestamp())) OR
      (op<>'RECOVER' AND (token IS NULL OR t."leaseOwner" IS DISTINCT FROM token OR t."leaseUntil" IS NULL OR t."leaseUntil"<=clock_timestamp())) THEN
      RAISE EXCEPTION 'Stale worker owner' USING ERRCODE='23514'; END IF;
    IF t."cancelRequestedAt" IS NOT NULL THEN next_state:='CANCELLED'; reason:='STORY_TASK_CANCELLED_BEFORE_CHECKPOINT';
    ELSIF c."expiresAt"<=clock_timestamp() THEN
      next_state:='FAILED'; err:='STORY_TASK_CONFIRMATION_STALE'; reason:=err;
    ELSIF verdict='SOURCE_STALE' THEN
      next_state:='FAILED'; err:='STORY_TASK_SOURCE_STALE'; reason:=err;
    ELSIF op='HEARTBEAT' THEN
      next_state:='LEASED'; next_owner:=t."leaseOwner"; deadline:=least(c."expiresAt",clock_timestamp()+interval '500 milliseconds');
      reason:='STORY_TASK_FAKE_WORKER_HEARTBEAT';
    ELSIF op IN ('RETRY','RECOVER') THEN
      IF d."preSubmitAttempts">=3 OR d."publishAttempts">=3 THEN
        next_state:='FAILED'; err:='STORY_TASK_RETRY_UNSAFE'; reason:='STORY_TASK_PRECHECKPOINT_EXHAUSTED';
      ELSE next_state:='QUEUED'; reason:='STORY_TASK_PRECHECKPOINT_RECOVERY'; END IF;
    ELSIF op='EXECUTE' THEN
      -- No COMPLETED transition or fake StoryTaskResult without a checkpoint.
      next_state:='FAILED'; err:='STORY_TASK_RETRY_UNSAFE'; reason:='STORY_TASK_FAKE_CHECKPOINT_UNAVAILABLE';
    ELSE RAISE EXCEPTION 'Invalid worker operation' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE public."StoryTask" SET state=next_state,"stateRevision"="StoryTask"."stateRevision"+1,"leaseOwner"=next_owner,"leaseUntil"=deadline,
    "cancelRequestedAt"=CASE WHEN next_state='CANCELLED' THEN coalesce(t."cancelRequestedAt",clock_timestamp()) ELSE t."cancelRequestedAt" END,
    "stateChangedAt"=clock_timestamp(),"errorCode"=err WHERE id=task_id AND "StoryTask".generation=g AND "StoryTask"."stateRevision"=r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale worker CAS' USING ERRCODE='23514'; END IF;
  IF next_state='QUEUED' THEN UPDATE public."StoryTaskDispatch" SET "nextDispatchAt"=clock_timestamp(),"updatedAt"=clock_timestamp()
    WHERE "taskId"=task_id AND generation=g; END IF;
  INSERT INTO public."StoryTaskEvent" (id,"taskId",generation,sequence,state,"reasonCode")
    SELECT gen_random_uuid()::text,task_id,g,coalesce(max(e.sequence)+1,0),next_state,reason FROM public."StoryTaskEvent" e WHERE e."taskId"=task_id;
  DELETE FROM public."StoryTestWorkerFence" WHERE "transactionId"=f."transactionId" AND "backendPid"=f."backendPid";
  RETURN QUERY SELECT r+1,next_state::text,next_owner,reason,err;
END $$;

ALTER FUNCTION public.story_m2_test_worker_peek(text,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_worker_lock(text,integer,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_worker_open(text,integer,integer,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_worker_finish(text,integer,integer,text,text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m2_test_worker_peek(text,integer),public.story_m2_test_worker_lock(text,integer,integer),
  public.story_m2_test_worker_open(text,integer,integer,text,text),public.story_m2_test_worker_finish(text,integer,integer,text,text,text,text)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_checkpoint_worker,
    storyline_verification_issuer,storyline_outbox,storyline_m2_reader,storyline_fake_worker;
GRANT EXECUTE ON FUNCTION public.story_m2_test_worker_peek(text,integer),public.story_m2_test_worker_open(text,integer,integer,text,text),
  public.story_m2_test_worker_finish(text,integer,integer,text,text,text,text) TO storyline_fake_worker;
ROLLBACK;
