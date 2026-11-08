-- New owned disposable database only. No production migration or M6/M7/M8 grants.
CREATE ROLE maintenance_m806_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA maintenance_m806 AUTHORIZATION maintenance_m806_owner;
CREATE SCHEMA maintenance_m806_crypto;
CREATE EXTENSION pgcrypto WITH SCHEMA maintenance_m806_crypto;
GRANT USAGE ON SCHEMA maintenance_m806_crypto TO maintenance_m806_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SET ROLE maintenance_m806_owner;
SET search_path=pg_catalog,maintenance_m806,pg_temp;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE FUNCTION maintenance_m806.canonical(j jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$
DECLARE out text; BEGIN
 CASE jsonb_typeof(j)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_json(k)::text||':'||maintenance_m806.canonical(v),',' ORDER BY k COLLATE "C"),'')||'}' INTO out FROM jsonb_each(j) e(k,v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(maintenance_m806.canonical(v),',' ORDER BY i),'')||']' INTO out FROM jsonb_array_elements(j) WITH ORDINALITY e(v,i);
 WHEN 'number' THEN IF j::text !~ '^-?(0|[1-9][0-9]*)$' OR abs((j::text)::numeric)>9007199254740991 THEN RAISE EXCEPTION 'M806_INVALID_NUMBER'; END IF; out:=j::text;
 ELSE out:=j::text; END CASE; RETURN out;
