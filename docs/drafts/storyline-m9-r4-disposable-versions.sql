-- R4 DISPOSABLE SYNTHETIC ONLY. After M4-03 in a newly owned test cluster.
-- Not a live migration, authentication installer, approval ledger or API.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE ROLE storyline_r4_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE storyline_r4_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Authoritative M1 reconstruction needs the existing source-reader privileges.
-- Neither role inherits the original M4 writer, issuer or checkpoint roles.
GRANT storyline_m4_narration_reader TO storyline_r4_reader,storyline_r4_writer;

CREATE TABLE public."StoryR4ProjectTenant" (
  "projectId" text PRIMARY KEY REFERENCES public."Project"(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  "tenantId" text NOT NULL CHECK ("tenantId" ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'), UNIQUE("tenantId","projectId")
);
CREATE TABLE public."StoryR4Access" (
  login text NOT NULL,"sessionId" text NOT NULL,"tenantId" text NOT NULL,"principalId" text NOT NULL,
  "projectId" text NOT NULL,"movieId" text NOT NULL,"studioId" text NOT NULL,
  "canRead" boolean NOT NULL,"canSave" boolean NOT NULL,"validUntil" timestamptz NOT NULL,
  PRIMARY KEY(login,"sessionId","projectId","movieId","studioId"),
  FOREIGN KEY("tenantId","projectId") REFERENCES public."StoryR4ProjectTenant"("tenantId","projectId") ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY("studioId","projectId","movieId") REFERENCES public."StorylineStudio"(id,"projectId","movieId") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (NOT "canSave" OR "canRead"), CHECK (isfinite("validUntil"))
);
CREATE TABLE public."StoryR4ValidationKey" (singleton boolean PRIMARY KEY CHECK(singleton),secret bytea NOT NULL CHECK(octet_length(secret)=32));
CREATE UNIQUE INDEX "StoryNarrationDraft_r4_parent_key" ON public."StoryNarrationDraft"(id,"draftHash","projectId","movieId","studioId");
CREATE TABLE public."StoryR4EditedVersion" (
  id text PRIMARY KEY,"tenantId" text NOT NULL,"principalId" text NOT NULL,
  "projectId" text NOT NULL,"movieId" text NOT NULL,"studioId" text NOT NULL,
  "originalId" text NOT NULL,"draftHash" varchar(64) NOT NULL,
  version integer NOT NULL,"expectedRevision" integer NOT NULL,"previousId" text,"previousHash" varchar(64),
  "idempotencyKey" text NOT NULL,"proposalCanonical" text NOT NULL,"proposalHash" varchar(64) NOT NULL,
  "canonicalPayload" text NOT NULL,"contentHash" varchar(64) NOT NULL,"createdAt" timestamptz NOT NULL,
  FOREIGN KEY("tenantId","projectId") REFERENCES public."StoryR4ProjectTenant"("tenantId","projectId") ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY("originalId","draftHash","projectId","movieId","studioId")
    REFERENCES public."StoryNarrationDraft"(id,"draftHash","projectId","movieId","studioId") ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE("originalId",version), UNIQUE("tenantId","principalId","projectId","movieId","studioId","idempotencyKey"),
  UNIQUE(id,"contentHash","originalId","tenantId","projectId","movieId","studioId",version),
  FOREIGN KEY("previousId","previousHash","originalId","tenantId","projectId","movieId","studioId","expectedRevision")
    REFERENCES public."StoryR4EditedVersion"(id,"contentHash","originalId","tenantId","projectId","movieId","studioId",version) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK ((version BETWEEN 1 AND 1000001 AND "expectedRevision"=version-1 AND
    ((version=1 AND "previousId" IS NULL AND "previousHash" IS NULL) OR (version>1 AND "previousId" IS NOT NULL AND "previousHash" IS NOT NULL)) AND
    octet_length(id) BETWEEN 1 AND 128 AND "idempotencyKey" ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' AND
    public.story_m1_is_hash("contentHash") AND public.story_m1_is_hash("proposalHash") AND
    octet_length("canonicalPayload") BETWEEN 2 AND 524288 AND octet_length("proposalCanonical") BETWEEN 2 AND 524288 AND
    "contentHash"=encode(sha256(convert_to('story-edited-narration-v1'||E'\n'||"canonicalPayload",'UTF8')),'hex') AND
    "proposalHash"=encode(sha256(convert_to('story-edited-narration-proposal-v1'||E'\n'||"proposalCanonical",'UTF8')),'hex') AND
    isfinite("createdAt") AND ("canonicalPayload"::jsonb->>'schemaVersion')='story-edited-narration-v1' AND
    ("canonicalPayload"::jsonb->>'origin')='SYNTHETIC_TEST_EDIT' AND
    ("canonicalPayload"::jsonb->'review')='{"humanApproval":"NONE","sourceVerified":false,"semanticReview":"NOT_REVIEWED","eligibleForTts":false,"readyForPublication":false}'::jsonb AND
    ("canonicalPayload"::jsonb->>'id',"canonicalPayload"::jsonb->>'version',"canonicalPayload"::jsonb->>'expectedRevision',
      "canonicalPayload"::jsonb->>'idempotencyKey',"canonicalPayload"::jsonb->'scope'->>'projectId',"canonicalPayload"::jsonb->'scope'->>'movieId',"canonicalPayload"::jsonb->'scope'->>'studioId',
      "canonicalPayload"::jsonb->'binding'->'original'->>'id',"canonicalPayload"::jsonb->'binding'->'original'->>'draftHash',
      "canonicalPayload"::jsonb->'editor'->>'tenantId',"canonicalPayload"::jsonb->'editor'->>'principalId',
      "canonicalPayload"::jsonb->'previousVersion'->>'id',"canonicalPayload"::jsonb->'previousVersion'->>'contentHash') IS NOT DISTINCT FROM
    (id,version::text,"expectedRevision"::text,"idempotencyKey","projectId","movieId","studioId","originalId","draftHash","tenantId","principalId","previousId","previousHash") AND
    ("canonicalPayload"::jsonb->>'createdAt')::timestamptz="createdAt"
  ) IS TRUE)
);
CREATE TABLE public."StoryR4SaveFence" (
  xid xid8 NOT NULL,pid integer NOT NULL,login text NOT NULL,challenge text NOT NULL,
  "authEnvelope" text NOT NULL,"authProof" text NOT NULL,"proposalCanonical" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(xid,pid)
);
ALTER TABLE public."StoryR4ProjectTenant" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryR4Access" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryR4ValidationKey" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryR4EditedVersion" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryR4SaveFence" OWNER TO storyline_migration_owner;
REVOKE ALL ON public."StoryR4ProjectTenant",public."StoryR4Access",public."StoryR4ValidationKey",public."StoryR4EditedVersion",public."StoryR4SaveFence" FROM PUBLIC,
  storyline_runtime,storyline_m2_reader,storyline_m3_candidate_writer,storyline_m4_narration_reader,storyline_m4_narration_writer,storyline_r4_reader,storyline_r4_writer;

CREATE FUNCTION public.story_r4_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable edited version' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "StoryR4EditedVersion_immutable" BEFORE UPDATE OR DELETE ON public."StoryR4EditedVersion" FOR EACH ROW EXECUTE FUNCTION public.story_r4_immutable();
CREATE TRIGGER "StoryR4EditedVersion_no_truncate" BEFORE TRUNCATE ON public."StoryR4EditedVersion" FOR EACH STATEMENT EXECUTE FUNCTION public.story_r4_immutable();

-- Signed authorization is transaction/backend/operation/target/proposal bound.
-- Session and tenancy maps are test-administrator-owned, not caller claims.
CREATE FUNCTION public.story_r4_authorize(auth_bytes text,proof text,save boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a jsonb; k bytea;
BEGIN
  IF auth_bytes IS NULL OR octet_length(auth_bytes) NOT BETWEEN 2 AND 8192 OR proof IS NULL OR proof !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
  SELECT secret INTO STRICT k FROM public."StoryR4ValidationKey" WHERE singleton;
  IF decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(convert_to('disposable-story-r4-auth-v1'||E'\n'||auth_bytes,'UTF8'),k,'sha256') THEN
    RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
  a:=auth_bytes::jsonb;
  IF (jsonb_typeof(a)='object' AND (SELECT count(*) FROM jsonb_object_keys(a))=11 AND
    a->>'schemaVersion'='disposable-story-r4-auth-v1' AND a->>'pid'=pg_backend_pid()::text AND
    a->>'transactionStamp'=transaction_timestamp()::text AND
    a->>'action'=ANY(CASE WHEN save THEN ARRAY['SAVE'] ELSE ARRAY['ORIGINAL','VERSION','HISTORY'] END) AND
    EXISTS(SELECT 1 FROM public."StoryR4Access" access JOIN public."StoryR4ProjectTenant" tenant USING("tenantId","projectId")
      JOIN public."StorylineStudio" studio ON (studio.id,studio."projectId",studio."movieId")=(access."studioId",access."projectId",access."movieId")
      JOIN public."Movie" movie ON movie.id=studio."movieId" AND movie."projectId"=studio."projectId"
      WHERE access.login=session_user AND access."sessionId"=a->'editor'->>'sessionId' AND access."principalId"=a->'editor'->>'principalId' AND
        access."tenantId"=a->'editor'->>'tenantId' AND access."projectId"=a->'scope'->>'projectId' AND access."movieId"=a->'scope'->>'movieId' AND
        access."studioId"=a->'scope'->>'studioId' AND access."canRead" AND (NOT save OR access."canSave") AND access."validUntil">clock_timestamp())
    ) IS NOT TRUE THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
  IF save THEN
    -- Serialize a cooperating grant revocation after the authorized save, or
    -- re-evaluate its changed row after waiting. The lock lasts through commit.
    PERFORM 1 FROM public."StoryR4Access" access WHERE access.login=session_user AND access."sessionId"=a->'editor'->>'sessionId' AND
      access."principalId"=a->'editor'->>'principalId' AND access."tenantId"=a->'editor'->>'tenantId' AND
      (access."projectId",access."movieId",access."studioId")=(a->'scope'->>'projectId',a->'scope'->>'movieId',a->'scope'->>'studioId') AND
      access."canRead" AND access."canSave" AND access."validUntil">clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN a;
END $$;

CREATE FUNCTION public.story_r4_read(auth_bytes text,proof text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a jsonb; n public."StoryNarrationDraft"%ROWTYPE; v public."StoryR4EditedVersion"%ROWTYPE;
  original jsonb; rows jsonb; head jsonb;
BEGIN
  a:=public.story_r4_authorize(auth_bytes,proof,false);
  SELECT * INTO n FROM public."StoryNarrationDraft" WHERE id=a->'original'->>'id' AND
    ("projectId","movieId","studioId")=(a->'scope'->>'projectId',a->'scope'->>'movieId',a->'scope'->>'studioId');
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','MISSING'); END IF;
  IF n."draftHash" IS DISTINCT FROM a->'original'->>'draftHash' THEN RETURN jsonb_build_object('outcome','PARENT_MISMATCH'); END IF;
  original:=public.story_m4_test_draft_read(n."projectId",n."movieId",n."studioId",n.id);
  SELECT jsonb_build_object('revision',version,'previousVersion',jsonb_build_object('id',id,'contentHash',"contentHash")) INTO head
    FROM public."StoryR4EditedVersion" WHERE "originalId"=n.id AND "tenantId"=a->'editor'->>'tenantId' ORDER BY version DESC LIMIT 1;
  head:=coalesce(head,'{"revision":0,"previousVersion":null}'::jsonb);
  IF a->>'action'='ORIGINAL' THEN RETURN jsonb_build_object('outcome','OK','original',original,'head',head); END IF;
  IF a->>'action'='VERSION' THEN
    SELECT * INTO v FROM public."StoryR4EditedVersion" WHERE id=a->>'versionId' AND "originalId"=n.id AND "tenantId"=a->'editor'->>'tenantId' AND
      ("projectId","movieId","studioId")=(n."projectId",n."movieId",n."studioId");
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome','MISSING'); END IF;
    RETURN jsonb_build_object('outcome','OK','original',original,'canonicalPayload',v."canonicalPayload",'contentHash',v."contentHash");
  END IF;
  IF (a->>'limit')::integer NOT BETWEEN 1 AND 50 OR (a->>'afterVersion')::integer NOT BETWEEN 0 AND 1000001 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(row.body ORDER BY row.version),'[]'::jsonb) INTO rows FROM (
    SELECT version,jsonb_build_object('id',id,'contentHash',"contentHash",'version',version,
      'previousVersion',CASE WHEN "previousId" IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',"previousId",'contentHash',"previousHash") END,
      'createdAt',to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'editor',jsonb_build_object('tenantId',"tenantId",'principalId',"principalId")) body
    FROM public."StoryR4EditedVersion" WHERE "originalId"=n.id AND "tenantId"=a->'editor'->>'tenantId' AND version>(a->>'afterVersion')::integer
    ORDER BY version LIMIT (a->>'limit')::integer+1) row;
  RETURN jsonb_build_object('outcome','OK','original',original,'versions',rows);
END $$;

CREATE FUNCTION public.story_r4_save_open(auth_bytes text,proof text,proposal text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a jsonb; body jsonb; n public."StoryNarrationDraft"%ROWTYPE; v public."StoryR4EditedVersion"%ROWTYPE;
  latest public."StoryR4EditedVersion"%ROWTYPE; challenge text; created text; version_id text; context jsonb;
BEGIN
  a:=public.story_r4_authorize(auth_bytes,proof,true);
  IF proposal IS NULL OR octet_length(proposal) NOT BETWEEN 2 AND 524288 OR
    a->>'proposalHash' IS DISTINCT FROM encode(sha256(convert_to('story-edited-narration-proposal-v1'||E'\n'||proposal,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Invalid proposal' USING ERRCODE='42501'; END IF;
  body:=proposal::jsonb;
  PERFORM public.story_m2_test_scope_lock(a->'scope'->>'projectId',a->'scope'->>'movieId',a->'scope'->>'studioId');
  SELECT * INTO n FROM public."StoryNarrationDraft" WHERE id=a->'original'->>'id' AND
    ("projectId","movieId","studioId")=(a->'scope'->>'projectId',a->'scope'->>'movieId',a->'scope'->>'studioId');
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','MISSING'); END IF;
  IF n."draftHash" IS DISTINCT FROM a->'original'->>'draftHash' OR body->'scope' IS DISTINCT FROM a->'scope' OR
    body->'binding' IS DISTINCT FROM jsonb_build_object('original',jsonb_build_object('id',n.id,'draftHash',n."draftHash",'payloadId',n."canonicalPayload"::jsonb->>'id'),
      'source',n."canonicalPayload"::jsonb->'source','analysis',n."canonicalPayload"::jsonb->'analysis') THEN
    RETURN jsonb_build_object('outcome','PARENT_MISMATCH'); END IF;
  context:=public.story_m4_test_narration_read(n."projectId",n."movieId",n."studioId",n."candidateId",n."candidateHash");
  IF context IS NULL THEN RETURN jsonb_build_object('outcome','SOURCE_STALE'); END IF;
  SELECT * INTO v FROM public."StoryR4EditedVersion" WHERE "tenantId"=a->'editor'->>'tenantId' AND "principalId"=a->'editor'->>'principalId' AND
    ("projectId","movieId","studioId")=(n."projectId",n."movieId",n."studioId") AND "idempotencyKey"=body->>'idempotencyKey';
  IF FOUND THEN
    IF v."proposalHash" IS DISTINCT FROM a->>'proposalHash' OR v."proposalCanonical" IS DISTINCT FROM proposal THEN RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT'); END IF;
    RETURN jsonb_build_object('outcome','REUSED','canonicalPayload',v."canonicalPayload",'contentHash',v."contentHash");
  END IF;
  SELECT * INTO latest FROM public."StoryR4EditedVersion" WHERE "originalId"=n.id ORDER BY version DESC LIMIT 1;
  IF (body->>'expectedRevision')::integer IS DISTINCT FROM coalesce(latest.version,0) OR
    body->'previousVersion' IS DISTINCT FROM (CASE WHEN latest.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',latest.id,'contentHash',latest."contentHash") END) THEN
    RETURN jsonb_build_object('outcome','REVISION_CONFLICT'); END IF;
  version_id:=gen_random_uuid()::text;
  created:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  challenge:=jsonb_build_object('domain','disposable-story-r4-save-v1','nonce',gen_random_uuid()::text,'id',version_id,'version',coalesce(latest.version,0)+1,
    'createdAt',created,'authorization',auth_bytes,'proposalHash',a->>'proposalHash','xid',pg_current_xact_id()::text,'pid',pg_backend_pid(),'login',session_user)::text;
  INSERT INTO public."StoryR4SaveFence"(xid,pid,login,challenge,"authEnvelope","authProof","proposalCanonical")
    VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,challenge,auth_bytes,proof,proposal);
  RETURN jsonb_build_object('outcome','OPEN','id',version_id,'version',coalesce(latest.version,0)+1,'createdAt',created,'challenge',challenge);
END $$;

CREATE FUNCTION public.story_r4_save_finish(payload text,content_hash text,proof text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE f public."StoryR4SaveFence"%ROWTYPE; a jsonb; b jsonb; c jsonb; k bytea; context jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public."StoryR4SaveFence" WHERE xid=pg_current_xact_id() AND pid=pg_backend_pid() AND login=session_user FOR UPDATE;
  a:=public.story_r4_authorize(f."authEnvelope",f."authProof",true);
  SELECT secret INTO STRICT k FROM public."StoryR4ValidationKey" WHERE singleton;
  IF payload IS NULL OR octet_length(payload) NOT BETWEEN 2 AND 524288 OR content_hash IS NULL OR content_hash !~ '^[a-f0-9]{64}$' OR
    content_hash IS DISTINCT FROM encode(sha256(convert_to('story-edited-narration-v1'||E'\n'||payload,'UTF8')),'hex') OR
    proof IS NULL OR proof !~ '^[a-f0-9]{64}$' OR f."createdAt"<clock_timestamp()-interval '20 seconds' OR
    decode(proof,'hex') IS DISTINCT FROM storyline_test_crypto.hmac(convert_to('disposable-story-r4-save-v1'||E'\n'||f.challenge||E'\n'||content_hash,'UTF8'),k,'sha256') THEN
    RAISE EXCEPTION 'Untrusted edited version' USING ERRCODE='42501'; END IF;
  b:=payload::jsonb; c:=f.challenge::jsonb;
  IF ((b-ARRAY['schemaVersion','origin','id','version','createdAt','editor','review'])=f."proposalCanonical"::jsonb AND
    b->>'schemaVersion'='story-edited-narration-v1' AND b->>'origin'='SYNTHETIC_TEST_EDIT' AND
    b->'editor'=((a->'editor')-'sessionId') AND (b->>'id',b->>'version',b->>'createdAt')=(c->>'id',c->>'version',c->>'createdAt') AND
    b->'review'='{"humanApproval":"NONE","sourceVerified":false,"semanticReview":"NOT_REVIEWED","eligibleForTts":false,"readyForPublication":false}'::jsonb
    ) IS NOT TRUE THEN RAISE EXCEPTION 'Invalid edited version' USING ERRCODE='23514'; END IF;
  context:=public.story_m4_test_narration_read(a->'scope'->>'projectId',a->'scope'->>'movieId',a->'scope'->>'studioId',
    b->'binding'->'analysis'->>'candidateId',b->'binding'->'analysis'->>'candidateHash');
  IF context IS NULL THEN RAISE EXCEPTION 'Stale edited version' USING ERRCODE='23514'; END IF;
  INSERT INTO public."StoryR4EditedVersion"(id,"tenantId","principalId","projectId","movieId","studioId","originalId","draftHash",version,"expectedRevision",
    "previousId","previousHash","idempotencyKey","proposalCanonical","proposalHash","canonicalPayload","contentHash","createdAt")
  VALUES(b->>'id',b->'editor'->>'tenantId',b->'editor'->>'principalId',b->'scope'->>'projectId',b->'scope'->>'movieId',b->'scope'->>'studioId',
    b->'binding'->'original'->>'id',b->'binding'->'original'->>'draftHash',(b->>'version')::integer,(b->>'expectedRevision')::integer,
    b->'previousVersion'->>'id',b->'previousVersion'->>'contentHash',b->>'idempotencyKey',f."proposalCanonical",a->>'proposalHash',payload,content_hash,(b->>'createdAt')::timestamptz);
  DELETE FROM public."StoryR4SaveFence" WHERE xid=f.xid AND pid=f.pid;
  RETURN jsonb_build_object('outcome','SAVED','canonicalPayload',payload,'contentHash',content_hash);
END $$;

ALTER FUNCTION public.story_r4_immutable() OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_r4_authorize(text,text,boolean) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_r4_read(text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_r4_save_open(text,text,text) OWNER TO storyline_migration_owner;
ALTER FUNCTION public.story_r4_save_finish(text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_r4_immutable(),public.story_r4_authorize(text,text,boolean),public.story_r4_read(text,text),
  public.story_r4_save_open(text,text,text),public.story_r4_save_finish(text,text,text) FROM PUBLIC,
  storyline_runtime,storyline_m2_reader,storyline_m3_candidate_writer,storyline_m4_narration_reader,storyline_m4_narration_writer,storyline_r4_reader,storyline_r4_writer;
GRANT EXECUTE ON FUNCTION public.story_r4_read(text,text) TO storyline_r4_reader,storyline_r4_writer;
GRANT EXECUTE ON FUNCTION public.story_r4_save_open(text,text,text),public.story_r4_save_finish(text,text,text) TO storyline_r4_writer;
ROLLBACK;
