-- M4-03 DISPOSABLE ONLY, after M4-02. No application migration or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE ROLE storyline_m4_narration_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT storyline_m4_narration_reader TO storyline_m4_narration_writer;

-- Exact immutable M3 lineage, not a completion-marker-as-candidate shortcut.
CREATE UNIQUE INDEX "StoryEvidenceCandidate_narration_binding_key" ON public."StoryEvidenceCandidate"
  (id,"candidateHash","projectId","movieId","studioId","taskId",generation,"resultId","submissionId","resultHash",
   "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash",
   "expectedStudioRevision","recipeHash","profileHash");
CREATE TABLE public."StoryNarrationDraft" (
  id text PRIMARY KEY,"projectId" text NOT NULL,"movieId" text NOT NULL,"studioId" text NOT NULL,
  "candidateId" text NOT NULL,"candidateHash" varchar(64) NOT NULL,
  "taskId" text NOT NULL,generation integer NOT NULL,"resultId" text NOT NULL,
  "submissionId" text NOT NULL,"resultHash" varchar(64) NOT NULL,
  "sourceSnapshotId" text NOT NULL,"sourceContentHash" varchar(64) NOT NULL,"sourceContextHash" varchar(64) NOT NULL,
  "sourceDependencyHash" varchar(64) NOT NULL,"sourceBindingHash" varchar(64) NOT NULL,
  "mediaSha256" varchar(64) NOT NULL,"expectedStudioRevision" integer NOT NULL,
  "recipeHash" varchar(64) NOT NULL,"profileHash" varchar(64) NOT NULL,
  "schemaVersion" text NOT NULL,"composerVersion" text NOT NULL,"canonicalPayload" text NOT NULL,
  "draftHash" varchar(64) NOT NULL,origin text NOT NULL,"reviewStatus" text NOT NULL,approval text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY ("studioId","projectId","movieId") REFERENCES public."StorylineStudio"(id,"projectId","movieId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("candidateId","candidateHash","projectId","movieId","studioId","taskId",generation,"resultId","submissionId","resultHash",
    "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash","expectedStudioRevision","recipeHash","profileHash")
    REFERENCES public."StoryEvidenceCandidate"(id,"candidateHash","projectId","movieId","studioId","taskId",generation,"resultId","submissionId","resultHash",
    "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash","expectedStudioRevision","recipeHash","profileHash") ON DELETE RESTRICT ON UPDATE RESTRICT,
  UNIQUE ("candidateId","schemaVersion","composerVersion"),
  CHECK ((generation BETWEEN 0 AND 1000000 AND "expectedStudioRevision">=0 AND
    public.story_m1_is_hash("mediaSha256") AND public.story_m1_is_hash("draftHash") AND
    octet_length(id) BETWEEN 1 AND 128 AND octet_length("canonicalPayload") BETWEEN 2 AND 524288 AND
    "draftHash"=encode(sha256(convert_to('story-narration-draft-v1'||E'\n'||"canonicalPayload",'UTF8')),'hex') AND
    "schemaVersion"='story-narration-draft-v1' AND "composerVersion"='story-synthetic-narration-v1' AND
    origin='SYNTHETIC_TEST' AND "reviewStatus"='NEEDS_HUMAN_REVIEW' AND approval='PROVISIONAL' AND isfinite("createdAt") AND
    json_typeof("canonicalPayload"::json)='object' AND
    ("canonicalPayload"::json->>'schemaVersion') IS NOT DISTINCT FROM "schemaVersion" AND
    ("canonicalPayload"::json->>'composerVersion') IS NOT DISTINCT FROM "composerVersion" AND
    ("canonicalPayload"::json->>'origin') IS NOT DISTINCT FROM origin AND
    ("canonicalPayload"::json->'review'->>'approval') IS NOT DISTINCT FROM approval AND
    ("canonicalPayload"::json->'review'->>'status') IS NOT DISTINCT FROM "reviewStatus" AND
    ("canonicalPayload"::json->'analysis'->>'candidateId') IS NOT DISTINCT FROM "candidateId" AND
    ("canonicalPayload"::json->'analysis'->>'candidateHash') IS NOT DISTINCT FROM "candidateHash"
  ) IS TRUE)
);
CREATE INDEX "StoryNarrationDraft_scope_created_idx" ON public."StoryNarrationDraft"("projectId","movieId","studioId","createdAt");
ALTER TABLE public."StoryNarrationDraft" OWNER TO storyline_migration_owner;
CREATE FUNCTION public.story_m4_test_narration_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable provisional narration' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "StoryNarrationDraft_immutable" BEFORE UPDATE OR DELETE ON public."StoryNarrationDraft"
  FOR EACH ROW EXECUTE FUNCTION public.story_m4_test_narration_immutable();
