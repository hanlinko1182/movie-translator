-- Scratch-only bootstrap, installed by a newly owned DisposableStorylinePostgres.
CREATE ROLE highlight_m602_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE highlight_m602_read NOLOGIN;
CREATE ROLE highlight_m602_create NOLOGIN;
CREATE SCHEMA highlight_m602 AUTHORIZATION highlight_m602_owner;
CREATE SCHEMA highlight_m602_crypto;
CREATE EXTENSION pgcrypto WITH SCHEMA highlight_m602_crypto;
GRANT USAGE ON SCHEMA highlight_m602_crypto TO highlight_m602_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SET ROLE highlight_m602_owner;
SET search_path=pg_catalog,highlight_m602,pg_temp;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE FUNCTION highlight_m602.canonical(j jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
DECLARE result text; BEGIN
 CASE jsonb_typeof(j)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_json(k)::text||':'||highlight_m602.canonical(v),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(j) e(k,v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(highlight_m602.canonical(v),',' ORDER BY i),'')||']' INTO result FROM jsonb_array_elements(j) WITH ORDINALITY e(v,i);
 ELSE result:=j::text; END CASE; RETURN result;
END $$;
CREATE FUNCTION highlight_m602.digest(d text,j jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
 SELECT encode(highlight_m602_crypto.digest(convert_to(d||chr(10)||highlight_m602.canonical(j),'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION highlight_m602.keys(j jsonb,k text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
 SELECT jsonb_typeof(j)='object' AND (SELECT array_agg(x ORDER BY x COLLATE "C") FROM jsonb_object_keys(j) x)=(SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(k) x)
$$;
CREATE TABLE highlight_m602.tenant(id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'));
CREATE TABLE highlight_m602.principal(tenant text NOT NULL REFERENCES highlight_m602.tenant,id text NOT NULL,PRIMARY KEY(tenant,id));
CREATE TABLE highlight_m602.scope(tenant text NOT NULL REFERENCES highlight_m602.tenant,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(tenant,project,movie,studio));
CREATE TABLE highlight_m602.session(tenant text NOT NULL,id text NOT NULL,principal text NOT NULL,csrf_hash text NOT NULL CHECK(csrf_hash ~ '^[a-f0-9]{64}$'),origin text NOT NULL,
 expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,principal) REFERENCES highlight_m602.principal);
CREATE TABLE highlight_m602.access_grant(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,principal text NOT NULL,
 can_read boolean NOT NULL,can_create boolean NOT NULL CHECK(NOT can_create OR can_read),
 PRIMARY KEY(tenant,project,movie,studio,principal),FOREIGN KEY(tenant,project,movie,studio) REFERENCES highlight_m602.scope,FOREIGN KEY(tenant,principal) REFERENCES highlight_m602.principal);
CREATE TABLE highlight_m602.proof_key(action text PRIMARY KEY CHECK(action IN('read','create')),login name NOT NULL UNIQUE,secret bytea NOT NULL CHECK(octet_length(secret)=32),enabled boolean NOT NULL DEFAULT true);
CREATE TABLE highlight_m602.used_proof(nonce text PRIMARY KEY CHECK(nonce ~ '^[a-f0-9]{48}$'),tenant text NOT NULL,session_id text NOT NULL,expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant,session_id) REFERENCES highlight_m602.session);
CREATE TABLE highlight_m602.policy(version text PRIMARY KEY,rubric text NOT NULL,enabled boolean NOT NULL DEFAULT true);
INSERT INTO highlight_m602.policy VALUES('story-highlight-policy-v1','story-highlight-rubric-v1',true);
CREATE TABLE highlight_m602.source_snapshot(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,value jsonb NOT NULL CHECK(octet_length(value::text)<=16777216),
 PRIMARY KEY(tenant,project,movie,studio,id),FOREIGN KEY(tenant,project,movie,studio) REFERENCES highlight_m602.scope);
CREATE TABLE highlight_m602.analysis_snapshot(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,source_id text NOT NULL,value jsonb NOT NULL CHECK(octet_length(value::text)<=4194304),
 PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,id,source_id),FOREIGN KEY(tenant,project,movie,studio,source_id) REFERENCES highlight_m602.source_snapshot);
CREATE TABLE highlight_m602.narration_snapshot(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,analysis_id text NOT NULL,value jsonb NOT NULL CHECK(octet_length(value::text)<=2097152),
 PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,id,analysis_id),FOREIGN KEY(tenant,project,movie,studio,analysis_id) REFERENCES highlight_m602.analysis_snapshot);
CREATE TABLE highlight_m602.dependency(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,source_id text NOT NULL,analysis_id text NOT NULL,narration_id text NOT NULL,
 source_reference jsonb NOT NULL CHECK(octet_length(source_reference::text)<=65536),hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant,project,movie,studio,id),FOREIGN KEY(tenant,project,movie,studio,analysis_id,source_id) REFERENCES highlight_m602.analysis_snapshot(tenant,project,movie,studio,id,source_id),
 FOREIGN KEY(tenant,project,movie,studio,narration_id,analysis_id) REFERENCES highlight_m602.narration_snapshot(tenant,project,movie,studio,id,analysis_id));
CREATE TABLE highlight_m602.current_dependency(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,dependency_id text NOT NULL,observed_reference jsonb NOT NULL CHECK(octet_length(observed_reference::text)<=65536),
 PRIMARY KEY(tenant,project,movie,studio),FOREIGN KEY(tenant,project,movie,studio,dependency_id) REFERENCES highlight_m602.dependency(tenant,project,movie,studio,id));
CREATE TABLE highlight_m602.reservation(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,key text NOT NULL CHECK(length(key) BETWEEN 1 AND 128),
 proposal jsonb NOT NULL CHECK(octet_length(proposal::text)<=3145728),proposal_hash text NOT NULL CHECK(proposal_hash ~ '^[a-f0-9]{64}$'),dependency_id text NOT NULL,
 actor text NOT NULL,session_id text NOT NULL,created_at text NOT NULL,challenge text NOT NULL,backend int NOT NULL,tx text NOT NULL,
 PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,key),
 FOREIGN KEY(tenant,project,movie,studio,dependency_id) REFERENCES highlight_m602.dependency(tenant,project,movie,studio,id),FOREIGN KEY(tenant,session_id) REFERENCES highlight_m602.session,
 FOREIGN KEY(tenant,actor) REFERENCES highlight_m602.principal);
