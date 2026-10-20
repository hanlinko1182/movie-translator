-- Scratch-only bootstrap, installed by a newly owned DisposableStorylinePostgres.
CREATE ROLE timeline_m702_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE timeline_m702_read NOLOGIN;
CREATE ROLE timeline_m702_create NOLOGIN;
CREATE SCHEMA timeline_m702 AUTHORIZATION timeline_m702_owner;
GRANT USAGE ON SCHEMA highlight_m602_crypto TO timeline_m702_owner;
GRANT USAGE ON SCHEMA highlight_m602 TO timeline_m702_owner;
GRANT SELECT ON highlight_m602.scope,highlight_m602.session,highlight_m602.access_grant,highlight_m602.policy,highlight_m602.current_dependency,highlight_m602.repository_head,highlight_m602.version,highlight_m602.reservation,highlight_m602.audit_event,highlight_m602.dependency,highlight_m602.source_snapshot,highlight_m602.analysis_snapshot,highlight_m602.narration_snapshot TO timeline_m702_owner;
-- Row locks need UPDATE privilege; only the non-login private owner receives it.
GRANT UPDATE ON highlight_m602.scope,highlight_m602.session,highlight_m602.access_grant,highlight_m602.policy,highlight_m602.current_dependency,highlight_m602.repository_head TO timeline_m702_owner;
GRANT REFERENCES ON highlight_m602.version TO timeline_m702_owner;
GRANT EXECUTE ON FUNCTION highlight_m602.load_dependency(text,text,text,text,text), highlight_m602.version_view(text,text,text,text,text), highlight_m602.identity(highlight_m602.version) TO timeline_m702_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SET ROLE timeline_m702_owner;
SET search_path=pg_catalog,timeline_m702,pg_temp;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE FUNCTION timeline_m702.canonical(j jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
DECLARE result text; BEGIN
 CASE jsonb_typeof(j)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_json(k)::text||':'||timeline_m702.canonical(v),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(j) e(k,v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(timeline_m702.canonical(v),',' ORDER BY i),'')||']' INTO result FROM jsonb_array_elements(j) WITH ORDINALITY e(v,i);
 ELSE result:=j::text; END CASE; RETURN result;
END $$;
CREATE FUNCTION timeline_m702.digest(d text,j jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
 SELECT encode(highlight_m602_crypto.digest(convert_to(d||chr(10)||timeline_m702.canonical(j),'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION timeline_m702.keys(j jsonb,k text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
 SELECT jsonb_typeof(j)='object' AND (SELECT array_agg(x ORDER BY x COLLATE "C") FROM jsonb_object_keys(j) x)=(SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(k) x)
$$;
CREATE TABLE timeline_m702.tenant(id text PRIMARY KEY CHECK(id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'));
CREATE TABLE timeline_m702.principal(tenant text NOT NULL REFERENCES timeline_m702.tenant,id text NOT NULL,PRIMARY KEY(tenant,id));
CREATE TABLE timeline_m702.scope(tenant text NOT NULL REFERENCES timeline_m702.tenant,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(tenant,project,movie,studio));
CREATE TABLE timeline_m702.session(tenant text NOT NULL,id text NOT NULL,principal text NOT NULL,csrf_hash text NOT NULL CHECK(csrf_hash ~ '^[a-f0-9]{64}$'),origin text NOT NULL,
 expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant,id),FOREIGN KEY(tenant,principal) REFERENCES timeline_m702.principal);
CREATE TABLE timeline_m702.access_grant(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,principal text NOT NULL,
 can_read boolean NOT NULL,can_create boolean NOT NULL CHECK(NOT can_create OR can_read),
 PRIMARY KEY(tenant,project,movie,studio,principal),FOREIGN KEY(tenant,project,movie,studio) REFERENCES timeline_m702.scope,FOREIGN KEY(tenant,principal) REFERENCES timeline_m702.principal);
CREATE TABLE timeline_m702.proof_key(action text PRIMARY KEY CHECK(action IN('read','create')),login name NOT NULL UNIQUE,secret bytea NOT NULL CHECK(octet_length(secret)=32),enabled boolean NOT NULL DEFAULT true);
CREATE TABLE timeline_m702.used_proof(nonce text PRIMARY KEY CHECK(nonce ~ '^[a-f0-9]{48}$'),tenant text NOT NULL,session_id text NOT NULL,expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant,session_id) REFERENCES timeline_m702.session);
CREATE TABLE timeline_m702.policy(version text PRIMARY KEY,enabled boolean NOT NULL DEFAULT true);
INSERT INTO timeline_m702.policy VALUES('story-recap-timeline-policy-v1',true);
CREATE TABLE timeline_m702.dependency(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,
 m6_id text NOT NULL,hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,m6_id),
 FOREIGN KEY(tenant,project,movie,studio) REFERENCES timeline_m702.scope,
 FOREIGN KEY(tenant,project,movie,studio,m6_id) REFERENCES highlight_m602.version(tenant,project,movie,studio,id));
CREATE TABLE timeline_m702.reservation(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,key text NOT NULL CHECK(length(key) BETWEEN 1 AND 128),
 proposal jsonb NOT NULL CHECK(octet_length(proposal::text)<=3145728),proposal_hash text NOT NULL CHECK(proposal_hash ~ '^[a-f0-9]{64}$'),dependency_id text NOT NULL,
 actor text NOT NULL,session_id text NOT NULL,created_at text NOT NULL,challenge text NOT NULL,backend int NOT NULL,tx text NOT NULL,
 PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,key),
 FOREIGN KEY(tenant,project,movie,studio,dependency_id) REFERENCES timeline_m702.dependency(tenant,project,movie,studio,id),FOREIGN KEY(tenant,session_id) REFERENCES timeline_m702.session,
 FOREIGN KEY(tenant,actor) REFERENCES timeline_m702.principal);
CREATE TABLE timeline_m702.version(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,id text NOT NULL,version int NOT NULL CHECK(version BETWEEN 1 AND 1000000),
 previous_id text,dependency_id text NOT NULL,reservation_id text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=3145728),hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),PRIMARY KEY(tenant,project,movie,studio,id),UNIQUE(tenant,project,movie,studio,version),UNIQUE(tenant,project,movie,studio,reservation_id),
 CHECK((version=1)=(previous_id IS NULL)),FOREIGN KEY(tenant,project,movie,studio,previous_id) REFERENCES timeline_m702.version(tenant,project,movie,studio,id),
 FOREIGN KEY(tenant,project,movie,studio,dependency_id) REFERENCES timeline_m702.dependency(tenant,project,movie,studio,id),
 FOREIGN KEY(tenant,project,movie,studio,reservation_id) REFERENCES timeline_m702.reservation(tenant,project,movie,studio,id));
CREATE TABLE timeline_m702.repository_head(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,revision int NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 1000000),id text,
 PRIMARY KEY(tenant,project,movie,studio),CHECK((revision=0)=(id IS NULL)),FOREIGN KEY(tenant,project,movie,studio) REFERENCES timeline_m702.scope,
 FOREIGN KEY(tenant,project,movie,studio,id) REFERENCES timeline_m702.version);