END $$;
CREATE FUNCTION maintenance_m806.digest(d text,j jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$ SELECT encode(maintenance_m806_crypto.digest(convert_to(d||chr(10)||maintenance_m806.canonical(j),'UTF8'),'sha256'),'hex') $$;
CREATE FUNCTION maintenance_m806.keys(j jsonb,k text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$ SELECT jsonb_typeof(j)='object' AND (SELECT array_agg(x ORDER BY x COLLATE "C") FROM jsonb_object_keys(j) x)=(SELECT array_agg(x ORDER BY x COLLATE "C") FROM unnest(k) x) $$;
CREATE FUNCTION maintenance_m806.restrictions() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$ SELECT '{"environment":"DISPOSABLE_FAKE_ONLY","execution":"SYNTHETIC_ONLY","media":"SIMULATED_NOT_MEDIA","verification":"MEDIA_VERIFICATION_NOT_PERFORMED","rendering":"NOT_RENDERED","humanApproval":"NONE","sourceVerified":false,"spendingAuthority":"NONE","publicationEligibility":false,"originalMovieAudio":"EXCLUDED","synthesizedNarration":"NONE","speech":"NOT_VERIFIED","voiceSynchronization":"UNSUPPORTED","operationalRecovery":false,"originalProcessQuiescence":"NOT_ASSERTED"}'::jsonb $$;
CREATE FUNCTION maintenance_m806.valid(kind text,j jsonb,ctx jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$
DECLARE fields text[]; d text; b jsonb; k text; BEGIN
 d:=CASE kind WHEN 'writer' THEN 'writer-closure' WHEN 'reader' THEN 'reader-closure' WHEN 'successor' THEN 'successor-observation' ELSE kind END;
 IF maintenance_m806.keys(j,ARRAY['schemaVersion','namespace','scope','restrictions','body']) IS NOT TRUE OR j->>'schemaVersion' IS DISTINCT FROM 'story-recap-fake-maintenance-'||d||'-v1' OR j->'restrictions' IS DISTINCT FROM maintenance_m806.restrictions() OR (j->>'namespace') IS DISTINCT FROM ctx->>'namespace' OR j->'scope' IS DISTINCT FROM ctx->'scope' THEN RETURN false; END IF;
 fields:=CASE kind
 WHEN 'decision' THEN ARRAY['decisionId','rootId','rootHash','writerId','readerId','expectedGeneration','expectedRevision','purpose','evidenceHashes']
 WHEN 'writer' THEN ARRAY['rootId','ownerId','ownerHash','supervisorHash','guardHash','generation','descriptorsClosed','noFutureIO','descendants','origin']
 WHEN 'reader' THEN ARRAY['rootId','ownerId','ownerHash','supervisorHash','guardHash','generation','descriptorsClosed','noFutureIO','descendants','origin']
 WHEN 'successor' THEN ARRAY['rootId','writerHash','readerHash','guardHash','generation','revision','observation','origin'] ELSE NULL END;
 IF fields IS NULL OR maintenance_m806.keys(j->'body',fields) IS NOT TRUE THEN RETURN false; END IF;
 b:=j->'body';
 FOR k IN SELECT unnest(fields) LOOP
  IF b->k IS NULL OR b->k='null'::jsonb THEN RETURN false; END IF;
  IF k IN('rootId','decisionId','writerId','readerId','ownerId') AND (jsonb_typeof(b->k)<>'string' OR b->>k !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$') THEN RETURN false; END IF;
  IF k LIKE '%Hash' AND (jsonb_typeof(b->k)<>'string' OR b->>k !~ '^[a-f0-9]{64}$') THEN RETURN false; END IF;
  IF k IN('generation','expectedGeneration','revision','expectedRevision') AND (jsonb_typeof(b->k)<>'number' OR b->>k !~ '^(0|[1-9][0-9]*)$' OR (b->>k)::numeric>1000000 OR k IN('generation','expectedGeneration') AND (b->>k)::numeric<1) THEN RETURN false; END IF;
 END LOOP;
 IF kind='decision' THEN
  RETURN b->>'purpose'='OBSERVE_CLOSURE_ONLY' AND jsonb_typeof(b->'evidenceHashes')='array' AND jsonb_array_length(b->'evidenceHashes')=3 AND (SELECT count(DISTINCT v)=3 AND bool_and(jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[a-f0-9]{64}$') FROM jsonb_array_elements(b->'evidenceHashes') x(v));
 END IF;
 IF b->>'origin' IS DISTINCT FROM 'ORIGINAL_PHASE0_SUPERVISOR' THEN RETURN false; END IF;
 IF kind='successor' THEN RETURN (b->>'observation' IN('QUALIFIED_FOR_FUTURE_PHASE_ONLY','BLOCKED')) IS TRUE; END IF;
 RETURN jsonb_typeof(b->'descriptorsClosed')='boolean' AND jsonb_typeof(b->'noFutureIO')='boolean' AND (b->>'descendants' IN('PROVEN_QUIESCENT','UNKNOWN')) IS TRUE;
END $$;
CREATE TABLE maintenance_m806.quota(id boolean PRIMARY KEY DEFAULT true CHECK(id),decisions int NOT NULL DEFAULT 0 CHECK(decisions BETWEEN 0 AND 16),evidence int NOT NULL DEFAULT 0 CHECK(evidence BETWEEN 0 AND 32),bytes int NOT NULL DEFAULT 0 CHECK(bytes BETWEEN 0 AND 1048576));
INSERT INTO maintenance_m806.quota(id) VALUES(true);
CREATE TABLE maintenance_m806.scope(scope_key text PRIMARY KEY CHECK(octet_length(scope_key)<=2048),namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,enabled boolean NOT NULL DEFAULT true,UNIQUE(namespace,tenant,project,movie,studio));
CREATE TABLE maintenance_m806.principal(scope_key text NOT NULL REFERENCES maintenance_m806.scope,id text NOT NULL,PRIMARY KEY(scope_key,id));
CREATE TABLE maintenance_m806.session(scope_key text NOT NULL,id text NOT NULL,principal text NOT NULL,csrf_hash text NOT NULL,origin text NOT NULL,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,PRIMARY KEY(scope_key,id),UNIQUE(scope_key,id,principal),FOREIGN KEY(scope_key,principal) REFERENCES maintenance_m806.principal);
CREATE TABLE maintenance_m806.access_grant(scope_key text NOT NULL,principal text NOT NULL,actions text[] NOT NULL,root_ids text[] NOT NULL,PRIMARY KEY(scope_key,principal),FOREIGN KEY(scope_key,principal) REFERENCES maintenance_m806.principal);
CREATE TABLE maintenance_m806.proof_key(action text PRIMARY KEY,login name NOT NULL UNIQUE,secret bytea NOT NULL CHECK(octet_length(secret)=32),enabled boolean NOT NULL DEFAULT true);
CREATE TABLE maintenance_m806.used_proof(nonce text PRIMARY KEY CHECK(nonce~'^[a-f0-9]{48}$'),scope_key text NOT NULL,session_id text NOT NULL,FOREIGN KEY(scope_key,session_id) REFERENCES maintenance_m806.session);
CREATE TABLE maintenance_m806.root(scope_key text NOT NULL REFERENCES maintenance_m806.scope,id text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=8192),hash text NOT NULL CHECK(hash~'^[a-f0-9]{64}$'),PRIMARY KEY(scope_key,id));
CREATE TABLE maintenance_m806.root_head(scope_key text NOT NULL,id text NOT NULL,generation int NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 1000000),revision int NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 1000000),enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(scope_key,id),FOREIGN KEY(scope_key,id) REFERENCES maintenance_m806.root);
CREATE TABLE maintenance_m806.owner(scope_key text NOT NULL,root_id text NOT NULL,id text NOT NULL,kind text NOT NULL CHECK(kind IN('WRITER','READER')),payload jsonb NOT NULL CHECK(octet_length(payload::text)<=8192),hash text NOT NULL,PRIMARY KEY(scope_key,root_id,id),FOREIGN KEY(scope_key,root_id) REFERENCES maintenance_m806.root);
CREATE TABLE maintenance_m806.anchor(scope_key text NOT NULL,root_id text NOT NULL,kind text NOT NULL CHECK(kind IN('writer','reader','successor')),payload jsonb NOT NULL CHECK(octet_length(payload::text)<=8192),hash text NOT NULL CHECK(hash~'^[a-f0-9]{64}$'),PRIMARY KEY(scope_key,root_id,kind),UNIQUE(scope_key,root_id,kind,hash),FOREIGN KEY(scope_key,root_id) REFERENCES maintenance_m806.root);
CREATE TABLE maintenance_m806.decision(scope_key text NOT NULL,root_id text NOT NULL,id text NOT NULL,payload jsonb NOT NULL CHECK(octet_length(payload::text)<=8192),hash text NOT NULL,PRIMARY KEY(scope_key,root_id,id),UNIQUE(scope_key,id),FOREIGN KEY(scope_key,root_id) REFERENCES maintenance_m806.root);
CREATE TABLE maintenance_m806.state(scope_key text NOT NULL,root_id text NOT NULL,id text NOT NULL,revision int NOT NULL CHECK(revision BETWEEN 0 AND 1000000),status text NOT NULL CHECK(status IN('REGISTERED','EVIDENCE_PENDING','QUALIFICATION_BLOCKED','QUALIFIED_FOR_FUTURE_PHASE_ONLY','DECISION_RECONCILED')),last_session text NOT NULL,last_principal text NOT NULL,last_action text NOT NULL,deadline timestamptz NOT NULL,PRIMARY KEY(scope_key,root_id,id),FOREIGN KEY(scope_key,root_id,id) REFERENCES maintenance_m806.decision,FOREIGN KEY(scope_key,last_session,last_principal) REFERENCES maintenance_m806.session(scope_key,id,principal));
CREATE TABLE maintenance_m806.evidence(scope_key text NOT NULL,root_id text NOT NULL,decision_id text NOT NULL,kind text NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,PRIMARY KEY(scope_key,root_id,decision_id,kind),FOREIGN KEY(scope_key,root_id,decision_id) REFERENCES maintenance_m806.decision,FOREIGN KEY(scope_key,root_id,kind,hash) REFERENCES maintenance_m806.anchor(scope_key,root_id,kind,hash));
CREATE TABLE maintenance_m806.result(scope_key text NOT NULL,root_id text NOT NULL,decision_id text NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,PRIMARY KEY(scope_key,root_id,decision_id),FOREIGN KEY(scope_key,root_id,decision_id) REFERENCES maintenance_m806.decision);
CREATE TABLE maintenance_m806.audit_event(scope_key text NOT NULL,root_id text NOT NULL,decision_id text NOT NULL,revision int NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,PRIMARY KEY(scope_key,root_id,decision_id,revision),FOREIGN KEY(scope_key,root_id,decision_id) REFERENCES maintenance_m806.decision);
CREATE FUNCTION maintenance_m806.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$ BEGIN RAISE EXCEPTION 'M806_IMMUTABLE'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['root','owner','anchor','decision','evidence','result','audit_event','used_proof'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON maintenance_m806.%I FOR EACH ROW EXECUTE FUNCTION maintenance_m806.immutable()',t);
 EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON maintenance_m806.%I FOR EACH STATEMENT EXECUTE FUNCTION maintenance_m806.immutable()',t);
END LOOP; END $$;
CREATE FUNCTION maintenance_m806.complete() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$
DECLARE st maintenance_m806.state; BEGIN
 SELECT * INTO st FROM maintenance_m806.state WHERE (scope_key,root_id,id)=(NEW.scope_key,NEW.root_id,NEW.id);
 IF NOT EXISTS(SELECT 1 FROM maintenance_m806.audit_event a WHERE (a.scope_key,a.root_id,a.decision_id,a.revision)=(st.scope_key,st.root_id,st.id,st.revision)) THEN RAISE EXCEPTION 'M806_INCOMPLETE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM maintenance_m806.session s JOIN maintenance_m806.access_grant g ON (g.scope_key,g.principal)=(s.scope_key,s.principal)
 WHERE (s.scope_key,s.id,s.principal)=(st.scope_key,st.last_session,st.last_principal) AND NOT s.revoked AND s.expires_at>clock_timestamp() AND (st.last_action=ANY(g.actions)) IS TRUE AND array_position(g.actions,NULL) IS NULL AND (st.root_id=ANY(g.root_ids)) IS TRUE AND array_position(g.root_ids,NULL) IS NULL) OR st.deadline<=clock_timestamp() THEN RAISE EXCEPTION 'M806_AUTH_EXPIRED'; END IF;
 IF st.status IN('QUALIFICATION_BLOCKED','QUALIFIED_FOR_FUTURE_PHASE_ONLY','DECISION_RECONCILED') AND NOT EXISTS(SELECT 1 FROM maintenance_m806.result r WHERE (r.scope_key,r.root_id,r.decision_id)=(st.scope_key,st.root_id,st.id)) THEN RAISE EXCEPTION 'M806_INCOMPLETE'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transition_complete AFTER INSERT OR UPDATE ON maintenance_m806.state DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION maintenance_m806.complete();
CREATE FUNCTION maintenance_m806.view_decision(sk text,rid text,did text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$
 SELECT jsonb_build_object('decision',d.payload,'hash',d.hash,'status',s.status,'revision',s.revision,'rootGeneration',h.generation,'rootRevision',h.revision,
 'evidenceHashes',coalesce((SELECT jsonb_agg(e.hash ORDER BY e.kind) FROM maintenance_m806.evidence e WHERE (e.scope_key,e.root_id,e.decision_id)=(sk,rid,did)),'[]'::jsonb),
 'result',(SELECT r.payload FROM maintenance_m806.result r WHERE (r.scope_key,r.root_id,r.decision_id)=(sk,rid,did)))
 FROM maintenance_m806.decision d JOIN maintenance_m806.state s ON (s.scope_key,s.root_id,s.id)=(d.scope_key,d.root_id,d.id) JOIN maintenance_m806.root_head h ON(h.scope_key,h.id)=(d.scope_key,d.root_id) WHERE (d.scope_key,d.root_id,d.id)=(sk,rid,did)
$$;
CREATE FUNCTION maintenance_m806.gateway(action text,wire text,mac text,body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,maintenance_m806,pg_temp AS $$
DECLARE w jsonb;b jsonb;ctx jsonb;sk text;rid text;did text;op text;k maintenance_m806.proof_key;ss maintenance_m806.session;g maintenance_m806.access_grant;q maintenance_m806.quota;rh maintenance_m806.root_head;
 ro maintenance_m806.root;d maintenance_m806.decision;st maintenance_m806.state;an maintenance_m806.anchor;f jsonb;v_kind text;fh text;nowms bigint;changed int;outcome text;complete boolean;payload jsonb;evw jsonb;evr jsonb;evs jsonb;ownerw maintenance_m806.owner;ownerr maintenance_m806.owner;
BEGIN
 IF octet_length(wire)>8192 OR octet_length(body)>65536 OR mac !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'M806_INVALID_INPUT'; END IF;
 w:=wire::jsonb;b:=body::jsonb;
 IF maintenance_m806.keys(w,ARRAY['schemaVersion','namespace','scope','restrictions','sessionId','principalId','action','bodyHash','nonce','backendPid','transactionId','expiresAtMs','method','origin','fetchSite','csrfHash']) IS NOT TRUE
 OR maintenance_m806.keys(w->'scope',ARRAY['tenantId','projectId','movieId','studioId']) IS NOT TRUE OR w->'restrictions' IS DISTINCT FROM maintenance_m806.restrictions() OR maintenance_m806.canonical(w) IS DISTINCT FROM wire OR maintenance_m806.canonical(b) IS DISTINCT FROM body THEN RAISE EXCEPTION 'M806_PROOF_INVALID'; END IF;
 ctx:=jsonb_build_object('namespace',w->'namespace','scope',w->'scope');sk:=maintenance_m806.canonical(ctx);op:=b->>'op';rid:=b->>'rootId';did:=b->>'id';
 SELECT * INTO k FROM maintenance_m806.proof_key WHERE proof_key.action=gateway.action AND login=session_user AND enabled FOR SHARE;
 IF jsonb_typeof(w->'backendPid') IS DISTINCT FROM 'number' OR jsonb_typeof(w->'expiresAtMs') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'M806_PROOF_INVALID'; END IF;
 IF NOT FOUND OR w->>'schemaVersion' IS DISTINCT FROM 'story-recap-fake-maintenance-authorization-proof-v1' OR w->>'action' IS DISTINCT FROM action OR w->>'backendPid' IS DISTINCT FROM pg_backend_pid()::text OR w->>'transactionId' IS DISTINCT FROM pg_current_xact_id()::text OR w->>'bodyHash' IS DISTINCT FROM encode(maintenance_m806_crypto.digest(convert_to(body,'UTF8'),'sha256'),'hex')
 OR mac IS DISTINCT FROM encode(maintenance_m806_crypto.hmac(convert_to('story-recap-fake-maintenance-authorization-proof-v1'||chr(10)||wire,'UTF8'),k.secret,'sha256'),'hex') THEN RAISE EXCEPTION 'M806_PROOF_INVALID'; END IF;
 PERFORM 1 FROM maintenance_m806.scope WHERE scope_key=sk AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'M806_FORBIDDEN'; END IF;
 SELECT * INTO ss FROM maintenance_m806.session WHERE (scope_key,id,principal)=(sk,w->>'sessionId',w->>'principalId') FOR SHARE;
 SELECT * INTO g FROM maintenance_m806.access_grant WHERE (scope_key,principal)=(sk,w->>'principalId') FOR SHARE;
 nowms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 IF ss.id IS NULL OR g.principal IS NULL OR ss.revoked OR ss.expires_at<=clock_timestamp() OR (action=ANY(g.actions)) IS NOT TRUE OR array_position(g.actions,NULL) IS NOT NULL OR array_position(g.root_ids,NULL) IS NOT NULL
 OR action<>'health' AND (rid=ANY(g.root_ids)) IS NOT TRUE OR w->>'origin' IS DISTINCT FROM ss.origin OR w->>'csrfHash' IS DISTINCT FROM ss.csrf_hash OR w->>'fetchSite' IS DISTINCT FROM 'same-origin' OR w->>'method' IS DISTINCT FROM (CASE WHEN action IN('read','health') THEN 'GET' ELSE 'POST' END)
 OR w->>'expiresAtMs' IS NULL OR (w->>'expiresAtMs')::bigint<=nowms OR (w->>'expiresAtMs')::bigint>nowms+5000 THEN RAISE EXCEPTION 'M806_FORBIDDEN'; END IF;
 SELECT * INTO q FROM maintenance_m806.quota WHERE id FOR UPDATE;
 IF ss.expires_at<=clock_timestamp() OR (w->>'expiresAtMs')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'M806_AUTH_EXPIRED'; END IF;
 -- Deadline rechecked after every potentially blocking lock, including quota/root.
 IF (SELECT count(*) FROM maintenance_m806.used_proof)>=4096 THEN RAISE EXCEPTION 'M806_QUOTA'; END IF;
 INSERT INTO maintenance_m806.used_proof VALUES(w->>'nonce',sk,ss.id) ON CONFLICT DO NOTHING;GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'M806_PROOF_REPLAY'; END IF;
 IF op='health' AND action='health' THEN
  IF maintenance_m806.keys(b,ARRAY['op']) IS NOT TRUE THEN RAISE EXCEPTION 'M806_INVALID_INPUT'; END IF;
  IF (w->>'expiresAtMs')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'M806_AUTH_EXPIRED'; END IF;
  RETURN jsonb_build_object('schemaVersion','story-recap-fake-maintenance-health-snapshot-v1','namespace',w->'namespace','scope',w->'scope','restrictions',maintenance_m806.restrictions(),'body',jsonb_build_object(
  'decisionCount',(SELECT count(*) FROM maintenance_m806.decision WHERE scope_key=sk),'evidenceCount',(SELECT count(*) FROM maintenance_m806.evidence WHERE scope_key=sk),
  'reservedBytes',((SELECT count(*) FROM maintenance_m806.decision WHERE scope_key=sk)*32768+(SELECT count(*) FROM maintenance_m806.evidence WHERE scope_key=sk)*16384),
  'pendingCount',(SELECT count(*) FROM maintenance_m806.state WHERE scope_key=sk AND status IN('REGISTERED','EVIDENCE_PENDING')),'blockedCount',(SELECT count(*) FROM maintenance_m806.state WHERE scope_key=sk AND status='QUALIFICATION_BLOCKED'),
  'qualifiedCount',(SELECT count(*) FROM maintenance_m806.state WHERE scope_key=sk AND status='QUALIFIED_FOR_FUTURE_PHASE_ONLY'),'reconciledCount',(SELECT count(*) FROM maintenance_m806.state WHERE scope_key=sk AND status='DECISION_RECONCILED'),'capacity',CASE WHEN q.decisions>=16 OR q.evidence>=32 OR q.bytes>=1048576 THEN 'SATURATED' ELSE 'AVAILABLE' END));
 END IF;
 IF jsonb_typeof(b->'rootId') IS DISTINCT FROM 'string' OR jsonb_typeof(b->'id') IS DISTINCT FROM 'string' OR rid !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' OR did !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' OR b ? 'revision' AND (jsonb_typeof(b->'revision') IS DISTINCT FROM 'number' OR b->>'revision' !~ '^(0|[1-9][0-9]*)$' OR (b->>'revision')::numeric>1000000) THEN RAISE EXCEPTION 'M806_INVALID_INPUT'; END IF;
 SELECT * INTO rh FROM maintenance_m806.root_head WHERE (scope_key,id)=(sk,rid) AND enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'M806_ROOT_UNKNOWN'; END IF;
 SELECT * INTO ro FROM maintenance_m806.root WHERE (scope_key,id)=(sk,rid);
 IF (w->>'expiresAtMs')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint OR ss.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'M806_AUTH_EXPIRED'; END IF;
 IF op='submit' AND action='submit' THEN
  IF maintenance_m806.keys(b,ARRAY['op','rootId','id','decision']) IS NOT TRUE OR maintenance_m806.valid('decision',b->'decision',ctx) IS NOT TRUE THEN RAISE EXCEPTION 'M806_INVALID_DECISION'; END IF;
  f:=b->'decision';
  IF f->'body'->>'rootId' IS DISTINCT FROM rid OR f->'body'->>'decisionId' IS DISTINCT FROM did OR f->'body'->>'rootHash' IS DISTINCT FROM ro.hash OR f->'body'->>'writerId' IS DISTINCT FROM ro.payload->'body'->>'writerId' OR f->'body'->>'readerId' IS DISTINCT FROM ro.payload->'body'->>'readerId' THEN RAISE EXCEPTION 'M806_ROOT_BINDING'; END IF;
  SELECT * INTO d FROM maintenance_m806.decision WHERE (scope_key,id)=(sk,did);
  IF FOUND THEN IF d.payload IS DISTINCT FROM f OR d.root_id IS DISTINCT FROM rid THEN RAISE EXCEPTION 'M806_IDEMPOTENCY_CONFLICT'; END IF; RETURN maintenance_m806.view_decision(sk,rid,did); END IF;
  IF (f->'body'->>'expectedGeneration')::int<>rh.generation OR (f->'body'->>'expectedRevision')::int<>rh.revision THEN RAISE EXCEPTION 'M806_STALE_CAS'; END IF;
  IF q.decisions>=16 OR q.bytes+32768>1048576 THEN RAISE EXCEPTION 'M806_QUOTA'; END IF;
  INSERT INTO maintenance_m806.decision VALUES(sk,rid,did,f,maintenance_m806.digest('story-recap-fake-maintenance-decision-v1',f));
  INSERT INTO maintenance_m806.state VALUES(sk,rid,did,0,'REGISTERED',ss.id,ss.principal,action,to_timestamp((w->>'expiresAtMs')::bigint/1000.0));
  UPDATE maintenance_m806.quota SET decisions=decisions+1,bytes=bytes+32768 WHERE id;
 ELSE
  SELECT * INTO d FROM maintenance_m806.decision WHERE (scope_key,root_id,id)=(sk,rid,did);
  IF NOT FOUND THEN RAISE EXCEPTION 'M806_DECISION_UNKNOWN'; END IF;
  SELECT * INTO st FROM maintenance_m806.state WHERE (scope_key,root_id,id)=(sk,rid,did) FOR UPDATE;
  IF op='read' AND action='read' THEN
   IF maintenance_m806.keys(b,ARRAY['op','rootId','id','decisionHash']) IS NOT TRUE OR b->>'decisionHash' IS DISTINCT FROM d.hash THEN RAISE EXCEPTION 'M806_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN maintenance_m806.view_decision(sk,rid,did);
  END IF;
  IF op='reconcile' AND action='reconcile' THEN
   IF maintenance_m806.keys(b,ARRAY['op','rootId','id','decisionHash']) IS NOT TRUE OR b->>'decisionHash' IS DISTINCT FROM d.hash THEN RAISE EXCEPTION 'M806_IDEMPOTENCY_CONFLICT'; END IF;
   IF st.status='DECISION_RECONCILED' OR NOT EXISTS(SELECT 1 FROM maintenance_m806.result WHERE (scope_key,root_id,decision_id)=(sk,rid,did)) THEN RETURN maintenance_m806.view_decision(sk,rid,did); END IF;
   UPDATE maintenance_m806.state SET status='DECISION_RECONCILED' WHERE (scope_key,root_id,id)=(sk,rid,did);
  ELSIF op='evidence' AND action='evidence' THEN
   IF maintenance_m806.keys(b,ARRAY['op','rootId','id','revision','kind','fact','factProof']) IS NOT TRUE OR st.status NOT IN('REGISTERED','EVIDENCE_PENDING') THEN RAISE EXCEPTION 'M806_INVALID_STATE'; END IF;
   v_kind:=b->>'kind';f:=b->'fact';
   IF (v_kind IN('writer','reader','successor')) IS NOT TRUE OR maintenance_m806.valid(v_kind,f,ctx) IS NOT TRUE OR f->'body'->>'rootId' IS DISTINCT FROM rid THEN RAISE EXCEPTION 'M806_INVALID_EVIDENCE'; END IF;
   fh:=maintenance_m806.digest(CASE v_kind WHEN 'writer' THEN 'story-recap-fake-maintenance-writer-closure-v1' WHEN 'reader' THEN 'story-recap-fake-maintenance-reader-closure-v1' ELSE 'story-recap-fake-maintenance-successor-observation-v1' END,f);
   SELECT * INTO an FROM maintenance_m806.anchor WHERE (scope_key,root_id,anchor.kind)=(sk,rid,v_kind) FOR SHARE;
   IF NOT FOUND OR an.hash IS DISTINCT FROM fh OR an.payload IS DISTINCT FROM f OR NOT (d.payload->'body'->'evidenceHashes' @> to_jsonb(ARRAY[fh])) THEN RAISE EXCEPTION 'M806_ORIGINAL_EVIDENCE_REQUIRED'; END IF;
   IF b->>'factProof' IS DISTINCT FROM encode(maintenance_m806_crypto.hmac(convert_to(f->>'schemaVersion'||chr(10)||maintenance_m806.canonical(jsonb_build_object('context',ctx,'rootId',rid,'decisionId',did,'revision',b->'revision','kind',v_kind,'factHash',fh,'backendPid',pg_backend_pid(),'transactionId',pg_current_xact_id()::text)),'UTF8'),k.secret,'sha256'),'hex') THEN RAISE EXCEPTION 'M806_FACT_PROOF_INVALID'; END IF;
   IF EXISTS(SELECT 1 FROM maintenance_m806.evidence e WHERE (e.scope_key,e.root_id,e.decision_id,e.kind)=(sk,rid,did,v_kind)) THEN RETURN maintenance_m806.view_decision(sk,rid,did); END IF;
   IF st.revision IS DISTINCT FROM (b->>'revision')::int THEN RAISE EXCEPTION 'M806_STALE_CAS'; END IF;
   IF q.evidence>=32 OR q.bytes+16384>1048576 THEN RAISE EXCEPTION 'M806_QUOTA'; END IF;
   INSERT INTO maintenance_m806.evidence VALUES(sk,rid,did,v_kind,f,fh);
   UPDATE maintenance_m806.quota SET evidence=evidence+1,bytes=bytes+16384 WHERE id;
   UPDATE maintenance_m806.state SET status='EVIDENCE_PENDING' WHERE (scope_key,root_id,id)=(sk,rid,did);
  ELSIF op='qualify' AND action='qualify' THEN
   IF maintenance_m806.keys(b,ARRAY['op','rootId','id','revision']) IS NOT TRUE THEN RAISE EXCEPTION 'M806_INVALID_INPUT'; END IF;
   IF EXISTS(SELECT 1 FROM maintenance_m806.result WHERE (scope_key,root_id,decision_id)=(sk,rid,did)) THEN RETURN maintenance_m806.view_decision(sk,rid,did); END IF;
   IF st.revision IS DISTINCT FROM (b->>'revision')::int OR (d.payload->'body'->>'expectedGeneration')::int<>rh.generation OR (d.payload->'body'->>'expectedRevision')::int<>rh.revision THEN RAISE EXCEPTION 'M806_STALE_CAS'; END IF;
   SELECT * INTO ownerw FROM maintenance_m806.owner WHERE (scope_key,root_id,id,owner.kind)=(sk,rid,d.payload->'body'->>'writerId','WRITER') FOR SHARE;
   SELECT * INTO ownerr FROM maintenance_m806.owner WHERE (scope_key,root_id,id,owner.kind)=(sk,rid,d.payload->'body'->>'readerId','READER') FOR SHARE;
   SELECT e.payload INTO evw FROM maintenance_m806.evidence e WHERE(e.scope_key,e.root_id,e.decision_id,e.kind)=(sk,rid,did,'writer');
   SELECT e.payload INTO evr FROM maintenance_m806.evidence e WHERE(e.scope_key,e.root_id,e.decision_id,e.kind)=(sk,rid,did,'reader');
   SELECT e.payload INTO evs FROM maintenance_m806.evidence e WHERE(e.scope_key,e.root_id,e.decision_id,e.kind)=(sk,rid,did,'successor');
   complete:=coalesce(ownerw.id IS NOT NULL AND ownerr.id IS NOT NULL AND evw->'body'->>'ownerHash'=ownerw.hash AND evr->'body'->>'ownerHash'=ownerr.hash
    AND evw->'body'->>'supervisorHash'=ro.payload->'body'->>'supervisorHash' AND evr->'body'->>'supervisorHash'=ro.payload->'body'->>'supervisorHash'
    AND evw->'body'->'descriptorsClosed'='true'::jsonb AND evr->'body'->'descriptorsClosed'='true'::jsonb AND evw->'body'->'noFutureIO'='true'::jsonb AND evr->'body'->'noFutureIO'='true'::jsonb
    AND evw->'body'->>'descendants'='PROVEN_QUIESCENT' AND evr->'body'->>'descendants'='PROVEN_QUIESCENT'
    AND (evw->'body'->>'generation')::int=rh.generation AND (evr->'body'->>'generation')::int=rh.generation
    AND evs->'body'->>'observation'='QUALIFIED_FOR_FUTURE_PHASE_ONLY' AND evs->'body'->>'guardHash'=ro.payload->'body'->>'guardHash'
    AND evw->'body'->>'guardHash'=ro.payload->'body'->>'guardHash' AND evr->'body'->>'guardHash'=ro.payload->'body'->>'guardHash'
    AND evs->'body'->>'writerHash'=maintenance_m806.digest('story-recap-fake-maintenance-writer-closure-v1',evw) AND evs->'body'->>'readerHash'=maintenance_m806.digest('story-recap-fake-maintenance-reader-closure-v1',evr)
    AND (evs->'body'->>'generation')::int=rh.generation AND (evs->'body'->>'revision')::int=rh.revision,false);
   outcome:=CASE WHEN complete THEN 'QUALIFIED_FOR_FUTURE_PHASE_ONLY' ELSE 'QUALIFICATION_BLOCKED' END;
   IF complete THEN UPDATE maintenance_m806.root_head SET generation=generation+1,revision=revision+1 WHERE (scope_key,id)=(sk,rid) RETURNING * INTO rh; END IF;
   payload:=jsonb_build_object('schemaVersion','story-recap-fake-maintenance-decision-result-v1','namespace',w->'namespace','scope',w->'scope','restrictions',maintenance_m806.restrictions(),'body',jsonb_build_object('decisionId',did,'decisionHash',d.hash,'outcome',outcome,'reason',CASE WHEN complete THEN 'ORIGINAL_EVIDENCE_COMPLETE' ELSE 'ORIGINAL_EVIDENCE_INCOMPLETE' END,'generation',rh.generation,'revision',rh.revision));
   INSERT INTO maintenance_m806.result VALUES(sk,rid,did,payload,maintenance_m806.digest('story-recap-fake-maintenance-decision-result-v1',payload));
   UPDATE maintenance_m806.state SET status=outcome WHERE (scope_key,root_id,id)=(sk,rid,did);
  ELSE RAISE EXCEPTION 'M806_FORBIDDEN'; END IF;
  UPDATE maintenance_m806.state SET revision=revision+1 WHERE (scope_key,root_id,id)=(sk,rid,did);
 END IF;
 UPDATE maintenance_m806.state SET last_session=ss.id,last_principal=ss.principal,last_action=action,deadline=to_timestamp((w->>'expiresAtMs')::bigint/1000.0) WHERE (scope_key,root_id,id)=(sk,rid,did) RETURNING * INTO st;
 SELECT * INTO d FROM maintenance_m806.decision WHERE (scope_key,root_id,id)=(sk,rid,did);
 payload:=jsonb_build_object('schemaVersion','story-recap-fake-maintenance-audit-event-v1','namespace',w->'namespace','scope',w->'scope','restrictions',maintenance_m806.restrictions(),'body',jsonb_build_object('decisionId',did,'decisionHash',d.hash,'revision',st.revision,'action',action,'principalId',ss.principal,'state',st.status,'bodyHash',w->>'bodyHash'));
 INSERT INTO maintenance_m806.audit_event VALUES(sk,rid,did,st.revision,payload,maintenance_m806.digest('story-recap-fake-maintenance-audit-event-v1',payload));
 RETURN maintenance_m806.view_decision(sk,rid,did);
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA maintenance_m806 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA maintenance_m806 FROM PUBLIC;
RESET ROLE;
DO $$ DECLARE a text; BEGIN FOREACH a IN ARRAY ARRAY['submit','evidence','qualify','reconcile','read','health'] LOOP
 EXECUTE format('CREATE ROLE maintenance_m806_%I NOLOGIN',a);
 EXECUTE format('CREATE FUNCTION maintenance_m806.%I(w text,m text,b text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,maintenance_m806,pg_temp AS %L',a,'SELECT maintenance_m806.gateway('||quote_literal(a)||',w,m,b)');
 EXECUTE format('ALTER FUNCTION maintenance_m806.%I(text,text,text) OWNER TO maintenance_m806_owner',a);
 EXECUTE format('REVOKE ALL ON FUNCTION maintenance_m806.%I(text,text,text) FROM PUBLIC',a);
 EXECUTE format('GRANT USAGE ON SCHEMA maintenance_m806 TO maintenance_m806_%I',a);
 EXECUTE format('GRANT EXECUTE ON FUNCTION maintenance_m806.%I(text,text,text) TO maintenance_m806_%I',a,a);
END LOOP; END $$;
