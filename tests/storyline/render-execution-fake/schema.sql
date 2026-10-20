-- M8-03 scratch fixture only. Never a production migration.
CREATE ROLE execution_m803_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA execution_m803 AUTHORIZATION execution_m803_owner;
GRANT USAGE ON SCHEMA timeline_m702,highlight_m602,highlight_m602_crypto TO execution_m803_owner;
GRANT SELECT ON timeline_m702.scope,timeline_m702.session,timeline_m702.access_grant,timeline_m702.policy,timeline_m702.repository_head,timeline_m702.version,timeline_m702.reservation,timeline_m702.audit_event,timeline_m702.dependency TO execution_m803_owner;
GRANT UPDATE ON timeline_m702.scope,timeline_m702.session,timeline_m702.access_grant,timeline_m702.policy,timeline_m702.repository_head TO execution_m803_owner;
GRANT SELECT ON highlight_m602.scope,highlight_m602.session,highlight_m602.access_grant,highlight_m602.policy,highlight_m602.current_dependency,highlight_m602.repository_head TO execution_m803_owner;
GRANT UPDATE ON highlight_m602.scope,highlight_m602.session,highlight_m602.access_grant,highlight_m602.policy,highlight_m602.current_dependency,highlight_m602.repository_head TO execution_m803_owner;
GRANT SELECT ON highlight_m602.version,highlight_m602.reservation,highlight_m602.audit_event,highlight_m602.dependency,highlight_m602.source_snapshot,highlight_m602.analysis_snapshot,highlight_m602.narration_snapshot TO execution_m803_owner;
GRANT EXECUTE ON FUNCTION highlight_m602.load_dependency(text,text,text,text,text),highlight_m602.version_view(text,text,text,text,text),highlight_m602.identity(highlight_m602.version) TO execution_m803_owner;
GRANT EXECUTE ON FUNCTION timeline_m702.canonical(jsonb),timeline_m702.digest(text,jsonb),timeline_m702.keys(jsonb,text[]),timeline_m702.version_view(text,text,text,text,text),timeline_m702.load_dependency(text,text,text,text,text),timeline_m702.m6_snapshot(text,text,text,text,text),timeline_m702.identity(timeline_m702.version),timeline_m702.current_observation(text,text,text,text,text),timeline_m702.m6_current(text,text,text,text,text) TO execution_m803_owner;
-- Calls above are private, invoker-right helpers only. New logins receive no such grants.
SET ROLE execution_m803_owner;
SET search_path=pg_catalog,execution_m803,pg_temp;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE FUNCTION execution_m803.canonical(j jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,execution_m803,pg_temp AS $$ SELECT timeline_m702.canonical(j) $$;
CREATE FUNCTION execution_m803.digest(d text,j jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,execution_m803,pg_temp AS $$ SELECT timeline_m702.digest(d,j) $$;
CREATE FUNCTION execution_m803.profile_hash() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,execution_m803,pg_temp AS $$ SELECT execution_m803.digest('story-recap-execution-profile-v1','{"implementation":"IN_MEMORY_FAKE_V1","media":"SIMULATED_NOT_MEDIA","concurrency":1,"sourceBytes":1048576,"outputBytes":1048576,"measurements":{"codec":"NOT_MEASURED","frames":"NOT_MEASURED","duration":"NOT_MEASURED","streams":"NOT_MEASURED"}}'::jsonb) $$;
CREATE TABLE execution_m803.fixture(namespace text PRIMARY KEY, operations int NOT NULL DEFAULT 0 CHECK(operations BETWEEN 0 AND 16), bytes_reserved int NOT NULL DEFAULT 0 CHECK(bytes_reserved BETWEEN 0 AND 29360128), versions int NOT NULL DEFAULT 0 CHECK(versions BETWEEN 0 AND 32),active text);
CREATE TABLE execution_m803.scope(namespace text NOT NULL REFERENCES execution_m803.fixture,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(namespace,tenant,project,movie,studio));
CREATE TABLE execution_m803.session(namespace text NOT NULL REFERENCES execution_m803.fixture,tenant text NOT NULL,id text NOT NULL,principal text NOT NULL,csrf_hash text NOT NULL,origin text NOT NULL,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,PRIMARY KEY(namespace,tenant,id),UNIQUE(namespace,tenant,id,principal));
CREATE TABLE execution_m803.access_grant(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,principal text NOT NULL,actions text[] NOT NULL,PRIMARY KEY(namespace,tenant,project,movie,studio,principal),FOREIGN KEY(namespace,tenant,project,movie,studio) REFERENCES execution_m803.scope);
CREATE TABLE execution_m803.proof_key(action text PRIMARY KEY,login name NOT NULL UNIQUE,secret bytea NOT NULL CHECK(octet_length(secret)=32),enabled boolean NOT NULL DEFAULT true);
CREATE TABLE execution_m803.used_proof(nonce text PRIMARY KEY CHECK(nonce~'^[a-f0-9]{48}$'),namespace text NOT NULL,tenant text NOT NULL,session_id text NOT NULL,FOREIGN KEY(namespace,tenant,session_id) REFERENCES execution_m803.session);
CREATE TABLE execution_m803.source(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,hash text NOT NULL CHECK(hash~'^[a-f0-9]{64}$'),binding jsonb NOT NULL,input jsonb NOT NULL,recipe jsonb NOT NULL,manifest jsonb NOT NULL,profile jsonb NOT NULL,expires_at timestamptz NOT NULL,enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(namespace,tenant,project,movie,studio,hash),FOREIGN KEY(namespace,tenant,project,movie,studio) REFERENCES execution_m803.scope);
CREATE TABLE execution_m803.work(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,work_hash text NOT NULL,source_hash text NOT NULL,request jsonb NOT NULL CHECK(octet_length(request::text)<=2097152),admission jsonb NOT NULL,submission jsonb NOT NULL,stage jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(namespace,tenant,project,movie,studio,id),UNIQUE(namespace,tenant,project,movie,studio,work_hash),FOREIGN KEY(namespace,tenant,project,movie,studio,source_hash) REFERENCES execution_m803.source);
CREATE TABLE execution_m803.key_slot(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,key text NOT NULL,request_hash text NOT NULL,operation_id text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,key),FOREIGN KEY(namespace,tenant,project,movie,studio,operation_id) REFERENCES execution_m803.work);
CREATE TABLE execution_m803.state(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,revision int NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 1000000),owner_generation int NOT NULL DEFAULT 1 CHECK(owner_generation BETWEEN 1 AND 1000000),state text NOT NULL DEFAULT 'RESERVED' CHECK(state IN('RESERVED','CHECKPOINTED','UNKNOWN','SUCCESS','FAILURE','CANCELLED')),availability text NOT NULL DEFAULT 'ABSENT' CHECK(availability IN('ABSENT','AVAILABLE','QUARANTINED','DELETE_PENDING','DELETED')),cancelled boolean NOT NULL DEFAULT false,quarantine_hold boolean NOT NULL DEFAULT false,source_hold boolean NOT NULL DEFAULT true,retain_until timestamptz NOT NULL DEFAULT clock_timestamp(),last_session text NOT NULL,last_principal text NOT NULL,deadline timestamptz NOT NULL,require_current boolean NOT NULL DEFAULT true,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id),FOREIGN KEY(namespace,tenant,project,movie,studio,id) REFERENCES execution_m803.work,FOREIGN KEY(namespace,tenant,last_session,last_principal) REFERENCES execution_m803.session(namespace,tenant,id,principal));
CREATE TABLE execution_m803.fact(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,operation_id text NOT NULL,kind text NOT NULL CHECK(kind IN('checkpoint','result','verification','artifact')),payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536),hash text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,operation_id,kind),FOREIGN KEY(namespace,tenant,project,movie,studio,operation_id) REFERENCES execution_m803.work);
CREATE TABLE execution_m803.audit_event(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,operation_id text NOT NULL,revision int NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,operation_id,revision),FOREIGN KEY(namespace,tenant,project,movie,studio,operation_id) REFERENCES execution_m803.work);
CREATE TABLE execution_m803.read_hold(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,operation_id text NOT NULL,id text NOT NULL,session_id text NOT NULL,PRIMARY KEY(namespace,tenant,project,movie,studio,operation_id,id),FOREIGN KEY(namespace,tenant,project,movie,studio,operation_id) REFERENCES execution_m803.work,FOREIGN KEY(namespace,tenant,session_id) REFERENCES execution_m803.session);
CREATE TABLE execution_m803.gc_intent(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,operation_id text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(namespace,tenant,project,movie,studio,operation_id),FOREIGN KEY(namespace,tenant,project,movie,studio,operation_id) REFERENCES execution_m803.work);
CREATE TABLE execution_m803.tombstone(namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,operation_id text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(namespace,tenant,project,movie,studio,operation_id),FOREIGN KEY(namespace,tenant,project,movie,studio,operation_id) REFERENCES execution_m803.gc_intent);
CREATE FUNCTION execution_m803.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,execution_m803,pg_temp AS $$ BEGIN RAISE EXCEPTION 'E803_IMMUTABLE'; END $$;
CREATE FUNCTION execution_m803.source_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,execution_m803,pg_temp AS $$ BEGIN
 IF TG_OP<>'UPDATE' OR (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN RAISE EXCEPTION 'E803_IMMUTABLE'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_source BEFORE UPDATE OR DELETE ON execution_m803.source FOR EACH ROW EXECUTE FUNCTION execution_m803.source_immutable();
CREATE TRIGGER immutable_source_truncate BEFORE TRUNCATE ON execution_m803.source FOR EACH STATEMENT EXECUTE FUNCTION execution_m803.immutable();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['work','key_slot','fact','audit_event','gc_intent','tombstone'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON execution_m803.%I FOR EACH ROW EXECUTE FUNCTION execution_m803.immutable()',t);
 EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON execution_m803.%I FOR EACH STATEMENT EXECUTE FUNCTION execution_m803.immutable()',t);
END LOOP; END $$;
CREATE FUNCTION execution_m803.current_source(n text,t text,p text,m text,s text,sh text) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,execution_m803,pg_temp AS $$
 SELECT coalesce((SELECT src.enabled AND src.expires_at>clock_timestamp() AND h.id=src.input->'timeline'->>'id' AND h.revision=(src.input->'timeline'->>'version')::int
 AND v.hash=src.input->'timeline'->>'recordHash' AND v.plan_hash=src.input->'timeline'->>'planHash'
 AND timeline_m702.m6_current(t,p,m,s,v.payload->'plan'->'plan'->'input'->'selected'->>'id')
 AND EXISTS(SELECT 1 FROM timeline_m702.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled)
 AND src.binding->'body'->>'byteSha256'=src.recipe->'recipe'->'sourceObservation'->'fingerprint'->>'sha256'
 AND src.binding->'body'->'byteCount'=src.recipe->'recipe'->'sourceObservation'->'fingerprint'->'bytes'
 FROM execution_m803.source src JOIN timeline_m702.repository_head h ON (h.tenant,h.project,h.movie,h.studio)=(src.tenant,src.project,src.movie,src.studio)
 JOIN timeline_m702.version v ON (v.tenant,v.project,v.movie,v.studio,v.id)=(h.tenant,h.project,h.movie,h.studio,h.id)
 WHERE (src.namespace,src.tenant,src.project,src.movie,src.studio,src.hash)=(n,t,p,m,s,sh)),false)
$$;
CREATE FUNCTION execution_m803.capture(n text,t text,p text,m text,s text,sh text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,execution_m803,pg_temp AS $$
DECLARE src execution_m803.source; raw jsonb; parent jsonb; h timeline_m702.repository_head; sc jsonb;
BEGIN
 SELECT * INTO src FROM execution_m803.source WHERE (namespace,tenant,project,movie,studio,hash)=(n,t,p,m,s,sh);
 IF NOT FOUND THEN RAISE EXCEPTION 'E803_NOT_FOUND'; END IF;
 raw:=timeline_m702.version_view(t,p,m,s,src.input->'timeline'->>'id'); parent:=timeline_m702.version_view(t,p,m,s,raw->'record'->'previous'->>'id');
 SELECT * INTO h FROM timeline_m702.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s);
 sc:=src.input->'scope';
 RETURN jsonb_build_object('status','RESOLVED_SYNTHETIC','observedAt','2026-10-20T00:00:00.000Z',
 'timeline',jsonb_build_object('view',jsonb_build_object('record',raw->'record','recordHash',raw->'recordHash','currentness',CASE WHEN execution_m803.current_source(n,t,p,m,s,sh) THEN 'CURRENT_AT_READ' ELSE 'STALE_DEPENDENCIES' END),'dependency',raw->'dependency'),
 'parent',CASE WHEN parent IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('view',jsonb_build_object('record',parent->'record','recordHash',parent->'recordHash','currentness','SUPERSEDED'),'dependency',parent->'dependency') END,
 'head',jsonb_build_object('scope',sc,'revision',h.revision,'identity',(timeline_m702.version_view(t,p,m,s,h.id))->'identity'),
 'currentM6',timeline_m702.current_observation(t,p,m,s,raw->'record'->'plan'->'plan'->'input'->'selected'->>'id'),
 'admission',jsonb_build_object('scope',sc,'m7ScopeEnabled',EXISTS(SELECT 1 FROM timeline_m702.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled),'m6ScopeEnabled',EXISTS(SELECT 1 FROM highlight_m602.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled),'m7PolicyEnabled',EXISTS(SELECT 1 FROM timeline_m702.policy WHERE enabled AND version='story-recap-timeline-policy-v1'),'m7PolicyVersion','story-recap-timeline-policy-v1'),
 'profile',src.profile,'sourceObservation',src.manifest);
END $$;
CREATE FUNCTION execution_m803.complete() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,execution_m803,pg_temp AS $$
DECLARE src text; BEGIN
 SELECT * INTO NEW FROM execution_m803.state WHERE (namespace,tenant,project,movie,studio,id)=(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id);
 IF NOT EXISTS(SELECT 1 FROM execution_m803.audit_event WHERE (namespace,tenant,project,movie,studio,operation_id,revision)=(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id,NEW.revision)) THEN RAISE EXCEPTION 'E803_INCOMPLETE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM execution_m803.session ss JOIN execution_m803.access_grant g ON (g.namespace,g.tenant,g.principal)=(ss.namespace,ss.tenant,ss.principal)
 WHERE (ss.namespace,ss.tenant,ss.id,ss.principal)=(NEW.namespace,NEW.tenant,NEW.last_session,NEW.last_principal) AND (g.project,g.movie,g.studio)=(NEW.project,NEW.movie,NEW.studio) AND NOT ss.revoked AND ss.expires_at>clock_timestamp()) OR NEW.deadline<=clock_timestamp() THEN RAISE EXCEPTION 'E803_SESSION_INVALID'; END IF;
 SELECT source_hash INTO src FROM execution_m803.work WHERE (namespace,tenant,project,movie,studio,id)=(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id);
 IF NEW.require_current AND NOT execution_m803.current_source(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio,src) THEN RAISE EXCEPTION 'E803_STALE_SOURCE'; END IF;
 IF NEW.require_current AND (NOT EXISTS(SELECT 1 FROM timeline_m702.session ss JOIN timeline_m702.access_grant g ON (g.tenant,g.principal)=(ss.tenant,ss.principal) WHERE (ss.tenant,ss.id,ss.principal)=(NEW.tenant,NEW.last_session,NEW.last_principal) AND (g.project,g.movie,g.studio)=(NEW.project,NEW.movie,NEW.studio) AND NOT ss.revoked AND ss.expires_at>clock_timestamp() AND g.can_read)
 OR NOT EXISTS(SELECT 1 FROM highlight_m602.session ss JOIN highlight_m602.access_grant g ON (g.tenant,g.principal)=(ss.tenant,ss.principal) WHERE (ss.tenant,ss.id,ss.principal)=(NEW.tenant,NEW.last_session,NEW.last_principal) AND (g.project,g.movie,g.studio)=(NEW.project,NEW.movie,NEW.studio) AND NOT ss.revoked AND ss.expires_at>clock_timestamp() AND g.can_read)) THEN RAISE EXCEPTION 'E803_FORBIDDEN'; END IF;
 IF NEW.state IN('SUCCESS','FAILURE') AND NOT EXISTS(SELECT 1 FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,kind)=(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id,'result')) THEN RAISE EXCEPTION 'E803_INCOMPLETE'; END IF;
 IF NEW.availability='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,kind)=(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id,'artifact')) THEN RAISE EXCEPTION 'E803_INCOMPLETE'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transition_complete AFTER INSERT OR UPDATE ON execution_m803.state DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION execution_m803.complete();