CREATE TRIGGER "StoryNarrationDraft_no_truncate" BEFORE TRUNCATE ON public."StoryNarrationDraft"
  FOR EACH STATEMENT EXECUTE FUNCTION public.story_m4_test_narration_immutable();

CREATE TABLE public."StoryTestNarrationFence" (
  xid xid8 NOT NULL,pid integer NOT NULL,login text NOT NULL,challenge text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(xid,pid)
);
ALTER TABLE public."StoryTestNarrationFence" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryNarrationDraft",public."StoryTestNarrationFence" FROM PUBLIC,
  storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_outbox,storyline_m2_reader,
  storyline_checkpoint_worker,storyline_fake_worker,storyline_verification_issuer,storyline_m3_candidate_writer,
  storyline_m4_narration_reader,storyline_m4_narration_writer;

CREATE FUNCTION public.story_m4_test_narration_open(p text,m text,s text,candidate_id text,candidate_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE envelope jsonb; challenge text;
BEGIN
  envelope:=public.story_m4_test_narration_read(p,m,s,candidate_id,candidate_hash);
  IF envelope IS NULL THEN RAISE EXCEPTION 'Missing narration context' USING ERRCODE='23514'; END IF;
  challenge:=jsonb_build_object('version','disposable-m4-narration-fence-v1','nonce',gen_random_uuid()::text,
    'transactionId',pg_current_xact_id()::text,'backendPid',pg_backend_pid(),'login',session_user,
    'projectId',p,'movieId',m,'studioId',s,'candidateId',candidate_id,'candidateHash',candidate_hash,
    'resultId',envelope->'binding'->>'resultId','resultHash',envelope->'binding'->>'payloadHash',
    'recipeHash',envelope->'binding'->>'recipeHash','revision',envelope->'binding'->>'expectedStudioRevision')::text;
  INSERT INTO public."StoryTestNarrationFence"(xid,pid,login,challenge)
    VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,challenge);
  RETURN challenge;
END $$;

