-- M2-06 DISPOSABLE ONLY. Install after the reviewed M2 status gateway in an
-- owned test cluster. No live migration or new paid authority is conferred.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE FUNCTION public.story_m2_test_status_one(p text,m text,s text,task_id text)
RETURNS TABLE ("taskId" text,kind text,state text,generation integer,"createdAt" timestamp,"stateChangedAt" timestamp,
  "errorCode" text,"candidateAvailable" boolean,"usageClass" text,"inputTokens" integer,"outputTokens" integer,"costUsdMicros" bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF task_id IS NULL OR octet_length(task_id)>128 OR NOT EXISTS (
    SELECT 1 FROM public."StoryTestAccess" a WHERE a."loginName"=session_user AND a.kind='READER'
      AND a."projectId"=p AND a."movieId"=m AND a."studioId"=s) THEN
    RAISE EXCEPTION 'Invalid status scope or task' USING ERRCODE='23514'; END IF;
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
    WHERE t."projectId"=p AND t."movieId"=m AND t."studioId"=s AND t.id=task_id;
END $$;
ALTER FUNCTION public.story_m2_test_status_one(text,text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m2_test_status_one(text,text,text,text)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,
    storyline_outbox,storyline_m2_reader,storyline_checkpoint_worker,storyline_verification_issuer;
GRANT EXECUTE ON FUNCTION public.story_m2_test_status_one(text,text,text,text) TO storyline_m2_reader;
ROLLBACK;