CREATE FUNCTION execution_m803.gateway(action text,wire text,mac text,body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,execution_m803,pg_temp AS $$
DECLARE w jsonb;b jsonb;c jsonb;sc jsonb;k execution_m803.proof_key;ss execution_m803.session;g execution_m803.access_grant;src execution_m803.source;
 job execution_m803.work;st execution_m803.state;old execution_m803.key_slot;f execution_m803.fixture;fact jsonb;stored jsonb;audit jsonb;
 n text;t text;p text;m text;s text;op text;target text;fh text;v_kind text;domain text;nowms bigint;affected int;v_current boolean:=false;
BEGIN
 IF octet_length(wire)>8192 OR octet_length(body)>33554432 THEN RAISE EXCEPTION 'E803_INVALID_INPUT'; END IF;
 w:=wire::jsonb;b:=body::jsonb;sc:=w->'scope';n:=w->>'namespace';t:=sc->>'tenantId';p:=sc->>'projectId';m:=sc->>'movieId';s:=sc->>'studioId';op:=b->>'op';target:=b->>'id';
 IF timeline_m702.keys(w,ARRAY['domain','namespace','scope','sessionId','principalId','action','bodyHash','nonce','backendPid','transactionId','expiresAtMs','origin','csrfHash']) IS NOT TRUE OR timeline_m702.keys(sc,ARRAY['tenantId','projectId','movieId','studioId']) IS NOT TRUE THEN RAISE EXCEPTION 'E803_PROOF_INVALID'; END IF;
 SELECT * INTO k FROM execution_m803.proof_key WHERE proof_key.action=gateway.action AND login=session_user AND enabled FOR SHARE;
 IF NOT FOUND OR w->>'domain' IS DISTINCT FROM 'story-recap-execution-access-v1' OR w->>'action' IS DISTINCT FROM action
 OR mac IS DISTINCT FROM encode(highlight_m602_crypto.hmac(convert_to('story-recap-execution-access-v1'||chr(10)||wire,'UTF8'),k.secret,'sha256'),'hex')
 OR w->>'bodyHash' IS DISTINCT FROM encode(highlight_m602_crypto.digest(convert_to(body,'UTF8'),'sha256'),'hex')
 OR w->>'backendPid' IS DISTINCT FROM pg_backend_pid()::text OR w->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text THEN RAISE EXCEPTION 'E803_PROOF_INVALID'; END IF;
 -- Cooperating M7 -> M6 -> M7 policy/head order; no existing writer acquires new execution rows.
 PERFORM 1 FROM timeline_m702.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 PERFORM 1 FROM timeline_m702.session WHERE (tenant,id)=(t,w->>'sessionId') FOR SHARE;
 PERFORM 1 FROM timeline_m702.access_grant WHERE (tenant,project,movie,studio,principal)=(t,p,m,s,w->>'principalId') FOR SHARE;
 PERFORM 1 FROM highlight_m602.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 PERFORM 1 FROM highlight_m602.session WHERE (tenant,id)=(t,w->>'sessionId') FOR SHARE;
 PERFORM 1 FROM highlight_m602.access_grant WHERE (tenant,project,movie,studio,principal)=(t,p,m,s,w->>'principalId') FOR SHARE;
 PERFORM 1 FROM highlight_m602.policy WHERE version='story-highlight-policy-v1' FOR SHARE;
 PERFORM 1 FROM highlight_m602.current_dependency WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 PERFORM 1 FROM highlight_m602.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 PERFORM 1 FROM timeline_m702.policy WHERE version='story-recap-timeline-policy-v1' FOR SHARE;
 PERFORM 1 FROM timeline_m702.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 PERFORM 1 FROM execution_m803.scope WHERE (namespace,tenant,project,movie,studio)=(n,t,p,m,s) AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'E803_FORBIDDEN'; END IF;
 SELECT * INTO ss FROM execution_m803.session WHERE (namespace,tenant,id,principal)=(n,t,w->>'sessionId',w->>'principalId') FOR SHARE;
 SELECT * INTO g FROM execution_m803.access_grant WHERE (namespace,tenant,project,movie,studio,principal)=(n,t,p,m,s,w->>'principalId') FOR SHARE;
 nowms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF ss.id IS NULL OR g.principal IS NULL OR ss.revoked OR ss.expires_at<=clock_timestamp() OR (action=ANY(g.actions)) IS NOT TRUE
 OR action IN('execute','validate','finalize','read') AND ('inspect'=ANY(g.actions)) IS NOT TRUE OR action='finalize' AND ('execute'=ANY(g.actions)) IS NOT TRUE
 OR w->>'origin' IS DISTINCT FROM ss.origin OR w->>'csrfHash' IS DISTINCT FROM ss.csrf_hash
 OR w->>'expiresAtMs' IS NULL OR (w->>'expiresAtMs')::bigint<=nowms OR (w->>'expiresAtMs')::bigint>nowms+5000 THEN RAISE EXCEPTION 'E803_FORBIDDEN'; END IF;
 IF (SELECT count(*) FROM execution_m803.used_proof)>=(CASE WHEN action IN('recover','quarantine','gc') THEN 20000 ELSE 14000 END) THEN RAISE EXCEPTION 'E803_QUOTA'; END IF;
 INSERT INTO execution_m803.used_proof VALUES(w->>'nonce',n,t,ss.id) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>1 THEN RAISE EXCEPTION 'E803_PROOF_INVALID'; END IF;
 IF op='capture' THEN
  IF ('inspect'=ANY(g.actions)) IS NOT TRUE THEN RAISE EXCEPTION 'E803_FORBIDDEN'; END IF;
  SELECT * INTO src FROM execution_m803.source WHERE (namespace,tenant,project,movie,studio,hash)=(n,t,p,m,s,b->>'sourceHash') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'E803_SOURCE_UNAVAILABLE'; END IF;
  stored:=jsonb_build_object('observation',execution_m803.capture(n,t,p,m,s,src.hash),'source',src.binding,'recipe',src.recipe);
  IF octet_length(stored::text)>33554432 THEN RAISE EXCEPTION 'E803_QUOTA'; END IF; RETURN stored;
 END IF;
 SELECT * INTO f FROM execution_m803.fixture WHERE namespace=n FOR UPDATE;
 IF op='lookup' AND action='read' THEN
  SELECT * INTO old FROM execution_m803.key_slot WHERE (namespace,tenant,project,movie,studio,key)=(n,t,p,m,s,b->>'key');
  IF NOT FOUND THEN RETURN '{"status":"NOT_FOUND"}'::jsonb; END IF;
  IF old.request_hash IS DISTINCT FROM b->>'requestHash' THEN RAISE EXCEPTION 'E803_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('status','FOUND','id',old.operation_id);
 END IF;
 IF op='reserve' AND action='execute' THEN
  IF timeline_m702.keys(b,ARRAY['op','id','request','workHash','admission','submission','stage']) IS NOT TRUE THEN RAISE EXCEPTION 'E803_INVALID_INPUT'; END IF;
  c:=b->'request';
  SELECT * INTO src FROM execution_m803.source WHERE (namespace,tenant,project,movie,studio,hash)=(n,t,p,m,s,c->'body'->>'sourceHash') FOR SHARE;
  IF NOT FOUND OR c->'body'->'recipe' IS DISTINCT FROM src.recipe OR c->'scope' IS DISTINCT FROM sc OR c->>'namespace' IS DISTINCT FROM n OR c->>'schemaVersion'<>'story-recap-execution-request-v1' THEN RAISE EXCEPTION 'E803_INVALID_BINDING'; END IF;
  IF c->'body'->>'profileHash' IS DISTINCT FROM execution_m803.profile_hash() OR b->>'workHash' IS DISTINCT FROM execution_m803.digest('story-recap-execution-admission-v1',jsonb_build_object('namespace',n,'scope',sc,'recipe',src.recipe,'sourceHash',src.hash,'profileHash',c->'body'->>'profileHash'))
   OR c->'restrictions' IS DISTINCT FROM src.binding->'restrictions' OR (b->'admission'->'body') IS DISTINCT FROM jsonb_build_object('operationId',target,'workHash',b->>'workHash','requestHash',execution_m803.digest('story-recap-execution-request-v1',c),'sourceHash',src.hash,'recipeHash',src.recipe->>'recipeHash','quotaBytes',2097152)
   OR b->'submission'->'body'->>'operationId' IS DISTINCT FROM target OR b->'submission'->'body'->>'generation' IS DISTINCT FROM '1'
   OR b->'stage'->'body'->>'operationId' IS DISTINCT FROM target OR b->'stage'->'body'->>'version' !~ '^[a-f0-9]{32}$'
   OR b->'stage'->'body'->>'byteSha256' IS DISTINCT FROM encode(highlight_m602_crypto.digest(convert_to('M803 opaque fake output'||chr(10)||(b->>'workHash')||chr(10)||'NOT MEDIA'||chr(10),'UTF8'),'sha256'),'hex')
   OR (b->'stage'->'body'->>'byteCount')::int IS DISTINCT FROM octet_length(convert_to('M803 opaque fake output'||chr(10)||(b->>'workHash')||chr(10)||'NOT MEDIA'||chr(10),'UTF8')) THEN RAISE EXCEPTION 'E803_INVALID_BINDING'; END IF;
  SELECT * INTO old FROM execution_m803.key_slot WHERE (namespace,tenant,project,movie,studio,key)=(n,t,p,m,s,c->'body'->>'key');
  IF FOUND THEN
   IF old.request_hash<>execution_m803.digest('story-recap-execution-request-v1',c) THEN RAISE EXCEPTION 'E803_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',old.operation_id,'created',false);
  END IF;
  SELECT * INTO job FROM execution_m803.work WHERE (namespace,tenant,project,movie,studio,work_hash)=(n,t,p,m,s,b->>'workHash');
  IF FOUND THEN
   IF ((job.request->'body')-'key') IS DISTINCT FROM ((c->'body')-'key') THEN RAISE EXCEPTION 'E803_IDEMPOTENCY_CONFLICT'; END IF;
   IF (SELECT count(*) FROM execution_m803.key_slot)>=128 THEN RAISE EXCEPTION 'E803_QUOTA'; END IF;
   INSERT INTO execution_m803.key_slot VALUES(n,t,p,m,s,c->'body'->>'key',execution_m803.digest('story-recap-execution-request-v1',c),job.id);
   RETURN jsonb_build_object('id',job.id,'created',false);
  END IF;
  IF NOT execution_m803.current_source(n,t,p,m,s,src.hash) THEN RAISE EXCEPTION 'E803_STALE_SOURCE'; END IF;
  IF EXISTS(SELECT 1 FROM execution_m803.state WHERE (namespace,tenant,project,movie,studio)=(n,t,p,m,s) AND state IN('RESERVED','CHECKPOINTED','UNKNOWN')) THEN RAISE EXCEPTION 'E803_UNRESOLVED_WORK'; END IF;
  IF f.operations>=16 OR f.bytes_reserved+2097152>29360128 OR f.versions+1>32 THEN RAISE EXCEPTION 'E803_QUOTA'; END IF;
  INSERT INTO execution_m803.work VALUES(n,t,p,m,s,target,b->>'workHash',src.hash,c,b->'admission',b->'submission',b->'stage');
  INSERT INTO execution_m803.key_slot VALUES(n,t,p,m,s,c->'body'->>'key',execution_m803.digest('story-recap-execution-request-v1',c),target);
  INSERT INTO execution_m803.state(namespace,tenant,project,movie,studio,id,last_session,last_principal,deadline) VALUES(n,t,p,m,s,target,ss.id,ss.principal,to_timestamp((w->>'expiresAtMs')::bigint/1000.0));
  UPDATE execution_m803.fixture SET operations=operations+1,bytes_reserved=bytes_reserved+2097152,versions=versions+1 WHERE namespace=n;
  st.revision:=0;
 ELSE
  SELECT * INTO job FROM execution_m803.work WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  IF NOT FOUND THEN RAISE EXCEPTION 'E803_NOT_FOUND'; END IF;
  SELECT * INTO src FROM execution_m803.source WHERE (namespace,tenant,project,movie,studio,hash)=(n,t,p,m,s,job.source_hash) FOR SHARE;
  SELECT * INTO st FROM execution_m803.state WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target) FOR UPDATE;
  IF op='inspect' THEN
   IF ('inspect'=ANY(g.actions)) IS NOT TRUE THEN RAISE EXCEPTION 'E803_FORBIDDEN'; END IF;
   RETURN jsonb_build_object('work',to_jsonb(job),'state',to_jsonb(st),'facts',coalesce((SELECT jsonb_object_agg(execution_m803.fact.kind,payload) FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id)=(n,t,p,m,s,target)),'{}'::jsonb),'intent',(SELECT payload FROM execution_m803.gc_intent WHERE (namespace,tenant,project,movie,studio,operation_id)=(n,t,p,m,s,target)));
  END IF;
  IF st.revision IS DISTINCT FROM (b->>'revision')::int OR st.owner_generation IS DISTINCT FROM (b->>'generation')::int THEN RAISE EXCEPTION 'E803_CONFLICT'; END IF;
  IF op='checkpoint' AND action='execute' THEN
   IF st.state<>'RESERVED' OR st.cancelled OR f.active IS NOT NULL THEN RAISE EXCEPTION 'E803_NO_PERMIT'; END IF;
   v_current:=true;v_kind:='checkpoint';fact:=b->'fact';
   IF fact->'body' IS DISTINCT FROM jsonb_build_object('operationId',target,'submissionId',job.submission->'body'->>'submissionId','generation',1,'ownerGeneration',st.owner_generation) THEN RAISE EXCEPTION 'E803_INVALID_BINDING'; END IF;
   UPDATE execution_m803.state SET state='CHECKPOINTED' WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
   UPDATE execution_m803.fixture SET active=target WHERE namespace=n;
  ELSIF op='launchFence' AND action='execute' THEN
   IF st.state<>'CHECKPOINTED' OR st.cancelled THEN RAISE EXCEPTION 'E803_NO_PERMIT'; END IF;
   v_current:=true;
  ELSIF op='unknown' AND action IN('execute','recover') THEN
   IF st.state NOT IN('CHECKPOINTED','UNKNOWN') THEN RAISE EXCEPTION 'E803_INVALID_STATE'; END IF;
   UPDATE execution_m803.state SET state='UNKNOWN',availability='QUARANTINED',quarantine_hold=true WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='result' AND action='observe' THEN
   IF st.state NOT IN('CHECKPOINTED','UNKNOWN','SUCCESS','FAILURE') THEN RAISE EXCEPTION 'E803_INVALID_STATE'; END IF;
   v_kind:='result';fact:=b->'fact';
   IF (fact->'body'->>'outcome' IN('SUCCESS','FAILURE')) IS NOT TRUE THEN RAISE EXCEPTION 'E803_INVALID_RESULT'; END IF;
   stored:=jsonb_build_object('operationId',target,'submissionId',job.submission->'body'->>'submissionId','generation',1,'outcome',fact->'body'->>'outcome','quiescence','QUIESCENT',
    'byteSha256',CASE WHEN fact->'body'->>'outcome'='SUCCESS' THEN job.stage->'body'->'byteSha256' ELSE 'null'::jsonb END,
    'byteCount',CASE WHEN fact->'body'->>'outcome'='SUCCESS' THEN job.stage->'body'->'byteCount' ELSE '0'::jsonb END);
   IF fact->'body' IS DISTINCT FROM stored THEN RAISE EXCEPTION 'E803_INVALID_RESULT'; END IF;
   UPDATE execution_m803.state SET state=CASE WHEN fact->'body'->>'outcome'='SUCCESS' THEN 'SUCCESS' ELSE 'FAILURE' END WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
   UPDATE execution_m803.fixture SET active=NULL WHERE namespace=n AND active=target;
  ELSIF op='verify' AND action='validate' THEN
   IF st.state<>'SUCCESS' OR st.cancelled OR st.availability IN('DELETE_PENDING','DELETED') THEN RAISE EXCEPTION 'E803_INVALID_STATE'; END IF;
   v_kind:='verification';fact:=b->'fact';
   IF fact->'body'->>'version' IS DISTINCT FROM job.stage->'body'->>'version' OR fact->'body'->>'sourceHash'<>job.source_hash OR fact->'body'->>'recipeHash'<>job.request->'body'->'recipe'->>'recipeHash'
   OR fact->'body'->>'resultHash' IS DISTINCT FROM (SELECT hash FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,execution_m803.fact.kind)=(n,t,p,m,s,target,'result'))
   OR fact->'body'->'measurements' IS DISTINCT FROM '{"codec":"NOT_MEASURED","frames":"NOT_MEASURED","duration":"NOT_MEASURED","streams":"NOT_MEASURED"}'::jsonb
   OR fact->'body'->>'byteSha256' IS DISTINCT FROM job.stage->'body'->>'byteSha256' OR fact->'body'->'byteCount' IS DISTINCT FROM job.stage->'body'->'byteCount' THEN RAISE EXCEPTION 'E803_INVALID_VERIFICATION'; END IF;
  ELSIF op='finalize' AND action='finalize' THEN
   IF st.state<>'SUCCESS' OR st.cancelled OR st.quarantine_hold OR st.availability IN('DELETE_PENDING','DELETED','QUARANTINED') THEN RAISE EXCEPTION 'E803_INVALID_STATE'; END IF;
   v_current:=true;v_kind:='artifact';fact:=b->'fact';
   stored:=(SELECT payload FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,execution_m803.fact.kind)=(n,t,p,m,s,target,'verification'));
   IF stored IS NULL OR fact->'body'->>'verificationHash' IS DISTINCT FROM execution_m803.digest('story-recap-execution-fake-byte-verification-v1',stored) OR fact->'body'->>'version' IS DISTINCT FROM job.stage->'body'->>'version' THEN RAISE EXCEPTION 'E803_UNVERIFIED'; END IF;
   UPDATE execution_m803.state SET availability='AVAILABLE' WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='quarantine' AND action='quarantine' THEN
   IF st.availability IN('DELETE_PENDING','DELETED') THEN RAISE EXCEPTION 'E803_INVALID_STATE'; END IF;
   UPDATE execution_m803.state SET availability='QUARANTINED',quarantine_hold=true WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='recover' AND action='recover' THEN
   UPDATE execution_m803.state SET owner_generation=owner_generation+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='cancel' AND action='execute' THEN
   UPDATE execution_m803.state SET cancelled=true,state=CASE WHEN state='RESERVED' THEN 'CANCELLED' ELSE state END,availability='QUARANTINED',quarantine_hold=true WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='releaseHold' AND action='recover' THEN
   IF st.state NOT IN('SUCCESS','FAILURE','CANCELLED') THEN RAISE EXCEPTION 'E803_UNRESOLVED_WORK'; END IF;
   UPDATE execution_m803.state SET quarantine_hold=false,source_hold=false WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='readopt' AND action='recover' THEN
   IF st.state<>'SUCCESS' OR st.cancelled OR EXISTS(SELECT 1 FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,execution_m803.fact.kind)=(n,t,p,m,s,target,'artifact')) OR NOT EXISTS(SELECT 1 FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,execution_m803.fact.kind)=(n,t,p,m,s,target,'verification')) THEN RAISE EXCEPTION 'E803_INVALID_STATE'; END IF;
   v_current:=true;
   UPDATE execution_m803.state SET quarantine_hold=false,availability='ABSENT' WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='readBegin' AND action='read' THEN
   IF st.availability<>'AVAILABLE' THEN RAISE EXCEPTION 'E803_UNAVAILABLE'; END IF;
   v_current:=true;
   IF (SELECT count(*) FROM execution_m803.read_hold)>=32 THEN RAISE EXCEPTION 'E803_QUOTA'; END IF;
   INSERT INTO execution_m803.read_hold VALUES(n,t,p,m,s,target,b->>'hold',ss.id);
  ELSIF op='readFinish' AND action='read' THEN
   IF st.availability<>'AVAILABLE' OR NOT EXISTS(SELECT 1 FROM execution_m803.read_hold WHERE (namespace,tenant,project,movie,studio,operation_id,id,session_id)=(n,t,p,m,s,target,b->>'hold',ss.id)) THEN RAISE EXCEPTION 'E803_UNAVAILABLE'; END IF;
   v_current:=true;
   DELETE FROM execution_m803.read_hold WHERE (namespace,tenant,project,movie,studio,operation_id,id)=(n,t,p,m,s,target,b->>'hold');
  ELSIF op='readRelease' AND action='read' THEN
   DELETE FROM execution_m803.read_hold WHERE (namespace,tenant,project,movie,studio,operation_id,id,session_id)=(n,t,p,m,s,target,b->>'hold',ss.id);
  ELSIF op='gcBegin' AND action='gc' THEN
   IF st.state NOT IN('SUCCESS','FAILURE','CANCELLED') OR st.availability<>'QUARANTINED' OR st.quarantine_hold OR st.source_hold OR st.retain_until>clock_timestamp() OR EXISTS(SELECT 1 FROM execution_m803.read_hold WHERE (namespace,tenant,project,movie,studio,operation_id)=(n,t,p,m,s,target)) THEN RAISE EXCEPTION 'E803_GC_HELD'; END IF;
   IF b->'intent'->>'version' IS DISTINCT FROM job.stage->'body'->>'version' THEN RAISE EXCEPTION 'E803_DELETE_MISMATCH'; END IF;
   INSERT INTO execution_m803.gc_intent VALUES(n,t,p,m,s,target,b->'intent');
   UPDATE execution_m803.state SET availability='DELETE_PENDING' WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSIF op='gcFinish' AND action='gc' THEN
   stored:=(SELECT payload FROM execution_m803.gc_intent WHERE (namespace,tenant,project,movie,studio,operation_id)=(n,t,p,m,s,target));
   IF st.availability NOT IN('DELETE_PENDING','DELETED') OR stored IS DISTINCT FROM b->'intent' THEN RAISE EXCEPTION 'E803_DELETE_MISMATCH'; END IF;
   INSERT INTO execution_m803.tombstone VALUES(n,t,p,m,s,target,stored) ON CONFLICT DO NOTHING;
   UPDATE execution_m803.state SET availability='DELETED' WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target);
  ELSE RAISE EXCEPTION 'E803_FORBIDDEN'; END IF;
  IF v_kind IS NOT NULL THEN
   IF timeline_m702.keys(fact,ARRAY['schemaVersion','namespace','scope','restrictions','body']) IS NOT TRUE THEN RAISE EXCEPTION 'E803_INVALID_BINDING'; END IF;
   domain:=CASE v_kind WHEN 'verification' THEN 'story-recap-execution-fake-byte-verification-v1' ELSE 'story-recap-execution-'||v_kind||'-v1' END;
   IF fact->>'namespace' IS DISTINCT FROM n OR fact->'scope' IS DISTINCT FROM sc OR fact->'restrictions' IS DISTINCT FROM job.request->'restrictions' OR fact->'body'->>'operationId' IS DISTINCT FROM target OR fact->>'schemaVersion' IS DISTINCT FROM domain THEN RAISE EXCEPTION 'E803_INVALID_BINDING'; END IF;
   IF v_kind='verification' THEN
    stored:=jsonb_build_object('operationId',target,'resultHash',(SELECT hash FROM execution_m803.fact ff WHERE (ff.namespace,ff.tenant,ff.project,ff.movie,ff.studio,ff.operation_id,ff.kind)=(n,t,p,m,s,target,'result')),'sourceHash',job.source_hash,'recipeHash',job.request->'body'->'recipe'->>'recipeHash','dependencyHash',job.request->'body'->'recipe'->'recipe'->>'dependencyHash','profileHash',job.request->'body'->>'profileHash','version',job.stage->'body'->>'version','byteSha256',job.stage->'body'->>'byteSha256','byteCount',job.stage->'body'->'byteCount','measurements','{"codec":"NOT_MEASURED","frames":"NOT_MEASURED","duration":"NOT_MEASURED","streams":"NOT_MEASURED"}'::jsonb);
    IF fact->'body' IS DISTINCT FROM stored THEN RAISE EXCEPTION 'E803_INVALID_VERIFICATION'; END IF;
   ELSIF v_kind='artifact' THEN
    stored:=jsonb_build_object('operationId',target,'admissionHash',execution_m803.digest('story-recap-execution-admission-v1',job.admission),'submissionHash',execution_m803.digest('story-recap-execution-submission-v1',job.submission),'resultHash',(SELECT hash FROM execution_m803.fact ff WHERE (ff.namespace,ff.tenant,ff.project,ff.movie,ff.studio,ff.operation_id,ff.kind)=(n,t,p,m,s,target,'result')),'stageHash',execution_m803.digest('story-recap-execution-stage-v1',job.stage),'verificationHash',(SELECT hash FROM execution_m803.fact ff WHERE (ff.namespace,ff.tenant,ff.project,ff.movie,ff.studio,ff.operation_id,ff.kind)=(n,t,p,m,s,target,'verification')),'version',job.stage->'body'->>'version','recipeHash',job.request->'body'->'recipe'->>'recipeHash','sourceHash',job.source_hash,'byteSha256',job.stage->'body'->>'byteSha256','byteCount',job.stage->'body'->'byteCount','measurements','{"codec":"NOT_MEASURED","frames":"NOT_MEASURED","duration":"NOT_MEASURED","streams":"NOT_MEASURED"}'::jsonb);
    IF fact->'body' IS DISTINCT FROM stored THEN RAISE EXCEPTION 'E803_INVALID_VERIFICATION'; END IF;
   END IF;
   IF b->>'factProof' IS DISTINCT FROM encode(highlight_m602_crypto.hmac(convert_to(domain||chr(10)||execution_m803.canonical(jsonb_build_object('namespace',n,'scope',sc,'id',target,'generation',st.owner_generation,'revision',st.revision,'backendPid',pg_backend_pid(),'transactionId',pg_current_xact_id()::text,'factHash',execution_m803.digest(domain,fact))),'UTF8'),k.secret,'sha256'),'hex') THEN RAISE EXCEPTION 'E803_PROOF_INVALID'; END IF;
   SELECT payload INTO stored FROM execution_m803.fact WHERE (namespace,tenant,project,movie,studio,operation_id,execution_m803.fact.kind)=(n,t,p,m,s,target,v_kind);
   IF FOUND AND stored IS DISTINCT FROM fact THEN RAISE EXCEPTION 'E803_EVIDENCE_CONFLICT'; END IF;
   INSERT INTO execution_m803.fact VALUES(n,t,p,m,s,target,v_kind,fact,execution_m803.digest(domain,fact)) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE execution_m803.state SET revision=revision+1,last_session=ss.id,last_principal=ss.principal,deadline=to_timestamp((w->>'expiresAtMs')::bigint/1000.0),require_current=v_current WHERE (namespace,tenant,project,movie,studio,id)=(n,t,p,m,s,target) RETURNING * INTO st;
 END IF;
 IF (op IN('reserve','checkpoint','launchFence','finalize','readopt','readBegin','readFinish')) AND NOT execution_m803.current_source(n,t,p,m,s,coalesce(src.hash,job.source_hash)) THEN RAISE EXCEPTION 'E803_STALE_SOURCE'; END IF;
 audit:=jsonb_build_object('schemaVersion','story-recap-execution-audit-v1','namespace',n,'scope',sc,'restrictions',coalesce(job.request,b->'request')->'restrictions','body',jsonb_build_object('operationId',target,'action',op,'revision',st.revision,'principalId',ss.principal,'timeMs',nowms));
 INSERT INTO execution_m803.audit_event VALUES(n,t,p,m,s,target,st.revision,audit,execution_m803.digest('story-recap-execution-audit-v1',audit));
 RETURN jsonb_build_object('id',target,'created',op='reserve','revision',st.revision,'generation',coalesce(st.owner_generation,1));
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA execution_m803 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA execution_m803 FROM PUBLIC;
RESET ROLE;
DO $$ DECLARE a text; BEGIN FOREACH a IN ARRAY ARRAY['inspect','execute','observe','validate','finalize','read','recover','quarantine','gc'] LOOP
 EXECUTE format('CREATE ROLE execution_m803_%I NOLOGIN',a);
 EXECUTE format('CREATE FUNCTION execution_m803.%I(w text,m text,b text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,execution_m803,pg_temp AS %L',a,'SELECT execution_m803.gateway('||quote_literal(a)||',w,m,b)');
 EXECUTE format('ALTER FUNCTION execution_m803.%I(text,text,text) OWNER TO execution_m803_owner',a);
 EXECUTE format('REVOKE ALL ON FUNCTION execution_m803.%I(text,text,text) FROM PUBLIC',a);
 EXECUTE format('GRANT USAGE ON SCHEMA execution_m803 TO execution_m803_%I',a);
 EXECUTE format('GRANT EXECUTE ON FUNCTION execution_m803.%I(text,text,text) TO execution_m803_%I',a,a);
END LOOP; END $$;