CREATE TABLE timeline_m702.audit_event(tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,version_id text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536),hash text NOT NULL,
 PRIMARY KEY(tenant,project,movie,studio,version_id),FOREIGN KEY(tenant,project,movie,studio,version_id) REFERENCES timeline_m702.version(tenant,project,movie,studio,id));
CREATE FUNCTION timeline_m702.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,timeline_m702,pg_temp AS $$ BEGIN RAISE EXCEPTION 'T702_IMMUTABLE'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['dependency','reservation','version','audit_event'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON timeline_m702.%I FOR EACH ROW EXECUTE FUNCTION timeline_m702.immutable()',t);
 EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON timeline_m702.%I FOR EACH STATEMENT EXECUTE FUNCTION timeline_m702.immutable()',t);
END LOOP; END $$;
-- Archival coordinates derived from immutable M6 rows, never request-authored.
CREATE FUNCTION timeline_m702.m6_snapshot(t text,p text,m text,s text,vid text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
DECLARE v highlight_m602.version; raw jsonb; parent_raw jsonb; dep jsonb; sc jsonb; obs jsonb; digest text;
BEGIN
 SELECT * INTO v FROM highlight_m602.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,vid); IF NOT FOUND THEN RETURN NULL; END IF;
 raw:=highlight_m602.version_view(t,p,m,s,vid); parent_raw:=highlight_m602.version_view(t,p,m,s,v.previous_id); dep:=raw->'dependency';
 sc:=jsonb_build_object('tenantId',t,'projectId',p,'movieId',m,'studioId',s);
 obs:=jsonb_build_object('status','RESOLVED_SYNTHETIC',
 'view',jsonb_build_object('record',raw->'record','recordHash',raw->'recordHash','currentness','CURRENT_AT_READ'),
 'head',jsonb_build_object('scope',sc,'revision',v.version,'identity',raw->'identity'),
 'parent',CASE WHEN parent_raw IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('record',parent_raw->'record','recordHash',parent_raw->'recordHash','currentness','CURRENT_AT_READ') END,
 'dependency',jsonb_build_object('id',dep->'id','hash',dep->'hash','capture',dep->'capture'),
 'current',jsonb_build_object('dependencyId',dep->'id','dependencyHash',dep->'hash','source',dep->'capture'->'current','policyEnabled',true,'policyVersion','story-highlight-policy-v1','rubricVersion','story-highlight-rubric-v1'));
 digest:=timeline_m702.digest('story-recap-timeline-stored-dependency-v1',jsonb_build_object('schemaVersion','story-recap-timeline-stored-dependency-v1','scope',sc,'observation',obs));
 RETURN jsonb_build_object('id','tldep-'||digest,'hash',digest,'scope',sc,'observation',obs,'m6Record',raw,'m6Parent',parent_raw);
END $$;
CREATE FUNCTION timeline_m702.load_dependency(t text,p text,m text,s text,d text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
 SELECT timeline_m702.m6_snapshot(t,p,m,s,x.m6_id) FROM timeline_m702.dependency x WHERE (x.tenant,x.project,x.movie,x.studio,x.id)=(t,p,m,s,d)
$$;
-- Separate present eligibility, with volatile snapshots after lock acquisition.
CREATE FUNCTION timeline_m702.m6_current(t text,p text,m text,s text,vid text) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
 SELECT coalesce((SELECT h.id=v.id AND h.revision=v.version AND h.id IS NOT NULL AND c.dependency_id=v.dependency_id AND c.observed_reference=d.source_reference
 AND v.payload->'plan'->'plan'->>'status'='PLANNED' AND jsonb_array_length(v.payload->'plan'->'plan'->'sourceOrder')>0
 AND EXISTS(SELECT 1 FROM highlight_m602.policy WHERE version='story-highlight-policy-v1' AND rubric='story-highlight-rubric-v1' AND enabled)
 AND EXISTS(SELECT 1 FROM highlight_m602.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled)
 AND EXISTS(SELECT 1 FROM timeline_m702.policy WHERE version='story-recap-timeline-policy-v1' AND enabled)
 FROM highlight_m602.version v JOIN highlight_m602.repository_head h USING(tenant,project,movie,studio)
 JOIN highlight_m602.current_dependency c USING(tenant,project,movie,studio)
 JOIN highlight_m602.dependency d ON (d.tenant,d.project,d.movie,d.studio,d.id)=(c.tenant,c.project,c.movie,c.studio,c.dependency_id)
 WHERE (v.tenant,v.project,v.movie,v.studio,v.id)=(t,p,m,s,vid)),false)
$$;
CREATE FUNCTION timeline_m702.current_observation(t text,p text,m text,s text,vid text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
DECLARE d jsonb; obs jsonb; h highlight_m602.repository_head; c highlight_m602.current_dependency; dep highlight_m602.dependency; sc jsonb; v highlight_m602.version;
BEGIN
 d:=timeline_m702.m6_snapshot(t,p,m,s,vid); IF d IS NULL THEN RETURN NULL; END IF;
 obs:=d->'observation';sc:=d->'scope';
 SELECT * INTO h FROM highlight_m602.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s);
 SELECT * INTO v FROM highlight_m602.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,h.id);
 SELECT * INTO c FROM highlight_m602.current_dependency WHERE (tenant,project,movie,studio)=(t,p,m,s);
 SELECT * INTO dep FROM highlight_m602.dependency WHERE (tenant,project,movie,studio,id)=(t,p,m,s,c.dependency_id);
 obs:=jsonb_set(obs,'{head}',jsonb_build_object('scope',sc,'revision',h.revision,'identity',highlight_m602.identity(v)));
 obs:=jsonb_set(obs,'{view,currentness}',to_jsonb(CASE WHEN timeline_m702.m6_current(t,p,m,s,vid) THEN 'CURRENT_AT_READ' ELSE 'STALE_DEPENDENCIES' END));
 RETURN jsonb_set(obs,'{current}',jsonb_build_object('dependencyId',c.dependency_id,'dependencyHash',dep.hash,'source',c.observed_reference,
 'policyEnabled',EXISTS(SELECT 1 FROM highlight_m602.policy WHERE version='story-highlight-policy-v1' AND rubric='story-highlight-rubric-v1' AND enabled),
 'policyVersion','story-highlight-policy-v1','rubricVersion','story-highlight-rubric-v1'));
END $$;
CREATE FUNCTION timeline_m702.identity(v timeline_m702.version) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
 SELECT CASE WHEN v.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',v.id,'recordHash',v.hash,'recordHashDomain','story-recap-timeline-saved-record-v1','planHash',v.plan_hash,'planHashDomain','story-recap-timeline-plan-v1','version',v.version) END
$$;
CREATE FUNCTION timeline_m702.version_view(t text,p text,m text,s text,vid text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
DECLARE v timeline_m702.version; parent timeline_m702.version; r timeline_m702.reservation; a timeline_m702.audit_event;  d jsonb;
BEGIN
 SELECT * INTO v FROM timeline_m702.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,vid); IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM timeline_m702.reservation WHERE (tenant,project,movie,studio,id)=(t,p,m,s,v.reservation_id);
 SELECT * INTO parent FROM timeline_m702.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,v.previous_id);
 SELECT * INTO a FROM timeline_m702.audit_event WHERE (tenant,project,movie,studio,version_id)=(t,p,m,s,vid);
 d:=timeline_m702.load_dependency(t,p,m,s,v.dependency_id);
 RETURN jsonb_build_object('identity',timeline_m702.identity(v),'record',v.payload,'recordHash',v.hash,'proposal',r.proposal,'dependency',d,'parent',timeline_m702.identity(parent),'audit',a.payload,'auditHash',a.hash,
 'current',timeline_m702.m6_current(t,p,m,s,d->'observation'->'view'->'record'->>'id'),
 'isHead',EXISTS(SELECT 1 FROM timeline_m702.repository_head hh WHERE (hh.tenant,hh.project,hh.movie,hh.studio,hh.id,hh.revision)=(t,p,m,s,v.id,v.version)));
