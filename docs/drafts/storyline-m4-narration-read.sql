-- M4-02 DISPOSABLE ONLY. Install after the reviewed M3 candidate gateway in a
-- newly owned test cluster. No live migration or production role activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE ROLE storyline_m4_narration_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO storyline_m4_narration_reader;
GRANT SELECT ON public."Project",public."Movie",public."Transcript",public."TranscriptSegment",
  public."Translation",public."TranslatedSegment",public."TranslationQcIssue",public."Scene",
  public."CharacterAnalysisRun",public."Character",public."CharacterAlias",public."CharacterEvidence",
  public."CharacterRelationship",public."CharacterRelationshipEvidence",public."Recap",public."RecapSection",
  public."RecapCharacterInsight",public."RecapRelationshipInsight",public."RecapEvidence",
  public."StorylineStudio",public."StorySourceSnapshot",public."StoryScriptVersion"
  TO storyline_m4_narration_reader;

-- Locks only; no fence row, issuance, checkpoint or history mutation. Reuse
-- the private READER scope map and existing bounded M3 read projections.
CREATE FUNCTION public.story_m4_test_narration_read(p text,m text,s text,candidate_id text,candidate_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public."StoryEvidenceCandidate"%ROWTYPE; t public."StoryTask"%ROWTYPE;
  sub public."StoryProviderSubmission"%ROWTYPE; r public."StoryTaskResult"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' OR
    p IS NULL OR m IS NULL OR s IS NULL OR candidate_id IS NULL OR candidate_hash IS NULL OR
    octet_length(p) NOT BETWEEN 1 AND 128 OR octet_length(m) NOT BETWEEN 1 AND 128 OR
    octet_length(s) NOT BETWEEN 1 AND 128 OR octet_length(candidate_id) NOT BETWEEN 1 AND 128 OR
    candidate_hash !~ '^[a-f0-9]{64}$' OR NOT EXISTS (
      SELECT 1 FROM public."StoryTestAccess" a WHERE a."loginName"=session_user AND a.kind='READER'
        AND (a."projectId",a."movieId",a."studioId")=(p,m,s)) THEN
    RAISE EXCEPTION 'Invalid narration scope' USING ERRCODE='23514'; END IF;
  PERFORM public.story_m2_test_scope_lock(p,m,s);
  SELECT * INTO c FROM public."StoryEvidenceCandidate" WHERE id=candidate_id
    AND ("projectId","movieId","studioId")=(p,m,s) AND "candidateHash"=candidate_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT t FROM public."StoryTask" WHERE id=c."taskId" AND generation=c.generation
    AND ("projectId","movieId","studioId")=(p,m,s) FOR UPDATE;
  SELECT * INTO STRICT sub FROM public."StoryProviderSubmission" WHERE "taskId"=t.id AND generation=t.generation;
  SELECT * INTO STRICT r FROM public."StoryTaskResult" WHERE id=c."resultId"
    AND "taskId"=t.id AND generation=t.generation AND "submissionId"=sub.id;
  IF t.state<>'COMPLETED' OR t.kind<>'ANALYZE_EVIDENCE' OR t."scriptVersionId" IS NOT NULL OR
    sub.state<>'RESOLVED' OR c."submissionId"<>sub.id OR c."resultHash"<>r."payloadHash" OR
    r.outcome<>'VALIDATED_CANDIDATE' OR r."validatorVersion"<>'synthetic-v1' OR
    c."validationStatus"<>'STRUCTURALLY_GROUNDED' OR c.origin<>'SYNTHETIC_TEST' OR
    (c."sourceSnapshotId",c."sourceContentHash",c."sourceContextHash",c."recipeHash",c."profileHash",c."expectedStudioRevision")
      IS DISTINCT FROM (t."sourceSnapshotId",t."sourceContentHash",t."sourceContextHash",t."recipeHash",t."profileHash",t."expectedStudioRevision") OR
    NOT EXISTS (SELECT 1 FROM public."StorylineStudio" WHERE id=s AND revision=t."expectedStudioRevision"
      AND "currentSnapshotId"=t."sourceSnapshotId") THEN
    RAISE EXCEPTION 'Invalid narration dependencies' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object(
    'candidate',public.story_m3_test_candidate_read(p,m,s,t.id,t.generation),
    'binding',public.story_m3_test_evidence_result(p,m,s,t.id,t.generation));
END $$;
ALTER FUNCTION public.story_m4_test_narration_read(text,text,text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m4_test_narration_read(text,text,text,text,text)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,
    storyline_outbox,storyline_m2_reader,storyline_checkpoint_worker,storyline_fake_worker,
    storyline_verification_issuer,storyline_m3_candidate_writer,storyline_m4_narration_reader;
GRANT EXECUTE ON FUNCTION public.story_m4_test_narration_read(text,text,text,text,text) TO storyline_m4_narration_reader;
ROLLBACK;
