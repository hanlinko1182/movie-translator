-- M2-05 DISPOSABLE ONLY. Requires M2-03/M2-04 drafts. Never a live migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE public."StoryTestCheckpointAccess" (
  "loginName" text PRIMARY KEY,"projectId" text NOT NULL,"movieId" text NOT NULL,"studioId" text NOT NULL,
  FOREIGN KEY ("studioId","projectId","movieId") REFERENCES public."StorylineStudio"(id,"projectId","movieId")
);
CREATE TABLE public."StoryTestCheckpointFence" (
  xid xid8 NOT NULL,pid integer NOT NULL,login text NOT NULL,challenge text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(xid,pid)
);
ALTER TABLE public."StoryTestCheckpointAccess" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTestCheckpointFence" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryTestCheckpointAccess",public."StoryTestCheckpointFence" FROM PUBLIC,
  storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_checkpoint_worker,
  storyline_verification_issuer,storyline_outbox,storyline_m2_reader,storyline_fake_worker;
GRANT USAGE ON SCHEMA public TO storyline_checkpoint_worker;
GRANT SELECT ON public."Project",public."Movie",public."Transcript",public."TranscriptSegment",
  public."Translation",public."TranslatedSegment",public."TranslationQcIssue",public."Scene",
  public."CharacterAnalysisRun",public."Character",public."CharacterAlias",public."CharacterEvidence",
  public."CharacterRelationship",public."CharacterRelationshipEvidence",public."Recap",public."RecapSection",
  public."RecapCharacterInsight",public."RecapRelationshipInsight",public."RecapEvidence",
  public."StorylineStudio",public."StorySourceSnapshot",public."StoryScriptVersion" TO storyline_checkpoint_worker;