END $$;
CREATE FUNCTION timeline_m702.complete_reservation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
DECLARE v timeline_m702.version; BEGIN
 SELECT * INTO v FROM timeline_m702.version WHERE (tenant,project,movie,studio,reservation_id)=(NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.id);
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM timeline_m702.audit_event WHERE (tenant,project,movie,studio,version_id)=(NEW.tenant,NEW.project,NEW.movie,NEW.studio,v.id)) THEN RAISE EXCEPTION 'T702_INCOMPLETE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM timeline_m702.session s JOIN timeline_m702.access_grant g ON (g.tenant,g.principal)=(s.tenant,s.principal)
 JOIN timeline_m702.scope c ON (c.tenant,c.project,c.movie,c.studio)=(g.tenant,g.project,g.movie,g.studio)
 WHERE (s.tenant,s.id,s.principal)=(NEW.tenant,NEW.session_id,NEW.actor) AND (g.project,g.movie,g.studio)=(NEW.project,NEW.movie,NEW.studio) AND NOT s.revoked AND s.expires_at>clock_timestamp() AND g.can_read AND g.can_create AND c.enabled)
 THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM highlight_m602.session ss JOIN highlight_m602.access_grant gg ON (gg.tenant,gg.principal)=(ss.tenant,ss.principal)
 WHERE (ss.tenant,ss.id,ss.principal)=(NEW.tenant,NEW.session_id,NEW.actor) AND (gg.project,gg.movie,gg.studio)=(NEW.project,NEW.movie,NEW.studio)
 AND NOT ss.revoked AND ss.expires_at>clock_timestamp() AND gg.can_read) THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM timeline_m702.dependency dd WHERE (dd.tenant,dd.project,dd.movie,dd.studio,dd.id)=(NEW.tenant,NEW.project,NEW.movie,NEW.studio,NEW.dependency_id)
 AND timeline_m702.m6_current(NEW.tenant,NEW.project,NEW.movie,NEW.studio,dd.m6_id)) THEN RAISE EXCEPTION 'T702_STALE_SOURCE'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservation_complete AFTER INSERT ON timeline_m702.reservation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION timeline_m702.complete_reservation();