CREATE FUNCTION public.story_m4_test_narration_finish(candidate_id text,payload text,draft_hash text,proof text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public."StoryTestNarrationFence"%ROWTYPE; c public."StoryEvidenceCandidate"%ROWTYPE;
  snap public."StorySourceSnapshot"%ROWTYPE; stored public."StoryNarrationDraft"%ROWTYPE;
  secret_key bytea; b jsonb; body jsonb; envelope jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public."StoryTestNarrationFence" WHERE xid=pg_current_xact_id() AND pid=pg_backend_pid() AND login=session_user FOR UPDATE;
  SELECT secret INTO STRICT secret_key FROM public."StoryTestValidationKey" WHERE singleton;
  b:=f.challenge::jsonb;
  IF candidate_id IS DISTINCT FROM b->>'candidateId' OR payload IS NULL OR octet_length(payload) NOT BETWEEN 2 AND 524288 OR
    draft_hash IS NULL OR draft_hash !~ '^[a-f0-9]{64}$' OR
    draft_hash<>encode(sha256(convert_to('story-narration-draft-v1'||E'\n'||payload,'UTF8')),'hex') OR
    proof IS NULL OR proof !~ '^[a-f0-9]{64}$' OR f."createdAt"<clock_timestamp()-interval '20 seconds' OR
    decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(convert_to(f.challenge||E'\n'||draft_hash,'UTF8'),secret_key,'sha256') THEN
    RAISE EXCEPTION 'Untrusted narration validation' USING ERRCODE='42501'; END IF;
  envelope:=public.story_m4_test_narration_read(b->>'projectId',b->>'movieId',b->>'studioId',candidate_id,b->>'candidateHash');
  IF envelope IS NULL OR (envelope->'binding'->>'resultId',envelope->'binding'->>'payloadHash',envelope->'binding'->>'recipeHash',envelope->'binding'->>'expectedStudioRevision')
    IS DISTINCT FROM (b->>'resultId',b->>'resultHash',b->>'recipeHash',b->>'revision') THEN
    RAISE EXCEPTION 'Narration dependencies changed' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT c FROM public."StoryEvidenceCandidate" WHERE id=candidate_id;
  SELECT * INTO STRICT snap FROM public."StorySourceSnapshot" WHERE id=c."sourceSnapshotId";
  body:=payload::jsonb;
  IF body->>'schemaVersion' IS DISTINCT FROM 'story-narration-draft-v1' OR body->>'composerVersion' IS DISTINCT FROM 'story-synthetic-narration-v1' OR
    body->>'origin' IS DISTINCT FROM 'SYNTHETIC_TEST' OR body->'review' IS DISTINCT FROM '{"status":"NEEDS_HUMAN_REVIEW","approval":"PROVISIONAL"}'::jsonb OR
    (body->'analysis'->>'candidateId',body->'analysis'->>'candidateHash',body->'analysis'->>'taskId',body->'analysis'->>'generation',
      body->'analysis'->>'resultId',body->'analysis'->>'resultHash',body->'analysis'->>'submissionId',body->'analysis'->>'recipeHash',body->'analysis'->>'profileDefinitionHash')
    IS DISTINCT FROM (c.id,c."candidateHash",c."taskId",c.generation::text,c."resultId",c."resultHash",c."submissionId",c."recipeHash",c."profileHash") OR
    (body->'source'->>'projectId',body->'source'->>'movieId',body->'source'->>'studioId',body->'source'->>'snapshotId',
      body->'source'->>'contentHash',body->'source'->>'contextHash',body->'source'->>'dependencyHash',body->'source'->>'bindingHash',
      body->'source'->>'expectedStudioRevision',body->'source'->>'mediaSha256')
    IS DISTINCT FROM (c."projectId",c."movieId",c."studioId",snap.id,snap."sourceContentHash",snap."sourceContextHash",snap."dependencyHash",snap."sourceBindingHash",
      c."expectedStudioRevision"::text,snap."sourceSha256") THEN
    RAISE EXCEPTION 'Narration projection mismatch' USING ERRCODE='23514'; END IF;
  INSERT INTO public."StoryNarrationDraft"(id,"projectId","movieId","studioId","candidateId","candidateHash","taskId",generation,"resultId","submissionId","resultHash",
    "sourceSnapshotId","sourceContentHash","sourceContextHash","sourceDependencyHash","sourceBindingHash","mediaSha256","expectedStudioRevision","recipeHash","profileHash",
    "schemaVersion","composerVersion","canonicalPayload","draftHash",origin,"reviewStatus",approval)
  VALUES(gen_random_uuid()::text,c."projectId",c."movieId",c."studioId",c.id,c."candidateHash",c."taskId",c.generation,c."resultId",c."submissionId",c."resultHash",
    snap.id,snap."sourceContentHash",snap."sourceContextHash",snap."dependencyHash",snap."sourceBindingHash",snap."sourceSha256",c."expectedStudioRevision",c."recipeHash",c."profileHash",
    'story-narration-draft-v1','story-synthetic-narration-v1',payload,draft_hash,'SYNTHETIC_TEST','NEEDS_HUMAN_REVIEW','PROVISIONAL')
  ON CONFLICT ("candidateId","schemaVersion","composerVersion") DO NOTHING;
  SELECT * INTO STRICT stored FROM public."StoryNarrationDraft" WHERE "candidateId"=candidate_id AND "schemaVersion"='story-narration-draft-v1' AND "composerVersion"='story-synthetic-narration-v1';
  IF stored."draftHash"<>draft_hash OR stored."canonicalPayload"<>payload THEN
    RAISE EXCEPTION 'Conflicting immutable narration' USING ERRCODE='23505'; END IF;
  DELETE FROM public."StoryTestNarrationFence" WHERE xid=f.xid AND pid=f.pid;
  RETURN jsonb_build_object('id',stored.id,'draftHash',stored."draftHash",'candidateId',stored."candidateId",'candidateHash',stored."candidateHash",'createdAt',stored."createdAt");
END $$;

-- Historical read does not require current source. The service separately
-- reconstructs freshness; immutable historical bytes remain available as stale.
CREATE FUNCTION public.story_m4_test_draft_read(p text,m text,s text,narration_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE stored public."StoryNarrationDraft"%ROWTYPE; current_binding boolean;
BEGIN
  IF p IS NULL OR m IS NULL OR s IS NULL OR narration_id IS NULL OR
    octet_length(p) NOT BETWEEN 1 AND 128 OR octet_length(m) NOT BETWEEN 1 AND 128 OR octet_length(s) NOT BETWEEN 1 AND 128 OR octet_length(narration_id) NOT BETWEEN 1 AND 128 OR
    NOT EXISTS (SELECT 1 FROM public."StoryTestAccess" WHERE "loginName"=session_user AND kind='READER' AND ("projectId","movieId","studioId")=(p,m,s)) THEN
    RAISE EXCEPTION 'Invalid narration read scope' USING ERRCODE='23514'; END IF;
  SELECT * INTO stored FROM public."StoryNarrationDraft" WHERE id=narration_id AND ("projectId","movieId","studioId")=(p,m,s);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM public."StorylineStudio" studio JOIN public."StoryTask" t ON t.id=stored."taskId"
    JOIN public."StoryProviderSubmission" sub ON sub.id=stored."submissionId" JOIN public."StoryTaskResult" r ON r.id=stored."resultId"
    WHERE studio.id=s AND studio.revision=stored."expectedStudioRevision" AND studio."currentSnapshotId"=stored."sourceSnapshotId"
      AND t.generation=stored.generation AND t.state='COMPLETED' AND sub.state='RESOLVED' AND r.outcome='VALIDATED_CANDIDATE') INTO current_binding;
  RETURN jsonb_build_object('id',stored.id,'candidateId',stored."candidateId",'candidateHash',stored."candidateHash",'draftHash',stored."draftHash",
    'canonicalPayload',stored."canonicalPayload",'schemaVersion',stored."schemaVersion",'composerVersion',stored."composerVersion",
    'createdAt',stored."createdAt",'currentBinding',current_binding);
END $$;

ALTER FUNCTION public.story_m4_test_narration_immutable() OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m4_test_narration_open(text,text,text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m4_test_narration_finish(text,text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_m4_test_draft_read(text,text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m4_test_narration_immutable(),public.story_m4_test_narration_open(text,text,text,text,text),
  public.story_m4_test_narration_finish(text,text,text,text),public.story_m4_test_draft_read(text,text,text,text)
  FROM PUBLIC,storyline_runtime,storyline_admission_writer,storyline_synthetic_issuer,storyline_outbox,storyline_m2_reader,
    storyline_checkpoint_worker,storyline_fake_worker,storyline_verification_issuer,storyline_m3_candidate_writer,storyline_m4_narration_reader,storyline_m4_narration_writer;
GRANT EXECUTE ON FUNCTION public.story_m4_test_narration_open(text,text,text,text,text),public.story_m4_test_narration_finish(text,text,text,text) TO storyline_m4_narration_writer;
GRANT EXECUTE ON FUNCTION public.story_m4_test_draft_read(text,text,text,text) TO storyline_m4_narration_reader;
ROLLBACK;