CREATE TABLE highlight_m602.version(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,version int NOT NULL CHECK(version BETWEEN 1 AND 1000000),
 previous_id text,dependency_id text NOT NULL,reservation_id text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=3145728),hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,version),UNIQUE(tenant,project,movie,studio,reservation_id),
 CHECK((version=1)=(previous_id IS NULL)),FOREIGN KEY(tenant,project,movie,studio,previous_id) REFERENCES highlight_m602.version(tenant,project,movie,studio,id),
 FOREIGN KEY(tenant,project,movie,studio,dependency_id) REFERENCES highlight_m602.dependency(tenant,project,movie,studio,id),
 FOREIGN KEY(tenant,project,movie,studio,reservation_id) REFERENCES highlight_m602.reservation(tenant,project,movie,studio,id));
CREATE TABLE highlight_m602.repository_head(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,revision int NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 1000000),id text,
 PRIMARY KEY(tenant,project,movie,studio),CHECK((revision=0)=(id IS NULL)),FOREIGN KEY(tenant,project,movie,studio) REFERENCES highlight_m602.scope,
 FOREIGN KEY(tenant,project,movie,studio,id) REFERENCES highlight_m602.version);
CREATE TABLE highlight_m602.audit_event(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,version_id text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536),hash text NOT NULL,
 PRIMARY KEY(tenant,project,movie,studio,version_id),FOREIGN KEY(tenant,project,movie,studio,version_id) REFERENCES highlight_m602.version(tenant,project,movie,studio,id));