CREATE FUNCTION timeline_m702.gateway(action text,wire text,mac text,body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,timeline_m702,pg_temp AS $$
DECLARE w jsonb; b jsonb; sc jsonb; k timeline_m702.proof_key; sess timeline_m702.session; g timeline_m702.access_grant;  h timeline_m702.repository_head;
 r timeline_m702.reservation; v timeline_m702.version; parent timeline_m702.version; d jsonb; proposed jsonb; expected jsonb; audit jsonb;
 t text;p text;m text;s text;op text; nowms bigint; affected int; entries jsonb; lim int; policy_enabled boolean; selected_m6_id text; current_obs jsonb;
BEGIN
 IF octet_length(wire)>8192 OR octet_length(body)>3145728 THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
 w:=wire::jsonb;b:=body::jsonb;op:=b->>'op';sc:=w->'scope';
 IF timeline_m702.keys(w,ARRAY['schemaVersion','scope','sessionId','principalId','action','payloadHash','nonce','pid','transactionId','expiresAtMs','origin','csrfHash','method','fetchSite']) IS NOT TRUE
 OR timeline_m702.keys(sc,ARRAY['tenantId','projectId','movieId','studioId']) IS NOT TRUE THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
 t:=sc->>'tenantId';p:=sc->>'projectId';m:=sc->>'movieId';s:=sc->>'studioId';
 SELECT * INTO k FROM timeline_m702.proof_key WHERE proof_key.action=gateway.action AND login=session_user AND enabled FOR SHARE;
 IF NOT FOUND OR w->>'schemaVersion' IS DISTINCT FROM 'disposable-timeline-m702-authorization-v1' OR w->>'action' IS DISTINCT FROM action OR mac !~ '^[a-f0-9]{64}$'
 OR encode(highlight_m602_crypto.hmac(convert_to(wire,'UTF8'),k.secret,'sha256'),'hex') IS DISTINCT FROM mac
 OR (w->>'pid')::int IS DISTINCT FROM pg_backend_pid() OR w->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text
 OR w->>'payloadHash' IS DISTINCT FROM encode(highlight_m602_crypto.digest(convert_to(body,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
 -- Lock order: action key, scope, session, exact principal grant, policy,
 -- current-dependency observation, repository head. Writers lock those same rows.
 PERFORM 1 FROM timeline_m702.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 SELECT * INTO sess FROM timeline_m702.session WHERE (tenant,id,principal)=(t,w->>'sessionId',w->>'principalId') FOR SHARE;
 SELECT * INTO g FROM timeline_m702.access_grant WHERE (tenant,project,movie,studio,principal)=(t,p,m,s,w->>'principalId') FOR SHARE;
 nowms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF sess.id IS NULL OR g.principal IS NULL OR sess.revoked OR sess.expires_at<=clock_timestamp() OR NOT g.can_read OR action='create' AND NOT g.can_create
 OR w->>'origin' IS DISTINCT FROM sess.origin OR w->>'csrfHash' IS DISTINCT FROM sess.csrf_hash OR w->>'fetchSite' IS DISTINCT FROM 'same-origin'
 OR w->>'method' IS DISTINCT FROM (CASE WHEN action='create' THEN 'POST' ELSE 'GET' END)
 OR w->>'expiresAtMs' IS NULL OR (w->>'expiresAtMs')::bigint<=nowms OR (w->>'expiresAtMs')::bigint>nowms+5000 THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 -- Cooperating cross-schema order: M7 key/scope/session/grant, then M6
 -- scope/session/grant/policy/current_dependency/head (same order as M6 writer),
 -- then M7 policy and head. M6 writers never acquire M7 rows.
 PERFORM 1 FROM highlight_m602.scope WHERE (tenant,project,movie,studio)=(t,p,m,s) AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 PERFORM 1 FROM highlight_m602.session WHERE (tenant,id,principal)=(t,sess.id,sess.principal) AND NOT revoked AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 PERFORM 1 FROM highlight_m602.access_grant WHERE (tenant,project,movie,studio,principal)=(t,p,m,s,sess.principal) AND can_read FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
 PERFORM 1 FROM highlight_m602.policy WHERE version='story-highlight-policy-v1' AND rubric='story-highlight-rubric-v1' FOR SHARE;
 PERFORM 1 FROM highlight_m602.current_dependency WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 PERFORM 1 FROM highlight_m602.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR SHARE;
 SELECT enabled INTO policy_enabled FROM timeline_m702.policy WHERE version='story-recap-timeline-policy-v1' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'T702_STALE_SOURCE'; END IF;
 DELETE FROM timeline_m702.used_proof WHERE expires_at<clock_timestamp();
 IF (SELECT count(*) FROM timeline_m702.used_proof)>=10000 THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
 INSERT INTO timeline_m702.used_proof VALUES(w->>'nonce',t,sess.id,to_timestamp((w->>'expiresAtMs')::bigint/1000.0)) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
 IF op='capture' THEN
  IF timeline_m702.keys(b,ARRAY['op','input','key','proposalHash']) IS NOT TRUE OR b->'input'->'scope' IS DISTINCT FROM sc THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  IF action='create' THEN
   SELECT * INTO r FROM timeline_m702.reservation WHERE (tenant,project,movie,studio,key)=(t,p,m,s,b->>'key');
   IF FOUND AND r.proposal_hash IS DISTINCT FROM b->>'proposalHash' THEN RAISE EXCEPTION 'T702_IDEMPOTENCY_CONFLICT'; END IF;
  END IF;
  IF r.id IS NOT NULL THEN d:=timeline_m702.load_dependency(t,p,m,s,r.dependency_id);
  ELSE d:=timeline_m702.m6_snapshot(t,p,m,s,b->'input'->'selected'->>'id'); END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'T702_NOT_FOUND'; END IF;
  selected_m6_id:=d->'observation'->'view'->'record'->>'id';
  current_obs:=timeline_m702.current_observation(t,p,m,s,selected_m6_id);
  RETURN jsonb_build_object('dependency',d,'reused',r.id IS NOT NULL,'current',policy_enabled AND timeline_m702.m6_current(t,p,m,s,selected_m6_id),'observation',current_obs);
 ELSIF action='read' AND op='version' THEN
  IF timeline_m702.keys(b,ARRAY['op','id']) IS NOT TRUE THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  RETURN timeline_m702.version_view(t,p,m,s,b->>'id');
 ELSIF action='read' AND op='head' THEN
  IF timeline_m702.keys(b,ARRAY['op']) IS NOT TRUE THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  SELECT * INTO h FROM timeline_m702.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s);
  RETURN jsonb_build_object('revision',h.revision,'head',timeline_m702.version_view(t,p,m,s,h.id));
 ELSIF action='read' AND op='history' THEN
  IF timeline_m702.keys(b,ARRAY['op','afterVersion','limit']) IS NOT TRUE OR b->>'limit' IS NULL OR b->>'afterVersion' IS NULL OR (b->>'limit')::int NOT BETWEEN 1 AND 5 OR (b->>'afterVersion')::int NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  lim:=(b->>'limit')::int;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'version')::int),'[]'::jsonb) INTO entries FROM
   (SELECT jsonb_build_object('id',id,'version',version) x FROM timeline_m702.version WHERE (tenant,project,movie,studio)=(t,p,m,s) AND version>(b->>'afterVersion')::int ORDER BY version LIMIT lim+1) q;
  RETURN entries;
 ELSIF action='read' AND op='operation' THEN
  IF timeline_m702.keys(b,ARRAY['op','key','proposalHash']) IS NOT TRUE THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  SELECT * INTO r FROM timeline_m702.reservation WHERE (tenant,project,movie,studio,key)=(t,p,m,s,b->>'key');
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.proposal_hash IS DISTINCT FROM b->>'proposalHash' THEN RAISE EXCEPTION 'T702_IDEMPOTENCY_CONFLICT'; END IF;
  SELECT * INTO v FROM timeline_m702.version WHERE (tenant,project,movie,studio,reservation_id)=(t,p,m,s,r.id);
  RETURN timeline_m702.version_view(t,p,m,s,v.id);
 ELSIF action='create' AND op='reserve' THEN
  IF timeline_m702.keys(b,ARRAY['op','proposal','proposalHash','dependencyId','dependencyHash']) IS NOT TRUE THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  proposed:=b->'proposal';
  IF timeline_m702.keys(proposed,ARRAY['schemaVersion','scope','idempotencyKey','expectedRevision','previous','plan']) IS NOT TRUE OR proposed->>'schemaVersion' IS DISTINCT FROM 'story-recap-timeline-save-proposal-v1'
   OR proposed->'scope' IS DISTINCT FROM sc OR timeline_m702.digest('story-recap-timeline-save-proposal-v1',proposed) IS DISTINCT FROM b->>'proposalHash' THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  IF proposed->>'expectedRevision' IS NULL OR (proposed->>'expectedRevision') !~ '^(0|[1-9][0-9]{0,5})$' OR proposed->>'idempotencyKey' IS NULL
   OR (proposed->>'idempotencyKey') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  SELECT * INTO h FROM timeline_m702.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'T702_FORBIDDEN'; END IF;
  SELECT * INTO r FROM timeline_m702.reservation WHERE (tenant,project,movie,studio,key)=(t,p,m,s,proposed->>'idempotencyKey');
  IF FOUND THEN
   IF r.proposal_hash IS DISTINCT FROM b->>'proposalHash' OR r.proposal IS DISTINCT FROM proposed THEN RAISE EXCEPTION 'T702_IDEMPOTENCY_CONFLICT'; END IF;
   SELECT * INTO v FROM timeline_m702.version WHERE (tenant,project,movie,studio,reservation_id)=(t,p,m,s,r.id);
   IF v.id IS NULL THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
   RETURN jsonb_build_object('status','REUSED','id',v.id);
  END IF;
  IF NOT policy_enabled THEN RAISE EXCEPTION 'T702_STALE_SOURCE'; END IF;
  d:=timeline_m702.m6_snapshot(t,p,m,s,proposed->'plan'->'plan'->'input'->'selected'->>'id');
  selected_m6_id:=d->'observation'->'view'->'record'->>'id';
  IF d IS NULL OR d->>'id' IS DISTINCT FROM b->>'dependencyId' OR d->>'hash' IS DISTINCT FROM b->>'dependencyHash'
   OR NOT timeline_m702.m6_current(t,p,m,s,selected_m6_id) THEN RAISE EXCEPTION 'T702_STALE_SOURCE'; END IF;
  IF (proposed->>'expectedRevision')::int<>h.revision THEN RAISE EXCEPTION 'T702_REVISION_CONFLICT'; END IF;
  SELECT * INTO parent FROM timeline_m702.version WHERE (tenant,project,movie,studio,id)=(t,p,m,s,h.id);
  IF proposed->'previous' IS DISTINCT FROM timeline_m702.identity(parent) THEN RAISE EXCEPTION 'T702_REVISION_CONFLICT'; END IF;
  IF h.revision>=1000000 OR proposed->'plan'->>'planHash' IS DISTINCT FROM timeline_m702.digest('story-recap-timeline-plan-v1',proposed->'plan'->'plan')
   OR proposed->'plan'->'plan'->'input'->'policy'->>'schemaVersion' IS DISTINCT FROM 'story-recap-timeline-policy-v1' THEN RAISE EXCEPTION 'T702_INVALID_PLAN'; END IF;
  INSERT INTO timeline_m702.dependency VALUES(t,p,m,s,d->>'id',selected_m6_id,d->>'hash') ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM timeline_m702.dependency dd WHERE (dd.tenant,dd.project,dd.movie,dd.studio,dd.id,dd.m6_id,dd.hash)=(t,p,m,s,d->>'id',selected_m6_id,d->>'hash')) THEN RAISE EXCEPTION 'T702_INTEGRITY_FAILED'; END IF;
  INSERT INTO timeline_m702.reservation VALUES(t,p,m,s,'reservation-'||encode(highlight_m602_crypto.gen_random_bytes(16),'hex'),proposed->>'idempotencyKey',proposed,b->>'proposalHash',d->>'id',
   sess.principal,sess.id,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),encode(highlight_m602_crypto.gen_random_bytes(32),'hex'),pg_backend_pid(),pg_current_xact_id()::text) RETURNING * INTO r;
  RETURN jsonb_build_object('status','OPEN','id',r.id,'version',h.revision+1,'createdAt',r.created_at,'challenge',r.challenge,'dependencyId',r.dependency_id,'dependencyHash',d->>'hash');
 ELSIF action='create' AND op='finish' THEN
  IF timeline_m702.keys(b,ARRAY['op','reservationId','record','recordHash','validationProof']) IS NOT TRUE THEN RAISE EXCEPTION 'T702_INVALID_INPUT'; END IF;
  SELECT * INTO r FROM timeline_m702.reservation WHERE (tenant,project,movie,studio,id)=(t,p,m,s,b->>'reservationId') FOR UPDATE;
  IF NOT FOUND OR r.backend<>pg_backend_pid() OR r.tx<>pg_current_xact_id()::text OR r.actor<>sess.principal OR r.session_id<>sess.id THEN RAISE EXCEPTION 'T702_PROOF_INVALID'; END IF;
  d:=timeline_m702.load_dependency(t,p,m,s,r.dependency_id);
  IF NOT policy_enabled OR NOT timeline_m702.m6_current(t,p,m,s,d->'observation'->'view'->'record'->>'id') THEN RAISE EXCEPTION 'T702_STALE_SOURCE'; END IF;
  SELECT * INTO h FROM timeline_m702.repository_head WHERE (tenant,project,movie,studio)=(t,p,m,s) FOR UPDATE;
  IF h.revision<>(r.proposal->>'expectedRevision')::int THEN RAISE EXCEPTION 'T702_REVISION_CONFLICT'; END IF;
  expected:=jsonb_build_object('schemaVersion','story-recap-timeline-saved-record-v1','scope',sc,'id',r.id,'version',h.revision+1,'previous',r.proposal->'previous','expectedRevision',h.revision,
   'idempotencyKey',r.key,'proposalHash',r.proposal_hash,'dependencyId',r.dependency_id,'dependencyHash',d->>'hash','createdAt',r.created_at,
   'editor',jsonb_build_object('principalId',sess.principal,'sessionId',sess.id),'plan',r.proposal->'plan',
   'restrictions','{"execution":"SYNTHETIC_ONLY","storage":"DISPOSABLE_POSTGRES_ONLY","humanApproval":"NONE","sourceVerified":false,"eligibleForRealTts":false,"eligibleForPublication":false,"originalMovieAudio":"EXCLUDED","voiceSynchronization":"UNSUPPORTED","rendering":"NOT_RENDERED","spendingAuthority":"NONE","syntheticAncestry":true}'::jsonb);
  IF b->'record' IS DISTINCT FROM expected OR b->>'recordHash' IS DISTINCT FROM timeline_m702.digest('story-recap-timeline-saved-record-v1',expected)
   OR b->>'validationProof' IS DISTINCT FROM encode(highlight_m602_crypto.hmac(convert_to('story-recap-timeline-currentness-fence-v1'||chr(10)||timeline_m702.canonical(jsonb_build_object(
    'schemaVersion','story-recap-timeline-currentness-fence-v1','scope',sc,'reservationId',r.id,'challenge',r.challenge,'recordHash',b->>'recordHash','dependencyHash',d->>'hash','backendPid',pg_backend_pid(),'transactionId',pg_current_xact_id()::text)),'UTF8'),k.secret,'sha256'),'hex') THEN RAISE EXCEPTION 'T702_INVALID_PLAN'; END IF;
  INSERT INTO timeline_m702.version VALUES(t,p,m,s,r.id,h.revision+1,h.id,r.dependency_id,r.id,expected,b->>'recordHash',r.proposal->'plan'->>'planHash');
  UPDATE timeline_m702.repository_head SET revision=h.revision+1,id=r.id WHERE (tenant,project,movie,studio)=(t,p,m,s) AND revision=h.revision AND id IS NOT DISTINCT FROM h.id;
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'T702_REVISION_CONFLICT'; END IF;
  audit:=jsonb_build_object('schemaVersion','story-recap-timeline-save-audit-v1','scope',sc,'versionId',r.id,'version',h.revision+1,'previous',r.proposal->'previous',
   'recordHash',b->>'recordHash','proposalHash',r.proposal_hash,'dependencyId',r.dependency_id,'dependencyHash',d->>'hash','actor',expected->'editor','createdAt',r.created_at,'action','SAVE_TIMELINE_VERSION');
  INSERT INTO timeline_m702.audit_event VALUES(t,p,m,s,r.id,audit,timeline_m702.digest('story-recap-timeline-save-audit-v1',audit));
  RETURN jsonb_build_object('status','SAVED','id',r.id);
 ELSIF action='create' AND op='seal' THEN
  IF NOT policy_enabled OR timeline_m702.keys(b,ARRAY['op','id']) IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM timeline_m702.version saved JOIN timeline_m702.dependency dep ON (dep.tenant,dep.project,dep.movie,dep.studio,dep.id)=(saved.tenant,saved.project,saved.movie,saved.studio,saved.dependency_id)
   WHERE (saved.tenant,saved.project,saved.movie,saved.studio,saved.id)=(t,p,m,s,b->>'id') AND timeline_m702.m6_current(t,p,m,s,dep.m6_id)) THEN RAISE EXCEPTION 'T702_STALE_SOURCE'; END IF;
  RETURN '{"sealed":true}';
 END IF;
 RAISE EXCEPTION 'T702_INVALID_INPUT';
END $$;
CREATE FUNCTION timeline_m702.read(w text,m text,p text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,timeline_m702,pg_temp AS $$ SELECT timeline_m702.gateway('read',w,m,p) $$;
CREATE FUNCTION timeline_m702.create(w text,m text,p text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,timeline_m702,pg_temp AS $$ SELECT timeline_m702.gateway('create',w,m,p) $$;
REVOKE ALL ON ALL TABLES IN SCHEMA timeline_m702 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA timeline_m702 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA timeline_m702 FROM PUBLIC;
GRANT USAGE ON SCHEMA timeline_m702 TO timeline_m702_read,timeline_m702_create;
GRANT EXECUTE ON FUNCTION timeline_m702.read(text,text,text) TO timeline_m702_read;
GRANT EXECUTE ON FUNCTION timeline_m702.create(text,text,text) TO timeline_m702_create;
RESET ROLE;
