-- M3-02 DISPOSABLE ONLY. Install solely in an owned test cluster after the
-- M2 checkpoint gateway. Returns one bounded, scoped task/result binding to
-- the existing restricted reader. It grants no paid or write capability.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION public.story_m3_test_evidence_result(p text,m text,s text,task_id text,g integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p IS NULL OR m IS NULL OR s IS NULL OR task_id IS NULL OR g IS NULL OR
     octet_length(p)>128 OR octet_length(m)>128 OR octet_length(s)>128 OR
     octet_length(task_id)>128 OR g<0 OR g>1000000 OR
     NOT EXISTS (SELECT 1 FROM public."StoryTestAccess" a
       WHERE a."loginName"=session_user AND a.kind='READER'
         AND a."projectId"=p AND a."movieId"=m AND a."studioId"=s) THEN
    RAISE EXCEPTION 'Invalid evidence read scope' USING ERRCODE='23514';
  END IF;
  SELECT jsonb_build_object(
    'taskId',t.id,'generation',t.generation,'state',t.state::text,
    'kind',t.kind::text,'projectId',t."projectId",'movieId',t."movieId",
    'studioId',t."studioId",'sourceSnapshotId',t."sourceSnapshotId",
    'scriptVersionId',t."scriptVersionId",'expectedStudioRevision',t."expectedStudioRevision",
    'canonicalRecipe',t."canonicalRecipe",'recipeHash',t."recipeHash",
    'profileHash',t."profileHash",'resultId',r.id,
    'submissionId',sub.id,'submissionState',sub.state::text,
    'requestHash',sub."requestHash",'resultOutcome',r.outcome::text,
    'normalizedPayload',r."normalizedPayload",'payloadHash',r."payloadHash",
    'validatorVersion',r."validatorVersion") INTO result
  FROM public."StoryTask" t
  LEFT JOIN public."StoryProviderSubmission" sub
    ON sub."taskId"=t.id AND sub.generation=t.generation
  LEFT JOIN public."StoryTaskResult" r
    ON r."taskId"=t.id AND r.generation=t.generation AND r."submissionId"=sub.id
  WHERE t.id=task_id AND t.generation=g AND t."projectId"=p
    AND t."movieId"=m AND t."studioId"=s;
  RETURN result;
END $$;
ALTER FUNCTION public.story_m3_test_evidence_result(text,text,text,text,integer)
  OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m3_test_evidence_result(text,text,text,text,integer)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,
    storyline_synthetic_issuer,storyline_outbox,storyline_m2_reader,
    storyline_checkpoint_worker,storyline_verification_issuer;
GRANT EXECUTE ON FUNCTION public.story_m3_test_evidence_result(text,text,text,text,integer)
  TO storyline_m2_reader;
ROLLBACK;