CREATE FUNCTION public.story_m2_test_checkpoint_peek(task_id text,g integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('taskId',t.id,'generation',t.generation,'stateRevision',t."stateRevision",'state',t.state,
    'projectId',t."projectId",'movieId',t."movieId",'studioId',t."studioId",'sourceSnapshotId',t."sourceSnapshotId",
    'scriptVersionId',t."scriptVersionId",'expectedStudioRevision',t."expectedStudioRevision",'canonicalRecipe',t."canonicalRecipe",'recipeHash',t."recipeHash",
    'submissionId',s.id,'requestHash',s."requestHash",'owner',s.owner,'submissionState',s.state)
    INTO result FROM public."StoryTask" t JOIN public."StoryTestCheckpointAccess" a ON a."loginName"=session_user
      AND (t."projectId",t."movieId",t."studioId")=(a."projectId",a."movieId",a."studioId")
    LEFT JOIN public."StoryProviderSubmission" s ON s."taskId"=t.id AND s.generation=t.generation
    WHERE t.id=task_id AND t.generation=g;
  IF result IS NULL THEN RAISE EXCEPTION 'Invalid checkpoint scope' USING ERRCODE='23514'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.story_m2_test_checkpoint_lock(task_id text,g integer,r integer) RETURNS public."StoryTask"
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE access_row public."StoryTestCheckpointAccess"%ROWTYPE; t public."StoryTask"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT access_row FROM public."StoryTestCheckpointAccess" WHERE "loginName"=session_user;
  PERFORM public.story_m2_test_scope_lock(access_row."projectId",access_row."movieId",access_row."studioId");
  SELECT * INTO STRICT t FROM public."StoryTask" WHERE id=task_id
    AND ("projectId","movieId","studioId")=(access_row."projectId",access_row."movieId",access_row."studioId") FOR UPDATE;
  IF t.generation IS DISTINCT FROM g OR t."stateRevision" IS DISTINCT FROM r THEN
    RAISE EXCEPTION 'Stale checkpoint CAS' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StorySpendingDecision" decision JOIN public."StoryAdmission" admitted ON admitted."decisionId"=decision.id
    WHERE admitted."taskId"=task_id AND admitted.generation=g FOR UPDATE OF decision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing admitted authority' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryPaidConfirmation" c JOIN public."StoryAdmission" admitted ON admitted."confirmationId"=c.id
    WHERE admitted."taskId"=task_id AND admitted.generation=g AND c."taskId"=task_id AND c.generation=g
      AND c.state='CONSUMED' AND c."consumedAt" IS NOT NULL FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing consumed confirmation' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public."StoryTaskDispatch" WHERE "taskId"=task_id AND generation=g FOR UPDATE;
  PERFORM 1 FROM public."StoryProviderSubmission" WHERE "taskId"=task_id AND generation=g FOR UPDATE;
  RETURN t;
END $$;

CREATE FUNCTION public.story_m2_test_checkpoint_open(task_id text,g integer,r integer,token text,op text,request_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public."StoryTask"%ROWTYPE; s public."StoryProviderSubmission"%ROWTYPE; c public."StoryPaidConfirmation"%ROWTYPE; challenge text;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' OR op IS NULL OR op NOT IN ('CHECKPOINT','PRE_SEND','RESULT','UNKNOWN','RECOVER','CANCEL') OR
    public.story_m1_is_hash(request_hash) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid checkpoint operation' USING ERRCODE='23514'; END IF;
  t:=public.story_m2_test_checkpoint_lock(task_id,g,r);
  SELECT * INTO c FROM public."StoryPaidConfirmation" WHERE "taskId"=task_id AND generation=g;
  SELECT * INTO s FROM public."StoryProviderSubmission" WHERE "taskId"=task_id AND generation=g;
  IF op='CHECKPOINT' THEN
    IF t.state<>'LEASED' OR token IS NULL OR t."leaseOwner" IS DISTINCT FROM token OR t."leaseUntil" IS NULL OR
      t."leaseUntil"<=clock_timestamp() OR t."cancelRequestedAt" IS NOT NULL OR c."expiresAt"<=clock_timestamp() OR s.id IS NOT NULL OR
      (t."canonicalRecipe"::json->'profile'->>'id')<>'synthetic-text' OR (t."canonicalRecipe"::json->'profile'->>'version')<>'v1' THEN
      RAISE EXCEPTION 'Checkpoint lease or grant denied' USING ERRCODE='23514'; END IF;
  ELSE
    IF s.id IS NULL OR s."requestHash" IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'Missing original checkpoint' USING ERRCODE='23514'; END IF;
    IF op IN ('CANCEL','RECOVER') THEN
      IF token IS NOT NULL OR t.state NOT IN ('SUBMITTED','UNKNOWN') THEN RAISE EXCEPTION 'Invalid checkpoint control' USING ERRCODE='23514'; END IF;
      IF op='RECOVER' AND (t.state<>'SUBMITTED' OR t."leaseUntil" IS NULL OR t."leaseUntil">clock_timestamp()) THEN
        RAISE EXCEPTION 'Checkpoint recovery not due' USING ERRCODE='23514'; END IF;
    ELSE
      IF token IS NULL OR s.owner IS DISTINCT FROM token OR t."leaseOwner" IS DISTINCT FROM token THEN
        RAISE EXCEPTION 'Checkpoint owner lost' USING ERRCODE='23514'; END IF;
      IF op='RESULT' AND s.state='RESOLVED' THEN NULL;
      ELSIF t.state<>'SUBMITTED' OR s.state<>'SUBMITTED' THEN RAISE EXCEPTION 'No automatic UNKNOWN resolution' USING ERRCODE='23514'; END IF;
      IF op IN ('PRE_SEND','RESULT') AND s.state<>'RESOLVED' AND (t."leaseUntil" IS NULL OR t."leaseUntil"<=clock_timestamp()) THEN
        RAISE EXCEPTION 'Checkpoint lease expired' USING ERRCODE='23514'; END IF;
      IF op='PRE_SEND' AND (t."cancelRequestedAt" IS NOT NULL OR c."expiresAt"<=clock_timestamp()) THEN
        RAISE EXCEPTION 'Send cancelled or grant expired' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  challenge:=jsonb_build_object('version','disposable-checkpoint-fence-v1','nonce',gen_random_uuid()::text,
    'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid(),'login',session_user,'taskId',task_id,
    'generation',g,'stateRevision',r,'owner',token,'operation',op,'requestHash',request_hash,
    'projectId',t."projectId",'movieId',t."movieId",'studioId',t."studioId",'recipeHash',t."recipeHash")::text;
  INSERT INTO public."StoryTestCheckpointFence"(xid,pid,login,challenge) VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,challenge);
  RETURN challenge;
END $$;

CREATE FUNCTION public.story_m2_test_checkpoint_finish(task_id text,g integer,r integer,token text,op text,request_hash text,verdict text,data text,proof text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public."StoryTestCheckpointFence"%ROWTYPE; t public."StoryTask"%ROWTYPE; s public."StoryProviderSubmission"%ROWTYPE;
  c public."StoryPaidConfirmation"%ROWTYPE; existing public."StoryTaskResult"%ROWTYPE; secret_key bytea; binding jsonb;
  body jsonb; sub_id text; result_hash text; next_state public."StoryTaskState"; err text; reason text;
BEGIN
  SELECT * INTO STRICT f FROM public."StoryTestCheckpointFence" WHERE xid=pg_current_xact_id() AND pid=pg_backend_pid() AND login=session_user FOR UPDATE;
  SELECT secret INTO STRICT secret_key FROM public."StoryTestValidationKey" WHERE singleton;
  binding:=f.challenge::jsonb;
  IF (binding->>'taskId',(binding->>'generation')::integer,(binding->>'stateRevision')::integer,binding->>'owner',binding->>'operation',binding->>'requestHash')
    IS DISTINCT FROM (task_id,g,r,token,op,request_hash) OR verdict IS NULL OR verdict NOT IN ('CURRENT','SOURCE_STALE') OR data IS NULL OR
    octet_length(data)>100000 OR proof IS NULL OR proof !~ '^[a-f0-9]{64}$' OR f."createdAt"<clock_timestamp()-interval '20 seconds' OR
    decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(convert_to(f.challenge||E'\n'||verdict||E'\n'||encode(sha256(convert_to(data,'UTF8')),'hex'),'UTF8'),secret_key,'sha256') THEN
    RAISE EXCEPTION 'Untrusted checkpoint validation' USING ERRCODE='42501'; END IF;
  -- Recheck time-dependent conditions at finalization, not only when opening.
  t:=public.story_m2_test_checkpoint_lock(task_id,g,r);
  SELECT * INTO c FROM public."StoryPaidConfirmation" WHERE "taskId"=task_id AND generation=g;
  SELECT * INTO s FROM public."StoryProviderSubmission" WHERE "taskId"=task_id AND generation=g;
  IF op='CHECKPOINT' THEN
    IF verdict<>'CURRENT' OR t.state<>'LEASED' OR t."leaseOwner" IS DISTINCT FROM token OR token IS NULL OR
      t."leaseUntil" IS NULL OR t."leaseUntil"<=clock_timestamp() OR c."expiresAt"<=clock_timestamp() OR
      t."cancelRequestedAt" IS NOT NULL OR s.id IS NOT NULL OR
      request_hash<>encode(sha256(convert_to('story-fake-request-v1'||E'\n'||data,'UTF8')),'hex') THEN
      RAISE EXCEPTION 'Checkpoint no longer eligible' USING ERRCODE='23514'; END IF;
    body:=data::jsonb;
    IF (body->>'schemaVersion'='story-fake-request-v1' AND body->'synthetic'='true'::jsonb AND body->>'taskId'=task_id AND
      body->>'generation'=g::text AND body->>'recipeHash'=t."recipeHash" AND (SELECT count(*) FROM jsonb_object_keys(body))=5) IS NOT TRUE THEN
      RAISE EXCEPTION 'Invalid synthetic request' USING ERRCODE='23514'; END IF;
    sub_id:='synthetic-submission-'||gen_random_uuid()::text;
    INSERT INTO public."StoryProviderSubmission"(id,"taskId",generation,"confirmationId","requestHash",owner)
      VALUES(sub_id,task_id,g,c.id,request_hash,token);
    -- Existing unique partial index atomically owns the global unresolved slot.
    UPDATE public."StoryTask" SET state='SUBMITTED',"stateRevision"="stateRevision"+1,
      "leaseUntil"=clock_timestamp()+interval '2 seconds',"stateChangedAt"=clock_timestamp(),"errorCode"=NULL
      WHERE id=task_id AND generation=g AND "stateRevision"=r;
    reason:='STORY_TASK_SYNTHETIC_CHECKPOINT'; next_state:='SUBMITTED';
  ELSE
    IF s.id IS NULL OR s."requestHash" IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'Missing original checkpoint' USING ERRCODE='23514'; END IF;
    sub_id:=s.id;
    IF op IN ('PRE_SEND','RESULT','UNKNOWN') AND (token IS NULL OR s.owner IS DISTINCT FROM token OR t."leaseOwner" IS DISTINCT FROM token) THEN
      RAISE EXCEPTION 'Stale checkpoint owner' USING ERRCODE='23514'; END IF;
    IF op='PRE_SEND' THEN
      IF verdict<>'CURRENT' OR t.state<>'SUBMITTED' OR s.state<>'SUBMITTED' OR t."cancelRequestedAt" IS NOT NULL OR
        c."expiresAt"<=clock_timestamp() OR t."leaseUntil" IS NULL OR t."leaseUntil"<=clock_timestamp() OR data<>'' THEN
        RAISE EXCEPTION 'Send not eligible' USING ERRCODE='23514'; END IF;
      DELETE FROM public."StoryTestCheckpointFence" WHERE xid=f.xid AND pid=f.pid;
      RETURN jsonb_build_object('submissionId',sub_id,'state',t.state,'stateRevision',r);
    ELSIF op='RESULT' THEN
      IF octet_length(data)>50000 THEN RAISE EXCEPTION 'Synthetic response too large' USING ERRCODE='23514'; END IF;
      body:=data::jsonb;
      IF (body->>'schemaVersion'='story-fake-result-v1' AND body->'synthetic'='true'::jsonb AND body->>'submissionId'=sub_id AND
        body->>'taskId'=task_id AND body->>'generation'=g::text AND body->>'requestHash'=request_hash AND
        body->>'outcome' IN ('SUCCESS','FAILURE') AND (SELECT count(*) FROM jsonb_object_keys(body))=7) IS NOT TRUE THEN
        RAISE EXCEPTION 'Invalid synthetic result binding' USING ERRCODE='23514'; END IF;
      result_hash:=encode(sha256(convert_to('story-fake-result-v1'||E'\n'||data,'UTF8')),'hex');
      SELECT * INTO existing FROM public."StoryTaskResult" WHERE "submissionId"=sub_id;
      IF existing.id IS NOT NULL THEN
        IF existing."normalizedPayload"<>data OR existing."payloadHash"<>result_hash OR s.state<>'RESOLVED' THEN
          RAISE EXCEPTION 'Conflicting original result' USING ERRCODE='23514'; END IF;
        DELETE FROM public."StoryTestCheckpointFence" WHERE xid=f.xid AND pid=f.pid;
        RETURN jsonb_build_object('submissionId',sub_id,'state',t.state,'stateRevision',r);
      END IF;
      IF t.state<>'SUBMITTED' OR s.state<>'SUBMITTED' OR t."leaseUntil" IS NULL OR t."leaseUntil"<=clock_timestamp() THEN
        RAISE EXCEPTION 'Result owner expired or UNKNOWN' USING ERRCODE='23514'; END IF;
      INSERT INTO public."StoryTaskResult"(id,"taskId",generation,"submissionId",outcome,"normalizedPayload","payloadHash","validatorVersion","usageClass","safeErrorCode")
        VALUES('synthetic-result-'||sub_id,task_id,g,sub_id,
          CASE WHEN body->>'outcome'='SUCCESS' THEN 'VALIDATED_CANDIDATE'::public."StoryResultOutcome" ELSE 'DEFINITIVE_FAILURE'::public."StoryResultOutcome" END,
          data,result_hash,'synthetic-v1','UNKNOWN',CASE WHEN body->>'outcome'='FAILURE' THEN 'STORY_TASK_PROVIDER_FAILED' ELSE NULL END);
      UPDATE public."StoryProviderSubmission" SET state='RESOLVED',"definitiveAt"=clock_timestamp() WHERE id=sub_id;
      IF t."cancelRequestedAt" IS NOT NULL THEN next_state:='CANCELLED';
      ELSIF verdict='SOURCE_STALE' THEN next_state:='FAILED'; err:='STORY_TASK_RESULT_STALE';
      ELSIF body->>'outcome'='FAILURE' THEN next_state:='FAILED'; err:='STORY_TASK_PROVIDER_FAILED';
      ELSE next_state:='COMPLETED'; END IF;
      UPDATE public."StoryTask" SET state=next_state,"stateRevision"="stateRevision"+1,"leaseUntil"=NULL,
        "stateChangedAt"=clock_timestamp(),"errorCode"=err WHERE id=task_id AND generation=g AND "stateRevision"=r;
      reason:='STORY_TASK_SYNTHETIC_RESULT';
    ELSIF op='CANCEL' THEN
      IF token IS NOT NULL OR t.state NOT IN ('SUBMITTED','UNKNOWN') OR data<>'' THEN RAISE EXCEPTION 'Invalid pending cancellation' USING ERRCODE='23514'; END IF;
      IF t."cancelRequestedAt" IS NOT NULL THEN
        DELETE FROM public."StoryTestCheckpointFence" WHERE xid=f.xid AND pid=f.pid;
        RETURN jsonb_build_object('submissionId',sub_id,'state',t.state,'stateRevision',r);
      END IF;
      UPDATE public."StoryTask" SET "cancelRequestedAt"=clock_timestamp(),"stateRevision"="stateRevision"+1 WHERE id=task_id AND generation=g AND "stateRevision"=r;
      next_state:=t.state; reason:='STORY_TASK_CANCEL_REQUESTED';
    ELSIF op IN ('UNKNOWN','RECOVER') THEN
      IF t.state<>'SUBMITTED' OR s.state<>'SUBMITTED' OR data<>'' OR
        (op='RECOVER' AND (token IS NOT NULL OR t."leaseUntil" IS NULL OR t."leaseUntil">clock_timestamp())) THEN
        RAISE EXCEPTION 'No resend or UNKNOWN investigation' USING ERRCODE='23514'; END IF;
      UPDATE public."StoryProviderSubmission" SET state='UNKNOWN' WHERE id=sub_id;
      UPDATE public."StoryTask" SET state='UNKNOWN',"stateRevision"="stateRevision"+1,"leaseUntil"=NULL,
        "stateChangedAt"=clock_timestamp(),"errorCode"='STORY_TASK_PROVIDER_OUTCOME_UNKNOWN' WHERE id=task_id AND generation=g AND "stateRevision"=r;
      next_state:='UNKNOWN'; reason:='STORY_TASK_PROVIDER_OUTCOME_UNKNOWN';
    ELSE RAISE EXCEPTION 'Invalid operation' USING ERRCODE='23514'; END IF;
  END IF;
  INSERT INTO public."StoryTaskEvent"(id,"taskId",generation,sequence,state,"reasonCode")
    SELECT gen_random_uuid()::text,task_id,g,coalesce(max(e.sequence)+1,0),next_state,reason FROM public."StoryTaskEvent" e WHERE e."taskId"=task_id;
  DELETE FROM public."StoryTestCheckpointFence" WHERE xid=f.xid AND pid=f.pid;
  RETURN jsonb_build_object('submissionId',sub_id,'state',next_state,'stateRevision',r+1);
END $$;

ALTER FUNCTION public.story_m2_test_checkpoint_peek(text,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_checkpoint_lock(text,integer,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_checkpoint_open(text,integer,integer,text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m2_test_checkpoint_finish(text,integer,integer,text,text,text,text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m2_test_checkpoint_peek(text,integer),public.story_m2_test_checkpoint_lock(text,integer,integer),
  public.story_m2_test_checkpoint_open(text,integer,integer,text,text,text),public.story_m2_test_checkpoint_finish(text,integer,integer,text,text,text,text,text,text)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_fake_worker,
    storyline_verification_issuer,storyline_outbox,storyline_m2_reader,storyline_checkpoint_worker;
GRANT EXECUTE ON FUNCTION public.story_m2_test_checkpoint_peek(text,integer),public.story_m2_test_checkpoint_open(text,integer,integer,text,text,text),
  public.story_m2_test_checkpoint_finish(text,integer,integer,text,text,text,text,text,text) TO storyline_checkpoint_worker;
ROLLBACK;