CREATE FUNCTION highlight_m602.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,highlight_m602,pg_temp AS $$ BEGIN RAISE EXCEPTION 'H602_IMMUTABLE'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['source_snapshot','analysis_snapshot','narration_snapshot','dependency','reservation','version','audit_event'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON highlight_m602.%I FOR EACH ROW EXECUTE FUNCTION highlight_m602.immutable()',t);
 EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON highlight_m602.%I FOR EACH STATEMENT EXECUTE FUNCTION highlight_m602.immutable()',t);
END LOOP; END $$;
CREATE FUNCTION highlight_m602.load_dependency(t text,p text,m text,s text,d text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
 SELECT jsonb_build_object('id',x.id,'hash',x.hash,'scope',jsonb_build_object('tenantId',x.tenant,'projectId',x.project,'movieId',x.movie,'studioId',x.studio),'capture',jsonb_build_object('schemaVersion','story-highlight-synthetic-capture-v1','execution','SYNTHETIC_ONLY',
 'context',a.value||jsonb_build_object('source',src.value),'original',n.value->'original','storedOriginal',n.value->'storedOriginal','edit',n.value->'edit','current',x.source_reference))
 FROM highlight_m602.dependency x JOIN highlight_m602.source_snapshot src ON (src.tenant,src.project,src.movie,src.studio,src.id)=(x.tenant,x.project,x.movie,x.studio,x.source_id)
 JOIN highlight_m602.analysis_snapshot a ON (a.tenant,a.project,a.movie,a.studio,a.id,a.source_id)=(x.tenant,x.project,x.movie,x.studio,x.analysis_id,x.source_id)
 JOIN highlight_m602.narration_snapshot n ON (n.tenant,n.project,n.movie,n.studio,n.id,n.analysis_id)=(x.tenant,x.project,x.movie,x.studio,x.narration_id,x.analysis_id)
 WHERE (x.tenant,x.project,x.movie,x.studio,x.id)=(t,p,m,s,d)
$$;
CREATE FUNCTION highlight_m602.identity(v highlight_m602.version) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
 SELECT CASE WHEN v.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',v.id,'recordHash',v.hash,'planHash',v.plan_hash,'version',v.version) END
$$;
CREATE FUNCTION highlight_m602.version_view(t text,p text,m text,s text,vid text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
DECLARE v highlight_m602.version; parent highlight_m602.version; r highlight_m602.reservation; a highlight_m602.audit_event; c highlight_m602.current_dependency; d jsonb;
BEGIN
 SELECT * INTO v FROM highlight_m602.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,vid); IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM highlight_m602.reservation WHERE (tenant,project,movie,studio,id)=(t,p,m,s,v.reservation_id);
 SELECT * INTO parent FROM highlight_m602.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,v.previous_id);
 SELECT * INTO a FROM highlight_m602.audit_event WHERE (tenant,project,movie,studio,version_id)=(t,p,m,s,vid);
 SELECT * INTO c FROM highlight_m602.current_dependency WHERE (tenant,project,movie,studio)=(t,p,m,s);
 d:=highlight_m602.load_dependency(t,p,m,s,v.dependency_id);
 RETURN jsonb_build_object('identity',highlight_m602.identity(v),'record',v.payload,'recordHash',v.hash,'proposal',r.proposal,'dependency',d,'parent',highlight_m602.identity(parent),'audit',a.payload,'auditHash',a.hash,
 'current',c.dependency_id=v.dependency_id AND c.observed_reference=d->'capture'->'current' AND EXISTS(SELECT 1 FROM highlight_m602.policy WHERE version='story-highlight-policy-v1' AND rubric='story-highlight-rubric-v1' AND enabled));
END $$;
CREATE FUNCTION highlight_m602.complete_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
DECLARE v highlight_m602.version; BEGIN
 SELECT * INTO v FROM highlight_m602.version WHERE (tenant,project,movie,studio,reservation_id)=(NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id);
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM highlight_m602.audit_event WHERE (tenant,project,movie,studio,version_id)=(NEW.tenant,NEW.project,NEW.movie,NEW.studio,v.id)) THEN RAISE EXCEPTION 'H602_INCOMPLETE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM highlight_m602.session s JOIN highlight_m602.access_grant g ON (g.tenant,g.principal)=(s.tenant,s.principal)
 JOIN highlight_m602.scope c ON (c.tenant,c.project,c.movie,c.studio)=(g.tenant,g.project,g.movie,g.studio)
 WHERE (s.tenant,s.id,s.principal)=(NEW.tenant,NEW.session_id,NEW.actor) AND (g.project,g.movie,g.studio)=(NEW.project,NEW.movie,NEW.studio) AND NOT s.revoked AND s.expires_at>clock_timestamp() AND g.can_read AND g.can_create AND c.enabled)
 THEN RAISE EXCEPTION 'H602_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM highlight_m602.current_dependency c JOIN highlight_m602.dependency d ON (d.tenant,d.project,d.movie,d.studio,d.id)=(c.tenant,c.project,c.movie,c.studio,c.dependency_id)
 WHERE (c.tenant,c.project,c.movie,c.studio,c.dependency_id)=(NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.dependency_id) AND c.observed_reference=d.source_reference) THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservation_complete AFTER INSERT ON highlight_m602.reservation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highlight_m602.complete_reservation();
