-- M3-03 DISPOSABLE ONLY. Apply after the M3-02 read gateway in an owned test
-- cluster. This is not a live Prisma migration or a production role installer.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE ROLE storyline_m3_candidate_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO storyline_m3_candidate_writer;
GRANT SELECT ON public."Project",public."Movie",public."Transcript",public."TranscriptSegment",
  public."Translation",public."TranslatedSegment",public."TranslationQcIssue",public."Scene",
  public."CharacterAnalysisRun",public."Character",public."CharacterAlias",public."CharacterEvidence",
  public."CharacterRelationship",public."CharacterRelationshipEvidence",public."Recap",public."RecapSection",
  public."RecapCharacterInsight",public."RecapRelationshipInsight",public."RecapEvidence",
  public."StorylineStudio",public."StorySourceSnapshot",public."StoryScriptVersion"
  TO storyline_m3_candidate_writer;

CREATE TABLE public."StoryEvidenceCandidate" (
  id text PRIMARY KEY,
  "projectId" text NOT NULL,"movieId" text NOT NULL,"studioId" text NOT NULL,
  "taskId" text NOT NULL,"generation" integer NOT NULL,"resultId" text NOT NULL,
  "submissionId" text NOT NULL,"resultHash" varchar(64) NOT NULL,
  "sourceSnapshotId" text NOT NULL,"sourceContentHash" varchar(64) NOT NULL,
  "sourceContextHash" varchar(64) NOT NULL,"sourceDependencyHash" varchar(64) NOT NULL,
  "sourceBindingHash" varchar(64) NOT NULL,"expectedStudioRevision" integer NOT NULL,
  "recipeHash" varchar(64) NOT NULL,"profileHash" varchar(64) NOT NULL,
  "schemaVersion" text NOT NULL,"canonicalPayload" text NOT NULL,
  "candidateHash" varchar(64) NOT NULL,"validationStatus" text NOT NULL,
  origin text NOT NULL,"validatedAt" timestamp(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "StoryEvidenceCandidate_scope_fkey" FOREIGN KEY ("studioId","projectId","movieId")
    REFERENCES public."StorylineStudio"(id,"projectId","movieId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryEvidenceCandidate_task_fkey" FOREIGN KEY ("taskId")
    REFERENCES public."StoryTask"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryEvidenceCandidate_result_fkey" FOREIGN KEY ("resultId")
    REFERENCES public."StoryTaskResult"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryEvidenceCandidate_snapshot_fkey" FOREIGN KEY ("sourceSnapshotId","studioId","sourceContentHash","sourceContextHash")
    REFERENCES public."StorySourceSnapshot"(id,"studioId","sourceContentHash","sourceContextHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "StoryEvidenceCandidate_task_generation_key" UNIQUE ("taskId","generation"),
  CONSTRAINT "StoryEvidenceCandidate_bounds" CHECK ((
    "generation" BETWEEN 0 AND 1000000 AND "expectedStudioRevision">=0 AND
    public.story_m1_is_hash("resultHash") AND public.story_m1_is_hash("sourceContentHash") AND
    public.story_m1_is_hash("sourceContextHash") AND public.story_m1_is_hash("sourceDependencyHash") AND
    public.story_m1_is_hash("sourceBindingHash") AND public.story_m1_is_hash("recipeHash") AND
    public.story_m1_is_hash("profileHash") AND public.story_m1_is_hash("candidateHash") AND
    "schemaVersion"='story-evidence-candidate-v1' AND "validationStatus"='STRUCTURALLY_GROUNDED' AND
    origin='SYNTHETIC_TEST' AND octet_length("canonicalPayload") BETWEEN 2 AND 524288 AND
    json_typeof("canonicalPayload"::json)='object' AND isfinite("validatedAt")
  ) IS TRUE)
);
CREATE INDEX "StoryEvidenceCandidate_scope_created_idx"
  ON public."StoryEvidenceCandidate"("projectId","movieId","studioId","validatedAt");
ALTER TABLE public."StoryEvidenceCandidate" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryEvidenceCandidate" FROM PUBLIC,storyline_runtime,storyline_admission_writer,
  storyline_synthetic_issuer,storyline_outbox,storyline_m2_reader,storyline_checkpoint_worker,
  storyline_fake_worker,storyline_verification_issuer,storyline_m3_candidate_writer;

CREATE FUNCTION public.story_m3_test_candidate_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable evidence candidate' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "StoryEvidenceCandidate_immutable" BEFORE UPDATE OR DELETE ON public."StoryEvidenceCandidate"
  FOR EACH ROW EXECUTE FUNCTION public.story_m3_test_candidate_immutable();

CREATE TABLE public."StoryTestCandidateAccess" (
  "loginName" text PRIMARY KEY,"projectId" text NOT NULL,"movieId" text NOT NULL,"studioId" text NOT NULL,
  FOREIGN KEY ("studioId","projectId","movieId") REFERENCES public."StorylineStudio"(id,"projectId","movieId")
);
CREATE TABLE public."StoryTestCandidateFence" (
  xid xid8 NOT NULL,pid integer NOT NULL,login text NOT NULL,challenge text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(xid,pid)
);
ALTER TABLE public."StoryTestCandidateAccess" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryTestCandidateFence" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryTestCandidateAccess",public."StoryTestCandidateFence" FROM PUBLIC,
  storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_outbox,
  storyline_m2_reader,storyline_checkpoint_worker,storyline_fake_worker,
  storyline_verification_issuer,storyline_m3_candidate_writer;

CREATE FUNCTION public.story_m3_test_candidate_open(p text,m text,s text,task_id text,g integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public."StoryTask"%ROWTYPE; r public."StoryTaskResult"%ROWTYPE;
  sub public."StoryProviderSubmission"%ROWTYPE; snap public."StorySourceSnapshot"%ROWTYPE;
  challenge text; binding jsonb;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' OR p IS NULL OR m IS NULL OR s IS NULL OR
     task_id IS NULL OR g IS NULL OR g NOT BETWEEN 0 AND 1000000 OR
     octet_length(p)>128 OR octet_length(m)>128 OR octet_length(s)>128 OR octet_length(task_id)>128 OR
     NOT EXISTS (SELECT 1 FROM public."StoryTestCandidateAccess" a WHERE a."loginName"=session_user
       AND (a."projectId",a."movieId",a."studioId")=(p,m,s)) THEN
    RAISE EXCEPTION 'Invalid candidate scope' USING ERRCODE='23514'; END IF;
  PERFORM public.story_m2_test_scope_lock(p,m,s);
  SELECT * INTO STRICT t FROM public."StoryTask" WHERE id=task_id AND generation=g
    AND ("projectId","movieId","studioId")=(p,m,s) FOR UPDATE;
  IF t.state<>'COMPLETED' OR t.kind<>'ANALYZE_EVIDENCE' OR t."scriptVersionId" IS NOT NULL OR
     NOT EXISTS (SELECT 1 FROM public."StorylineStudio" WHERE id=s AND revision=t."expectedStudioRevision"
       AND "currentSnapshotId"=t."sourceSnapshotId") THEN
    RAISE EXCEPTION 'Candidate task is not current and complete' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT sub FROM public."StoryProviderSubmission" WHERE "taskId"=task_id AND generation=g;
  SELECT * INTO STRICT r FROM public."StoryTaskResult" WHERE "taskId"=task_id AND generation=g AND "submissionId"=sub.id;
  SELECT * INTO STRICT snap FROM public."StorySourceSnapshot" WHERE id=t."sourceSnapshotId" AND "studioId"=s;
  IF sub.state<>'RESOLVED' OR r.outcome<>'VALIDATED_CANDIDATE' OR r."validatorVersion"<>'synthetic-v1' OR
     (t."sourceContentHash",t."sourceContextHash") IS DISTINCT FROM (snap."sourceContentHash",snap."sourceContextHash") OR
     (t."canonicalRecipe"::json->'profile'->>'id')<>'synthetic-text' OR
     (t."canonicalRecipe"::json->'profile'->>'version')<>'v1' OR
     (t."canonicalRecipe"::json->>'responseSchemaVersion')<>'story-evidence-candidate-v1' THEN
    RAISE EXCEPTION 'Candidate result binding invalid' USING ERRCODE='23514'; END IF;
  binding:=jsonb_build_object('taskId',t.id,'generation',g,'state',t.state::text,'kind',t.kind::text,
    'projectId',p,'movieId',m,'studioId',s,'sourceSnapshotId',snap.id,
    'sourceContentHash',snap."sourceContentHash",'sourceContextHash',snap."sourceContextHash",
    'sourceDependencyHash',snap."dependencyHash",'sourceBindingHash',snap."sourceBindingHash",
    'scriptVersionId',t."scriptVersionId",'expectedStudioRevision',t."expectedStudioRevision",
    'canonicalRecipe',t."canonicalRecipe",'recipeHash',t."recipeHash",'profileHash',t."profileHash",
    'resultId',r.id,'submissionId',sub.id,'submissionState',sub.state::text,'requestHash',sub."requestHash",
    'resultOutcome',r.outcome::text,'normalizedPayload',r."normalizedPayload",
    'payloadHash',r."payloadHash",'validatorVersion',r."validatorVersion");
  challenge:=jsonb_build_object('version','disposable-m3-candidate-fence-v1','nonce',gen_random_uuid()::text,
    'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid(),'login',session_user,
    'taskId',t.id,'generation',g,'resultId',r.id,'resultHash',r."payloadHash",'recipeHash',t."recipeHash",
    'profileHash',t."profileHash",'sourceSnapshotId',snap.id,'sourceContentHash',snap."sourceContentHash",
    'sourceContextHash',snap."sourceContextHash",'sourceDependencyHash',snap."dependencyHash",
    'sourceBindingHash',snap."sourceBindingHash",'studioRevision',t."expectedStudioRevision")::text;
  INSERT INTO public."StoryTestCandidateFence"(xid,pid,login,challenge)
    VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,challenge);
  RETURN jsonb_build_object('challenge',challenge,'binding',binding);
END $$;

CREATE FUNCTION public.story_m3_test_candidate_finish(task_id text,g integer,payload text,candidate_hash text,proof text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public."StoryTestCandidateFence"%ROWTYPE; t public."StoryTask"%ROWTYPE;
  r public."StoryTaskResult"%ROWTYPE; snap public."StorySourceSnapshot"%ROWTYPE;
  stored public."StoryEvidenceCandidate"%ROWTYPE; secret_key bytea; b jsonb; body jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public."StoryTestCandidateFence" WHERE xid=pg_current_xact_id()
    AND pid=pg_backend_pid() AND login=session_user FOR UPDATE;
  SELECT secret INTO STRICT secret_key FROM public."StoryTestValidationKey" WHERE singleton;
  b:=f.challenge::jsonb;
  IF (b->>'taskId',(b->>'generation')::integer) IS DISTINCT FROM (task_id,g) OR
     payload IS NULL OR octet_length(payload) NOT BETWEEN 2 AND 524288 OR
     candidate_hash IS NULL OR candidate_hash !~ '^[0-9a-f]{64}$' OR
     candidate_hash<>encode(sha256(convert_to('story-evidence-candidate-v1'||E'\n'||payload,'UTF8')),'hex') OR
     proof IS NULL OR proof !~ '^[0-9a-f]{64}$' OR f."createdAt"<clock_timestamp()-interval '20 seconds' OR
     decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(
       convert_to(f.challenge||E'\n'||candidate_hash,'UTF8'),secret_key,'sha256') THEN
    RAISE EXCEPTION 'Untrusted candidate validation' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT t FROM public."StoryTask" WHERE id=task_id AND generation=g FOR UPDATE;
  SELECT * INTO STRICT r FROM public."StoryTaskResult" WHERE id=b->>'resultId' AND "taskId"=task_id AND generation=g;
  SELECT * INTO STRICT snap FROM public."StorySourceSnapshot" WHERE id=t."sourceSnapshotId";
  IF t.state<>'COMPLETED' OR r.outcome<>'VALIDATED_CANDIDATE' OR
     (t."recipeHash",t."profileHash",t."sourceSnapshotId",t."expectedStudioRevision",r."payloadHash") IS DISTINCT FROM
       (b->>'recipeHash',b->>'profileHash',b->>'sourceSnapshotId',(b->>'studioRevision')::integer,b->>'resultHash') OR
     NOT EXISTS (SELECT 1 FROM public."StorylineStudio" WHERE id=t."studioId" AND revision=t."expectedStudioRevision"
       AND "currentSnapshotId"=t."sourceSnapshotId") THEN
    RAISE EXCEPTION 'Candidate dependencies changed' USING ERRCODE='23514'; END IF;
  body:=payload::jsonb;
  IF body->>'schemaVersion'<>'story-evidence-candidate-v1' OR body->>'origin'<>'SYNTHETIC_TEST' OR
     body->'task'->>'taskId' IS DISTINCT FROM task_id OR body->'task'->>'generation' IS DISTINCT FROM g::text OR
     body->'task'->>'recipeHash' IS DISTINCT FROM t."recipeHash" OR
     (body->'source'->>'projectId',body->'source'->>'movieId',body->'source'->>'studioId') IS DISTINCT FROM
       (t."projectId",t."movieId",t."studioId") OR
     (body->'source'->>'snapshotId',body->'source'->>'contentHash',body->'source'->>'contextHash',
       body->'source'->>'dependencyHash',body->'source'->>'bindingHash') IS DISTINCT FROM
       (snap.id,snap."sourceContentHash",snap."sourceContextHash",snap."dependencyHash",snap."sourceBindingHash") OR
     (body->'model'->>'profileId',body->'model'->>'profileVersion',body->'model'->>'responseSchemaVersion') IS DISTINCT FROM
       (t."canonicalRecipe"::json->'profile'->>'id',t."canonicalRecipe"::json->'profile'->>'version',
        t."canonicalRecipe"::json->>'responseSchemaVersion') THEN
    RAISE EXCEPTION 'Candidate projection mismatch' USING ERRCODE='23514'; END IF;
  INSERT INTO public."StoryEvidenceCandidate"(id,"projectId","movieId","studioId","taskId","generation",
    "resultId","submissionId","resultHash","sourceSnapshotId","sourceContentHash","sourceContextHash",
    "sourceDependencyHash","sourceBindingHash","expectedStudioRevision","recipeHash","profileHash",
    "schemaVersion","canonicalPayload","candidateHash","validationStatus",origin)
    VALUES(gen_random_uuid()::text,t."projectId",t."movieId",t."studioId",t.id,g,r.id,r."submissionId",r."payloadHash",
      snap.id,snap."sourceContentHash",snap."sourceContextHash",snap."dependencyHash",snap."sourceBindingHash",
      t."expectedStudioRevision",t."recipeHash",t."profileHash",'story-evidence-candidate-v1',payload,candidate_hash,
      'STRUCTURALLY_GROUNDED','SYNTHETIC_TEST')
    ON CONFLICT ("taskId","generation") DO NOTHING;
  SELECT * INTO STRICT stored FROM public."StoryEvidenceCandidate" WHERE "taskId"=task_id AND generation=g;
  IF stored."candidateHash"<>candidate_hash OR stored."canonicalPayload"<>payload OR stored."resultId"<>r.id THEN
    RAISE EXCEPTION 'Conflicting immutable candidate' USING ERRCODE='23505'; END IF;
  DELETE FROM public."StoryTestCandidateFence" WHERE xid=f.xid AND pid=f.pid;
  RETURN jsonb_build_object('id',stored.id,'taskId',task_id,'generation',g,'candidateHash',candidate_hash,
    'resultId',r.id,'validatedAt',stored."validatedAt",'validationStatus',stored."validationStatus",
    'origin',stored.origin);
END $$;

CREATE FUNCTION public.story_m3_test_candidate_read(p text,m text,s text,task_id text,g integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE row_value jsonb;
BEGIN
  IF p IS NULL OR m IS NULL OR s IS NULL OR task_id IS NULL OR g IS NULL OR
     octet_length(p)>128 OR octet_length(m)>128 OR octet_length(s)>128 OR octet_length(task_id)>128 OR
     g NOT BETWEEN 0 AND 1000000 OR NOT EXISTS (SELECT 1 FROM public."StoryTestAccess" a
       WHERE a."loginName"=session_user AND a.kind='READER' AND
         (a."projectId",a."movieId",a."studioId")=(p,m,s)) THEN
    RAISE EXCEPTION 'Invalid candidate read scope' USING ERRCODE='23514'; END IF;
  SELECT jsonb_build_object('id',c.id,'taskId',c."taskId",'generation',c.generation,
    'resultId',c."resultId",'resultHash',c."resultHash",'sourceSnapshotId',c."sourceSnapshotId",
    'sourceContentHash',c."sourceContentHash",'sourceContextHash',c."sourceContextHash",
    'sourceDependencyHash',c."sourceDependencyHash",'sourceBindingHash',c."sourceBindingHash",
    'expectedStudioRevision',c."expectedStudioRevision",'recipeHash',c."recipeHash",
    'profileHash',c."profileHash",'schemaVersion',c."schemaVersion",
    'canonicalPayload',c."canonicalPayload",'candidateHash',c."candidateHash",
    'validationStatus',c."validationStatus",'origin',c.origin,'validatedAt',c."validatedAt") INTO row_value
    FROM public."StoryEvidenceCandidate" c WHERE c."projectId"=p AND c."movieId"=m AND c."studioId"=s
      AND c."taskId"=task_id AND c.generation=g;
  RETURN row_value;
END $$;

ALTER FUNCTION public.story_m3_test_candidate_immutable() OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m3_test_candidate_open(text,text,text,text,integer) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m3_test_candidate_finish(text,integer,text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m3_test_candidate_read(text,text,text,text,integer) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m3_test_candidate_immutable(),
  public.story_m3_test_candidate_open(text,text,text,text,integer),
  public.story_m3_test_candidate_finish(text,integer,text,text,text),
  public.story_m3_test_candidate_read(text,text,text,text,integer)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,
    storyline_outbox,storyline_m2_reader,storyline_checkpoint_worker,storyline_fake_worker,
    storyline_verification_issuer,storyline_m3_candidate_writer;
GRANT EXECUTE ON FUNCTION public.story_m3_test_candidate_open(text,text,text,text,integer),
  public.story_m3_test_candidate_finish(text,integer,text,text,text) TO storyline_m3_candidate_writer;
GRANT EXECUTE ON FUNCTION public.story_m3_test_candidate_read(text,text,text,text,integer) TO storyline_m2_reader;
ROLLBACK;