CREATE FUNCTION highlight_m602.gateway(action text,wire text,mac text,body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,highlight_m602,pg_temp AS $$
DECLARE w jsonb; b jsonb; sc jsonb; k highlight_m602.proof_key; sess highlight_m602.session; g highlight_m602.access_grant; c highlight_m602.current_dependency; h highlight_m602.repository_head;
 r highlight_m602.reservation; v highlight_m602.version; parent highlight_m602.version; d jsonb; proposed jsonb; expected jsonb; audit jsonb;
 t text;p text;m text;s text;op text; nowms bigint; affected int; entries jsonb; lim int; policy_enabled boolean;
BEGIN
 IF octet_length(wire)>8192 OR octet_length(body)>3145728 THEN RAISE EXCEPTION 'H602_PROOF_INVALID'; END IF;
 w:=wire::jsonb;b:=body::jsonb;op:=b->>'op';sc:=w->'scope';
 IF highlight_m602.keys(w,ARRAY['schemaVersion','scope','sessionId','principalId','action','payloadHash','nonce','pid','transactionId','expiresAtMs','origin','csrfHash','method','fetchSite']) IS NOT TRUE
 OR highlight_m602.keys(sc,ARRAY['tenantId','projectId','movieId','studioId']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_PROOF_INVALID'; END IF;
 t:=sc->>'tenantId';p:=sc->>'projectId';m:=sc->>'movieId';s:=sc->>'studioId';
 SELECT * INTO k FROM highlight_m602.proof_key WHERE proof_key.action=gateway.action AND login=session_user AND enabled FOR SHARE;
 IF NOT FOUND OR w->>'schemaVersion' IS DISTINCT FROM 'disposable-highlight-m602-authorization-v1' OR w->>'action' IS DISTINCT FROM action OR mac !~ '^[a-f0-9]{64}$'
 OR encode(highlight_m602_crypto.hmac(convert_to(wire,'UTF8'),k.secret,'sha256'),'hex') IS DISTINCT FROM mac
 OR (w->>'pid')::int IS DISTINCT FROM pg_backend_pid() OR w->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR w->>'payloadHash' IS DISTINCT FROM encode(highlight_m602_crypto.digest(convert_to(body,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'H602_PROOF_INVALID'; END IF;
 -- Lock order: action key, scope, session, exact principal grant, policy,
 -- current-dependency observation, repository head. Writers lock those same rows.
 PERFORM 1 FROM highlight_m602.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'H602_FORBIDDEN'; END IF;
 SELECT * INTO sess FROM highlight_m602.session WHERE (tenant,id,principal)=(t,w->>'sessionId',w->>'principalId') FOR SHARE;
 SELECT * INTO g FROM highlight_m602.access_grant WHERE (tenant,project,movie,studio,principal)=(t,p,m,s,w->>'principalId') FOR SHARE;
 nowms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF sess.id IS NULL OR g.principal IS NULL OR sess.revoked OR sess.expires_at<=clock_timestamp() OR NOT g.can_read OR action='create' AND NOT g.can_create
 OR w->>'origin' IS DISTINCT FROM sess.origin OR w->>'csrfHash' IS DISTINCT FROM sess.csrf_hash OR w->>'fetchSite' IS DISTINCT FROM 'same-origin'
 OR w->>'method' IS DISTINCT FROM (CASE WHEN action='create' THEN 'POST' ELSE 'GET' END)
 OR w->>'expiresAtMs' IS NULL OR (w->>'expiresAtMs')::bigint<=nowms OR (w->>'expiresAtMs')::bigint>nowms+5000 THEN RAISE EXCEPTION 'H602_FORBIDDEN'; END IF;
 SELECT enabled INTO policy_enabled FROM highlight_m602.policy WHERE version='story-highlight-policy-v1' AND rubric='story-highlight-rubric-v1' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
 SELECT * INTO c FROM highlight_m602.current_dependency WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
 DELETE FROM highlight_m602.used_proof WHERE expires_at<clock_timestamp();
 IF (SELECT count(*) FROM highlight_m602.used_proof)>=10000 THEN RAISE EXCEPTION 'H602_PROOF_INVALID'; END IF;
 INSERT INTO highlight_m602.used_proof VALUES(w->>'nonce',t,sess.id,to_timestamp((w->>'expiresAtMs')::bigint/1000.0));
 IF op='capture' THEN
  IF highlight_m602.keys(b,ARRAY['op','key','proposalHash']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  IF action='create' THEN
   SELECT * INTO r FROM highlight_m602.reservation WHERE (tenant,project,movie,studio,key)=(t,p,m,s,b->>'key');
   IF FOUND AND r.proposal_hash IS DISTINCT FROM b->>'proposalHash' THEN RAISE EXCEPTION 'H602_IDEMPOTENCY_CONFLICT'; END IF;
  END IF;
  IF NOT policy_enabled AND r.id IS NULL THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
  d:=highlight_m602.load_dependency(t,p,m,s,coalesce(r.dependency_id,c.dependency_id));
  RETURN jsonb_build_object('dependency',d,'reused',r.id IS NOT NULL,'current',r.id IS NOT NULL OR c.observed_reference=d->'capture'->'current');
 ELSIF action='read' AND op='version' THEN
  IF highlight_m602.keys(b,ARRAY['op','id']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  RETURN highlight_m602.version_view(t,p,m,s,b->>'id');
 ELSIF action='read' AND op='head' THEN
  IF highlight_m602.keys(b,ARRAY['op']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  SELECT * INTO h FROM highlight_m602.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s);
  RETURN jsonb_build_object('revision',h.revision,'head',highlight_m602.version_view(t,p,m,s,h.id));
 ELSIF action='read' AND op='history' THEN
  IF highlight_m602.keys(b,ARRAY['op','afterVersion','limit']) IS NOT TRUE OR b->>'limit' IS NULL OR b->>'afterVersion' IS NULL OR (b->>'limit')::int NOT BETWEEN 1 AND 5 OR (b->>'afterVersion')::int NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  lim:=(b->>'limit')::int;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'version')::int),'[]'::jsonb) INTO entries FROM
   (SELECT jsonb_build_object('id',id,'version',version) x FROM highlight_m602.version WHERE (tenant,project,movie,studio)=(t,p,m,s) AND version>(b->>'afterVersion')::int ORDER BY version LIMIT lim+1) q;
  RETURN entries;
 ELSIF action='read' AND op='operation' THEN
  IF highlight_m602.keys(b,ARRAY['op','key','proposalHash']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  SELECT * INTO r FROM highlight_m602.reservation WHERE (tenant,project,movie,studio,key)=(t,p,m,s,b->>'key');
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.proposal_hash IS DISTINCT FROM b->>'proposalHash' THEN RAISE EXCEPTION 'H602_IDEMPOTENCY_CONFLICT'; END IF;
  SELECT * INTO v FROM highlight_m602.version WHERE (tenant,project,movie,studio,reservation_id)=(t,p,m,s,r.id);
  RETURN highlight_m602.version_view(t,p,m,s,v.id);
 ELSIF action='create' AND op='reserve' THEN
  IF highlight_m602.keys(b,ARRAY['op','proposal','proposalHash','dependencyId','dependencyHash']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  proposed:=b->'proposal';
  IF highlight_m602.keys(proposed,ARRAY['schemaVersion','scope','idempotencyKey','expectedRevision','previous','plan']) IS NOT TRUE OR proposed->>'schemaVersion' IS DISTINCT FROM 'story-highlight-save-proposal-v1'
   OR proposed->'scope' IS DISTINCT FROM sc OR highlight_m602.digest('story-highlight-save-proposal-v1',proposed) IS DISTINCT FROM b->>'proposalHash' THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  IF proposed->>'expectedRevision' IS NULL OR (proposed->>'expectedRevision') !~ '^(0|[1-9][0-9]{0,5})$' OR proposed->>'idempotencyKey' IS NULL
   OR (proposed->>'idempotencyKey') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  SELECT * INTO h FROM highlight_m602.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'H602_FORBIDDEN'; END IF;
  SELECT * INTO r FROM highlight_m602.reservation WHERE (tenant,project,movie,studio,key)=(t,p,m,s,proposed->>'idempotencyKey');
  IF FOUND THEN
   IF r.proposal_hash IS DISTINCT FROM b->>'proposalHash' OR r.proposal IS DISTINCT FROM proposed THEN RAISE EXCEPTION 'H602_IDEMPOTENCY_CONFLICT'; END IF;
   SELECT * INTO v FROM highlight_m602.version WHERE (tenant,project,movie,studio,reservation_id)=(t,p,m,s,r.id);
   IF v.id IS NULL THEN RAISE EXCEPTION 'H602_PROOF_INVALID'; END IF;
   RETURN jsonb_build_object('status','REUSED','id',v.id);
  END IF;
  IF NOT policy_enabled THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
  d:=highlight_m602.load_dependency(t,p,m,s,c.dependency_id);
  IF c.dependency_id IS DISTINCT FROM b->>'dependencyId' OR d->>'hash' IS DISTINCT FROM b->>'dependencyHash' OR c.observed_reference IS DISTINCT FROM d->'capture'->'current'
   OR proposed->'plan'->'plan'->'input'->'source' IS DISTINCT FROM d->'capture'->'current' THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
  IF (proposed->>'expectedRevision')::int<>h.revision THEN RAISE EXCEPTION 'H602_REVISION_CONFLICT'; END IF;
  SELECT * INTO parent FROM highlight_m602.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,h.id);
  IF proposed->'previous' IS DISTINCT FROM highlight_m602.identity(parent) THEN RAISE EXCEPTION 'H602_REVISION_CONFLICT'; END IF;
  IF h.revision>=1000000 OR proposed->'plan'->>'planHash' IS DISTINCT FROM highlight_m602.digest('story-highlight-plan-v1',proposed->'plan'->'plan')
   OR proposed->'plan'->'plan'->'input'->'policy'->>'schemaVersion' IS DISTINCT FROM 'story-highlight-policy-v1'
   OR proposed->'plan'->'plan'->'input'->'policy'->>'rubricVersion' IS DISTINCT FROM 'story-highlight-rubric-v1' THEN RAISE EXCEPTION 'H602_INVALID_PLAN'; END IF;
  INSERT INTO highlight_m602.reservation VALUES(t,p,m,s,'reservation-'||encode(highlight_m602_crypto.gen_random_bytes(16),'hex'),proposed->>'idempotencyKey',proposed,b->>'proposalHash',c.dependency_id,
   sess.principal,sess.id,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),encode(highlight_m602_crypto.gen_random_bytes(32),'hex'),pg_backend_pid(),pg_current_xact_id()::text) RETURNING * INTO r;
  RETURN jsonb_build_object('status','OPEN','id',r.id,'version',h.revision+1,'createdAt',r.created_at,'challenge',r.challenge,'dependencyId',r.dependency_id,'dependencyHash',d->>'hash');
 ELSIF action='create' AND op='finish' THEN
  IF highlight_m602.keys(b,ARRAY['op','reservationId','record','recordHash','validationProof']) IS NOT TRUE THEN RAISE EXCEPTION 'H602_INVALID_INPUT'; END IF;
  SELECT * INTO r FROM highlight_m602.reservation WHERE (tenant,project,movie,studio,id)=(t,p,m,s,b->>'reservationId') FOR UPDATE;
  IF NOT FOUND OR r.backend<>pg_backend_pid() OR r.tx<>pg_current_xact_id()::text OR r.actor<>sess.principal OR r.session_id<>sess.id THEN RAISE EXCEPTION 'H602_PROOF_INVALID'; END IF;
  d:=highlight_m602.load_dependency(t,p,m,s,r.dependency_id);
  IF NOT policy_enabled OR c.dependency_id<>r.dependency_id OR c.observed_reference IS DISTINCT FROM d->'capture'->'current' THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
  SELECT * INTO h FROM highlight_m602.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR UPDATE;
  IF h.revision<>(r.proposal->>'expectedRevision')::int THEN RAISE EXCEPTION 'H602_REVISION_CONFLICT'; END IF;
  expected:=jsonb_build_object('schemaVersion','story-highlight-saved-record-v1','scope',sc,'id',r.id,'version',h.revision+1,'previous',r.proposal->'previous','expectedRevision',h.revision,
   'idempotencyKey',r.key,'proposalHash',r.proposal_hash,'dependencyId',r.dependency_id,'dependencyHash',d->>'hash','createdAt',r.created_at,
   'editor',jsonb_build_object('principalId',sess.principal,'sessionId',sess.id),'plan',r.proposal->'plan',
   'restrictions','{"execution":"SYNTHETIC_ONLY","storage":"DISPOSABLE_POSTGRES_ONLY","humanApproval":"NONE","sourceVerified":false,"eligibleForRealTts":false,"eligibleForPublication":false,"originalMovieAudio":"EXCLUDED","voiceSynchronization":"UNSUPPORTED"}'::jsonb);
  IF b->'record' IS DISTINCT FROM expected OR b->>'recordHash' IS DISTINCT FROM highlight_m602.digest('story-highlight-saved-record-v1',expected)
   OR b->>'validationProof' IS DISTINCT FROM encode(highlight_m602_crypto.hmac(convert_to('story-highlight-currentness-fence-v1'||chr(10)||highlight_m602.canonical(jsonb_build_object(
    'schemaVersion','story-highlight-currentness-fence-v1','scope',sc,'reservationId',r.id,'challenge',r.challenge,'recordHash',b->>'recordHash','dependencyHash',d->>'hash','backendPid',pg_backend_pid(),'transactionId',pg_current_xact_id()::text)),'UTF8'),k.secret,'sha256'),'hex') THEN RAISE EXCEPTION 'H602_INVALID_PLAN'; END IF;
  INSERT INTO highlight_m602.version VALUES(t,p,m,s,r.id,h.revision+1,h.id,r.dependency_id,r.id,expected,b->>'recordHash',r.proposal->'plan'->>'planHash');
  UPDATE highlight_m602.repository_head SET revision=h.revision+1,id=r.id WHERE (tenant,project,movie,studio)=(t,p,m,s) AND revision=h.revision AND id IS NOT DISTINCT FROM h.id;
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'H602_REVISION_CONFLICT'; END IF;
  audit:=jsonb_build_object('schemaVersion','story-highlight-save-audit-v1','scope',sc,'versionId',r.id,'version',h.revision+1,'previous',r.proposal->'previous',
   'recordHash',b->>'recordHash','proposalHash',r.proposal_hash,'dependencyId',r.dependency_id,'dependencyHash',d->>'hash','actor',expected->'editor','createdAt',r.created_at,'action','SAVE_HIGHLIGHT_VERSION');
  INSERT INTO highlight_m602.audit_event VALUES(t,p,m,s,r.id,audit,highlight_m602.digest('story-highlight-save-audit-v1',audit));
  RETURN jsonb_build_object('status','SAVED','id',r.id);
 ELSIF action='create' AND op='seal' THEN
  IF NOT policy_enabled OR highlight_m602.keys(b,ARRAY['op','id']) IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM highlight_m602.version saved JOIN highlight_m602.dependency dep ON (dep.tenant,dep.project,dep.movie,dep.studio,dep.id)=(saved.tenant,saved.project,saved.movie,saved.studio,saved.dependency_id)
   WHERE (saved.tenant,saved.project,saved.movie,saved.studio,saved.id)=(t,p,m,s,b->>'id') AND c.dependency_id=saved.dependency_id AND c.observed_reference=dep.source_reference) THEN RAISE EXCEPTION 'H602_STALE_SOURCE'; END IF;
  RETURN '{"sealed":true}';
 END IF;
 RAISE EXCEPTION 'H602_INVALID_INPUT';
END $$;
CREATE FUNCTION highlight_m602.read(w text,m text,p text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,highlight_m602,pg_temp AS $$ SELECT highlight_m602.gateway('read',w,m,p) $$;
CREATE FUNCTION highlight_m602.create(w text,m text,p text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,highlight_m602,pg_temp AS $$ SELECT highlight_m602.gateway('create',w,m,p) $$;
REVOKE ALL ON ALL TABLES IN SCHEMA highlight_m602 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA highlight_m602 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA highlight_m602 FROM PUBLIC;
GRANT USAGE ON SCHEMA highlight_m602 TO highlight_m602_read,highlight_m602_create;
GRANT EXECUTE ON FUNCTION highlight_m602.read(text,text,text) TO highlight_m602_read;
GRANT EXECUTE ON FUNCTION highlight_m602.create(text,text,text) TO highlight_m602_create;
RESET ROLE;
