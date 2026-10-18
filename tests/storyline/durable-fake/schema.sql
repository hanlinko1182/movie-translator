-- Installed ONLY by the owned DisposableStorylinePostgres fixture bootstrap.
CREATE ROLE voice_m505_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA voice_m505 AUTHORIZATION voice_m505_owner;
CREATE SCHEMA voice_m505_crypto;
CREATE EXTENSION pgcrypto WITH SCHEMA voice_m505_crypto;
GRANT USAGE ON SCHEMA voice_m505_crypto TO voice_m505_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;
SET ROLE voice_m505_owner;
SET search_path=pg_catalog,voice_m505,pg_temp;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE voice_m505.namespace(id text PRIMARY KEY CHECK(id ~ '^fixture-[a-f0-9]{32}$'), bytes_limit bigint NOT NULL DEFAULT 16777216, metadata_limit bigint NOT NULL DEFAULT 33554432);
CREATE TABLE voice_m505.context(
 namespace text NOT NULL REFERENCES voice_m505.namespace, tenant text NOT NULL, project text NOT NULL, movie text NOT NULL, studio text NOT NULL,
 expected jsonb NOT NULL, source_epoch int NOT NULL DEFAULT 1, policy_epoch int NOT NULL DEFAULT 1, enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(namespace,tenant,project,movie,studio));
CREATE TABLE voice_m505.session(
 id text PRIMARY KEY, namespace text NOT NULL, tenant text NOT NULL, project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 principal text NOT NULL, csrf_hash text NOT NULL, origin text NOT NULL, actions text[] NOT NULL,
 expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false, epoch int NOT NULL DEFAULT 1,
 FOREIGN KEY(namespace,tenant,project,movie,studio) REFERENCES voice_m505.context);
CREATE TABLE voice_m505.proof_key(action text PRIMARY KEY, secret bytea NOT NULL CHECK(octet_length(secret)=32), enabled boolean NOT NULL DEFAULT true);
CREATE TABLE voice_m505.used_proof(nonce text PRIMARY KEY, session_id text NOT NULL REFERENCES voice_m505.session, action text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE voice_m505.request(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL, key text NOT NULL, hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'), recipe text NOT NULL,
 payload jsonb NOT NULL, principal text NOT NULL, source_epoch int NOT NULL, policy_epoch int NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), UNIQUE(namespace,tenant,project,movie,studio,key), UNIQUE(namespace,tenant,project,movie,studio,recipe),
 FOREIGN KEY(namespace,tenant,project,movie,studio) REFERENCES voice_m505.context);
CREATE TABLE voice_m505.submission(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL, payload jsonb NOT NULL, hash text NOT NULL, generation int NOT NULL CHECK(generation=1),
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), FOREIGN KEY(namespace,tenant,project,movie,studio,id) REFERENCES voice_m505.request);
CREATE TABLE voice_m505.reservation(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL, payload jsonb NOT NULL, hash text NOT NULL,
 owner_generation int NOT NULL DEFAULT 1 CHECK(owner_generation>0), revision int NOT NULL DEFAULT 0 CHECK(revision>=0),
 owner_principal text NOT NULL, lease_until timestamptz NOT NULL,
 checkpoint boolean NOT NULL DEFAULT false, delivery text NOT NULL DEFAULT 'PREPARED' CHECK(delivery IN('PREPARED','AWAITING_RESULT','UNKNOWN','DEFINITIVE_SUCCESS','DEFINITIVE_FAILURE','CANCELLED')),
 artifact_state text NOT NULL DEFAULT 'PREPARED' CHECK(artifact_state IN('PREPARED','STAGED','VERIFIED','COMMITTED','QUARANTINED')),
 cancelled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), FOREIGN KEY(namespace,tenant,project,movie,studio,id) REFERENCES voice_m505.submission);
CREATE TABLE voice_m505.result_observation(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL, hash text NOT NULL, output jsonb NOT NULL, receipt jsonb, audio_hash text, bytes int NOT NULL CHECK(bytes BETWEEN 0 AND 4194304),
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), FOREIGN KEY(namespace,tenant,project,movie,studio,id) REFERENCES voice_m505.submission);
CREATE TABLE voice_m505.stage_attempt(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 aggregate_id text NOT NULL,id text NOT NULL, version text NOT NULL UNIQUE CHECK(version ~ '^[a-f0-9]{32}$'), payload jsonb NOT NULL, hash text NOT NULL, bytes int NOT NULL CHECK(bytes BETWEEN 1 AND 4194304), audio_hash text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), UNIQUE(namespace,tenant,project,movie,studio,aggregate_id,version), UNIQUE(namespace,tenant,project,movie,studio,aggregate_id,id),
 FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id) REFERENCES voice_m505.reservation);
CREATE TABLE voice_m505.verification_receipt(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 aggregate_id text NOT NULL,stage_id text NOT NULL,owner_generation int NOT NULL,revision int NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,stage_id,owner_generation), UNIQUE(namespace,tenant,project,movie,studio,aggregate_id,stage_id,owner_generation),
 FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id) REFERENCES voice_m505.reservation,
 FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id,stage_id) REFERENCES voice_m505.stage_attempt(namespace,tenant,project,movie,studio,aggregate_id,id));
CREATE TABLE voice_m505.artifact(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL, stage_id text NOT NULL, owner_generation int NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), UNIQUE(namespace,tenant,project,movie,studio,stage_id),
 FOREIGN KEY(namespace,tenant,project,movie,studio,id) REFERENCES voice_m505.reservation,
 FOREIGN KEY(namespace,tenant,project,movie,studio,id,stage_id,owner_generation) REFERENCES voice_m505.verification_receipt(namespace,tenant,project,movie,studio,aggregate_id,stage_id,owner_generation));
CREATE TABLE voice_m505.availability(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL,state text NOT NULL DEFAULT 'AVAILABLE' CHECK(state IN('AVAILABLE','QUARANTINED','DELETE_PENDING','DELETED')),revision int NOT NULL DEFAULT 0,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), FOREIGN KEY(namespace,tenant,project,movie,studio,id) REFERENCES voice_m505.artifact);
CREATE TABLE voice_m505.collection(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL,payload jsonb NOT NULL,hash text NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), FOREIGN KEY(namespace,tenant,project,movie,studio) REFERENCES voice_m505.context);
CREATE TABLE voice_m505.collection_member(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 collection_id text NOT NULL,artifact_id text NOT NULL,chunk_index int NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,collection_id,chunk_index), UNIQUE(namespace,tenant,project,movie,studio,collection_id,artifact_id),
 FOREIGN KEY(namespace,tenant,project,movie,studio,collection_id) REFERENCES voice_m505.collection,
 FOREIGN KEY(namespace,tenant,project,movie,studio,artifact_id) REFERENCES voice_m505.artifact);
CREATE TABLE voice_m505.recovery_case(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL,aggregate_id text NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id) REFERENCES voice_m505.reservation);
CREATE TABLE voice_m505.quarantine_hold(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 aggregate_id text NOT NULL,reason text NOT NULL,released boolean NOT NULL DEFAULT false,
 PRIMARY KEY(namespace,tenant,project,movie,studio,aggregate_id), FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id) REFERENCES voice_m505.reservation);
CREATE TABLE voice_m505.read_hold(
 id text PRIMARY KEY,namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 aggregate_id text NOT NULL,session_id text NOT NULL REFERENCES voice_m505.session,expires_at timestamptz NOT NULL,
 FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id) REFERENCES voice_m505.artifact);
CREATE TABLE voice_m505.gc_intent(
 namespace text NOT NULL,tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,
 id text NOT NULL,aggregate_id text NOT NULL,version text NOT NULL,hash text NOT NULL,bytes int NOT NULL,state text NOT NULL CHECK(state IN('DELETE_PENDING','DELETED')),
 PRIMARY KEY(namespace,tenant,project,movie,studio,id), UNIQUE(version),
 FOREIGN KEY(namespace,tenant,project,movie,studio,aggregate_id) REFERENCES voice_m505.reservation);
CREATE TABLE voice_m505.audit_event(
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,namespace text NOT NULL REFERENCES voice_m505.namespace,
 tenant text NOT NULL,project text NOT NULL,movie text NOT NULL,studio text NOT NULL,aggregate_id text NOT NULL,actor text NOT NULL,action text NOT NULL,prior_revision int NOT NULL,next_revision int NOT NULL,
 time_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL,payload jsonb NOT NULL,hash text NOT NULL);
CREATE TABLE voice_m505.orphan_object(namespace text NOT NULL REFERENCES voice_m505.namespace, version text NOT NULL CHECK(version ~ '^[a-f0-9]{32}$'), hash text NOT NULL, bytes int NOT NULL CHECK(bytes BETWEEN 1 AND 4194304), held boolean NOT NULL DEFAULT true, PRIMARY KEY(namespace,version));
CREATE FUNCTION voice_m505.canonical(j jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,voice_m505,pg_temp AS $$
DECLARE result text; BEGIN
 CASE jsonb_typeof(j)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_json(k)::text||':'||voice_m505.canonical(v),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(j) e(k,v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(voice_m505.canonical(v),',' ORDER BY i),'')||']' INTO result FROM jsonb_array_elements(j) WITH ORDINALITY e(v,i);
 ELSE result:=j::text; END CASE; RETURN result;
END $$;
CREATE FUNCTION voice_m505.envelope_hash(j jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,voice_m505,pg_temp AS $$
 SELECT encode(voice_m505_crypto.digest(convert_to((j->>'schemaVersion')||chr(10)||voice_m505.canonical(j),'UTF8'),'sha256'),'hex')
$$;
CREATE FUNCTION voice_m505.audit_payload() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,voice_m505,pg_temp AS $$
DECLARE ctx voice_m505.context; BEGIN
 SELECT * INTO ctx FROM voice_m505.context WHERE (namespace,tenant,project,movie,studio)=(NEW.namespace,NEW.tenant,NEW.project,NEW.movie,NEW.studio);
 NEW.payload:=jsonb_build_object('schemaVersion','story-durable-audio-audit-v1','execution','FAKE_ONLY','namespace',NEW.namespace,'tenantId',NEW.tenant,
 'scope',jsonb_build_object('projectId',ctx.project,'movieId',ctx.movie,'studioId',ctx.studio),
 'restrictions','{"humanApproval":"NONE","sourceVerified":false,"eligibleForRealTts":false,"eligibleForPublication":false,"spendingAuthority":"NONE","syntheticAncestry":true}'::jsonb,
 'body',jsonb_build_object('id','audit-'||NEW.seq,'aggregateId',NEW.aggregate_id,'principalId',NEW.actor,'action',NEW.action,'priorRevision',NEW.prior_revision,'nextRevision',NEW.next_revision,'timeMs',floor(extract(epoch FROM NEW.time_at)*1000)::bigint,'reason',NEW.reason));
 NEW.hash:=voice_m505.envelope_hash(NEW.payload); RETURN NEW;
END $$;
CREATE TRIGGER audit_payload BEFORE INSERT ON voice_m505.audit_event FOR EACH ROW EXECUTE FUNCTION voice_m505.audit_payload();
CREATE FUNCTION voice_m505.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,voice_m505,pg_temp AS $$ BEGIN RAISE EXCEPTION 'M505_IMMUTABLE'; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['request','submission','result_observation','stage_attempt','verification_receipt','artifact','collection','collection_member','recovery_case','audit_event'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_row BEFORE UPDATE OR DELETE ON voice_m505.%I FOR EACH ROW EXECUTE FUNCTION voice_m505.immutable()',t);
 EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON voice_m505.%I FOR EACH STATEMENT EXECUTE FUNCTION voice_m505.immutable()',t);
END LOOP; END $$;
-- Every action runs this private dispatcher in its caller's transaction.
CREATE FUNCTION voice_m505.gateway(p_action text,p_wire text,p_mac text,p_payload text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,voice_m505,pg_temp AS $$
DECLARE w jsonb:=p_wire::jsonb; p jsonb:=p_payload::jsonb; s voice_m505.session; c voice_m505.context; r voice_m505.reservation; q voice_m505.request; a voice_m505.stage_attempt; j voice_m505.result_observation; v voice_m505.verification_receipt;
 n text:=w->>'namespace';t text:=w->>'tenantId';pr text;mo text;st text; target text:=w->>'target';op text:=p->>'op'; proof_secret bytea; nowms bigint; result jsonb; prior int:=0; affected int; h text; entry jsonb; member jsonb; idx int; meta bigint; item record;
BEGIN
 IF octet_length(p_wire)>8192 OR octet_length(p_payload)>4194304 OR jsonb_object_length_safe(w)<>13 THEN RAISE EXCEPTION 'M505_PROOF'; END IF;
 SELECT k.secret INTO proof_secret FROM voice_m505.proof_key k WHERE k.action=p_action AND enabled;
 IF proof_secret IS NULL OR p_mac !~ '^[a-f0-9]{64}$' OR encode(voice_m505_crypto.hmac(convert_to(p_wire,'UTF8'),proof_secret,'sha256'),'hex')<>p_mac
 OR w->>'action'<>p_action OR (w->>'pid')::int<>pg_backend_pid() OR w->>'transactionId'<>pg_current_xact_id()::text
 OR w->>'payloadHash'<>encode(voice_m505_crypto.digest(convert_to(p_payload,'UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'M505_PROOF'; END IF;
 SELECT * INTO s FROM voice_m505.session WHERE id=w->>'sessionId';
 IF NOT FOUND OR s.namespace<>n OR s.tenant<>t OR s.principal IS DISTINCT FROM w->>'principalId' OR (p_action=ANY(s.actions)) IS NOT TRUE THEN RAISE EXCEPTION 'M505_AUTH'; END IF;
 pr:=s.project;mo:=s.movie;st:=s.studio;
 -- Shared lock ordering: context, session, namespace quota, aggregate. Epoch writers use these rows.
 SELECT * INTO c FROM voice_m505.context WHERE (namespace,tenant,project,movie,studio)=(n,t,pr,mo,st) FOR UPDATE;
 SELECT * INTO s FROM voice_m505.session WHERE id=w->>'sessionId' FOR UPDATE;
 nowms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 PERFORM 1 FROM voice_m505.proof_key k WHERE k.action=p_action AND k.enabled AND k.secret=proof_secret FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'M505_KEY_REVOKED'; END IF;
 IF s.namespace IS DISTINCT FROM n OR s.tenant IS DISTINCT FROM t OR s.principal IS DISTINCT FROM w->>'principalId' OR (p_action=ANY(s.actions)) IS NOT TRUE OR s.revoked OR NOT c.enabled OR s.expires_at<=clock_timestamp() OR (w->>'expiresAtMs')::bigint<=nowms OR (w->>'expiresAtMs')::bigint>nowms+5000
 OR p->>'origin' IS DISTINCT FROM s.origin OR p->>'csrfHash' IS DISTINCT FROM s.csrf_hash OR p->>'method' IS DISTINCT FROM 'POST' OR p->>'fetchSite' IS DISTINCT FROM 'same-origin'
 OR (p->>'sourceEpoch')::int<>c.source_epoch OR (p->>'policyEpoch')::int<>c.policy_epoch THEN RAISE EXCEPTION 'M505_AUTH_STALE'; END IF;
 DELETE FROM voice_m505.used_proof WHERE expires_at<clock_timestamp();
 IF (SELECT count(*) FROM voice_m505.used_proof)>=7200 THEN RAISE EXCEPTION 'M505_PROOF_QUOTA'; END IF;
 INSERT INTO voice_m505.used_proof VALUES(w->>'nonce',s.id,p_action,to_timestamp((w->>'expiresAtMs')::bigint/1000.0));
 PERFORM 1 FROM voice_m505.namespace WHERE id=n FOR UPDATE;
 IF (SELECT count(*) FROM voice_m505.audit_event WHERE namespace=n)>20000 OR
 (SELECT coalesce(sum(pg_column_size(x)),0) FROM voice_m505.audit_event x WHERE namespace=n)>4194304 THEN RAISE EXCEPTION 'M505_AUDIT_QUOTA'; END IF;
 IF op='expected' AND p_action IN('create','validate','finalize','replay','recovery','observe') THEN RETURN c.expected; END IF;
 IF op='inventory' AND p_action='recovery' THEN RETURN coalesce((SELECT jsonb_agg(version) FROM voice_m505.stage_attempt WHERE namespace=n),'[]'); END IF;
 IF op='orphan' AND p_action='recovery' THEN
  IF EXISTS(SELECT 1 FROM voice_m505.stage_attempt WHERE version=p->>'version') THEN RAISE EXCEPTION 'M505_OWNED_ATTEMPT'; END IF;
  INSERT INTO voice_m505.orphan_object VALUES(n,p->>'version',p->>'hash',(p->>'bytes')::int,true) ON CONFLICT DO NOTHING;
  INSERT INTO voice_m505.audit_event(namespace,tenant,project,movie,studio,aggregate_id,actor,action,prior_revision,next_revision,reason) VALUES(n,t,pr,mo,st,'orphan',s.principal,'ORPHAN_HOLD',0,0,'UNREGISTERED_VERSION'); RETURN '{"held":true}';
 END IF;
 -- Every supplied immutable envelope is checked before any state mutation.
 FOREACH h IN ARRAY ARRAY['request','submission','reservation','stage','verification','artifact','collection'] LOOP
  IF p ? h THEN
   entry:=p->h;
   IF entry->>'execution' IS DISTINCT FROM 'FAKE_ONLY' OR entry->>'namespace' IS DISTINCT FROM n OR entry->>'tenantId' IS DISTINCT FROM t OR entry->'scope' IS DISTINCT FROM c.expected->'scope'
    OR entry->'restrictions' IS DISTINCT FROM '{"humanApproval":"NONE","sourceVerified":false,"eligibleForRealTts":false,"eligibleForPublication":false,"spendingAuthority":"NONE","syntheticAncestry":true}'::jsonb
    OR voice_m505.envelope_hash(entry) IS DISTINCT FROM p->>(CASE WHEN h='request' THEN 'hash' ELSE h||'Hash' END) THEN RAISE EXCEPTION 'M505_ENVELOPE'; END IF;
  END IF;
 END LOOP;
 IF op='read_collection' AND p_action='replay' THEN RETURN (SELECT to_jsonb(x) FROM voice_m505.collection x WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)); END IF;
 IF op='collection_check' AND p_action='replay' THEN
  IF NOT EXISTS(SELECT 1 FROM voice_m505.collection WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)) OR EXISTS(
   SELECT 1 FROM voice_m505.collection_member m
   JOIN voice_m505.reservation z ON (m.namespace,m.tenant,m.project,m.movie,m.studio,m.artifact_id)=(z.namespace,z.tenant,z.project,z.movie,z.studio,z.id)
   JOIN voice_m505.availability av ON (av.namespace,av.tenant,av.project,av.movie,av.studio,av.id)=(m.namespace,m.tenant,m.project,m.movie,m.studio,m.artifact_id)
   JOIN voice_m505.request rq ON (rq.namespace,rq.tenant,rq.project,rq.movie,rq.studio,rq.id)=(m.namespace,m.tenant,m.project,m.movie,m.studio,m.artifact_id)
   WHERE (m.namespace,m.tenant,m.project,m.movie,m.studio,m.collection_id)=(n,t,pr,mo,st,target) AND (av.state<>'AVAILABLE' OR z.cancelled OR rq.source_epoch<>c.source_epoch OR rq.policy_epoch<>c.policy_epoch)) THEN RAISE EXCEPTION 'M505_COLLECTION_UNAVAILABLE'; END IF;
  RETURN '{"ok":true}';
 END IF;
 IF op='collection_member' AND p_action='replay' THEN RETURN (SELECT jsonb_build_object('id',artifact_id) FROM voice_m505.collection_member WHERE (namespace,tenant,project,movie,studio,collection_id)=(n,t,pr,mo,st,target) AND chunk_index=(p->>'index')::int); END IF;
 IF op='collection' AND p_action='finalize' THEN
  IF p->'collection'->'body'->>'planHash' IS DISTINCT FROM c.expected->'plan'->>'planHash' OR jsonb_array_length(p->'members')<>jsonb_array_length(c.expected->'plan'->'plan'->'chunks') THEN RAISE EXCEPTION 'M505_COVERAGE'; END IF;
  IF EXISTS(SELECT 1 FROM voice_m505.collection WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)) THEN
   IF NOT EXISTS(SELECT 1 FROM voice_m505.collection WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target) AND hash=p->>'collectionHash') THEN RAISE EXCEPTION 'M505_COLLECTION_CONFLICT'; END IF; RETURN '{"duplicate":true}';
  END IF;
  idx:=0;
  FOR member IN SELECT * FROM jsonb_array_elements(p->'members') LOOP
   SELECT x.payload INTO entry FROM voice_m505.artifact x JOIN voice_m505.availability y USING(namespace,tenant,project,movie,studio,id)
    JOIN voice_m505.reservation z USING(namespace,tenant,project,movie,studio,id) JOIN voice_m505.request rq USING(namespace,tenant,project,movie,studio,id)
    WHERE (x.namespace,x.tenant,x.project,x.movie,x.studio,x.id)=(n,t,pr,mo,st,member->>'id') AND x.hash=member->>'hash' AND y.state='AVAILABLE' AND NOT z.cancelled AND rq.source_epoch=c.source_epoch AND rq.policy_epoch=c.policy_epoch;
   IF entry IS NULL OR (entry->'body'->>'chunkIndex')::int<>idx OR p->'collection'->'body'->'artifacts'->>idx IS DISTINCT FROM member->>'hash'
    OR p->'collection'->'body'->'inner'->'manifest'->'entries'->idx->>'receiptHash' IS DISTINCT FROM entry->'body'->'inner'->>'receiptHash' THEN RAISE EXCEPTION 'M505_COLLECTION_MEMBER'; END IF; idx:=idx+1;
  END LOOP;
  INSERT INTO voice_m505.collection VALUES(n,t,pr,mo,st,target,p->'collection',p->>'collectionHash'); idx:=0;
  FOR member IN SELECT * FROM jsonb_array_elements(p->'members') LOOP INSERT INTO voice_m505.collection_member VALUES(n,t,pr,mo,st,target,member->>'id',idx);idx:=idx+1;END LOOP;
  result:=jsonb_build_object('id',target);
 ELSIF op='reserve' AND p_action='create' THEN
  SELECT * INTO q FROM voice_m505.request WHERE (namespace,tenant,project,movie,studio)=(n,t,pr,mo,st) AND key=p->>'key';
  IF FOUND THEN IF q.hash<>p->>'hash' THEN RAISE EXCEPTION 'M505_KEY_CONFLICT'; END IF; RETURN jsonb_build_object('id',q.id,'created',false); END IF;
  IF p->'request'->>'execution'<>'FAKE_ONLY' OR p->'request'->>'namespace'<>n OR p->'request'->>'tenantId'<>t OR p->'request'->'scope'<>c.expected->'scope'
  OR p->'request'->'body'->'plan'<>c.expected->'plan' OR p->'request'->'body'->>'idempotencyKey'<>p->>'key'
  OR p->'request'->'body'->>'recipeHash' IS DISTINCT FROM p->>'recipe'
  OR p->>'recipe' IS DISTINCT FROM c.expected->'anchors'->(p->'request'->'body'->>'chunkIndex')::int->>'recipeHash'
  OR p->'request'->'body'->>'bindingHash' IS DISTINCT FROM c.expected->'anchors'->(p->'request'->'body'->>'chunkIndex')::int->>'bindingHash'
  OR p->'submission'->'body'->>'requestHash' IS DISTINCT FROM p->>'hash' OR p->'submission'->'body'->>'id' IS DISTINCT FROM target
  OR p->'reservation'->'body'->>'submissionHash' IS DISTINCT FROM p->>'submissionHash' OR p->'reservation'->'body'->>'principalId' IS DISTINCT FROM s.principal OR (p->'request'->'body'->>'chunkIndex')::int NOT BETWEEN 0 AND jsonb_array_length(c.expected->'plan'->'plan'->'chunks')-1
  THEN RAISE EXCEPTION 'M505_EXPECTED'; END IF;
  IF EXISTS(SELECT 1 FROM voice_m505.request WHERE (namespace,tenant,project,movie,studio)=(n,t,pr,mo,st) AND recipe=p->>'recipe') THEN RAISE EXCEPTION 'M505_RECIPE_CLAIMED'; END IF;
  IF (SELECT count(*) FROM voice_m505.request WHERE namespace=n)>=720 OR
   (SELECT count(DISTINCT principal) FROM voice_m505.request WHERE namespace=n)>=32 AND NOT EXISTS(SELECT 1 FROM voice_m505.request WHERE namespace=n AND principal=s.principal) THEN RAISE EXCEPTION 'M505_QUOTA'; END IF;
  INSERT INTO voice_m505.request VALUES(n,t,pr,mo,st,target,p->>'key',p->>'hash',p->>'recipe',p->'request',s.principal,c.source_epoch,c.policy_epoch);
  INSERT INTO voice_m505.submission VALUES(n,t,pr,mo,st,target,p->'submission',p->>'submissionHash',1);
  INSERT INTO voice_m505.reservation(namespace,tenant,project,movie,studio,id,payload,hash,owner_principal,lease_until) VALUES(n,t,pr,mo,st,target,p->'reservation',p->>'reservationHash',s.principal,clock_timestamp()+interval '60 seconds');
  result:=jsonb_build_object('id',target,'created',true);
 ELSE
  SELECT * INTO r FROM voice_m505.reservation WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'M505_NOT_FOUND'; END IF;
  IF s.expires_at<=clock_timestamp() OR (w->>'expiresAtMs')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'M505_PROOF_EXPIRED_AFTER_WAIT'; END IF;
  SELECT * INTO q FROM voice_m505.request WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  prior:=r.revision;
  IF op='inspect' THEN
   RETURN to_jsonb(r)||jsonb_build_object('request',q.payload,'requestHash',q.hash,'submission',(SELECT payload FROM voice_m505.submission WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)),
   'journal',(SELECT to_jsonb(x) FROM voice_m505.result_observation x WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)),
   'attempts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM voice_m505.stage_attempt x WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target)),'[]'),
   'verification',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM voice_m505.verification_receipt x WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target)),'[]'),
   'artifact',(SELECT to_jsonb(x) FROM voice_m505.artifact x WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)),
   'gcIntents',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM voice_m505.gc_intent x WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target)),'[]'),
   'availability',(SELECT state FROM voice_m505.availability WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)));
  END IF;
  -- Observer retains original facts after owner expiry; GC/replay have their own fences.
  IF p_action NOT IN('observe','gc','replay') AND op<>'recover' AND (r.lease_until<=clock_timestamp() OR r.owner_principal<>s.principal) THEN RAISE EXCEPTION 'M505_OWNER'; END IF;
  IF (w->>'ownerGeneration')::int<>r.owner_generation OR (w->>'revision')::int<>r.revision THEN RAISE EXCEPTION 'M505_CAS'; END IF;
  IF op NOT IN('journal','settle','unknown','quarantine','cancel','recover','gc_begin','gc_finish','hold','release','replay_finish') AND (q.source_epoch<>c.source_epoch OR q.policy_epoch<>c.policy_epoch OR q.payload->'body'->'plan' IS DISTINCT FROM c.expected->'plan') THEN RAISE EXCEPTION 'M505_SOURCE_STALE'; END IF;
  IF op='checkpoint' AND p_action='create' THEN
   IF r.checkpoint OR r.cancelled OR r.delivery<>'PREPARED' THEN RAISE EXCEPTION 'M505_CHECKPOINT'; END IF;
   UPDATE voice_m505.reservation SET checkpoint=true,delivery='AWAITING_RESULT',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSIF op='write_confirm' AND p_action='create' THEN
   IF r.delivery<>'DEFINITIVE_SUCCESS' OR r.cancelled OR r.artifact_state<>'STAGED' THEN RAISE EXCEPTION 'M505_WRITE_CONFIRM'; END IF;
  ELSIF op='checkpoint_confirm' AND p_action='create' THEN
   IF NOT r.checkpoint OR r.cancelled OR r.delivery<>'AWAITING_RESULT' THEN RAISE EXCEPTION 'M505_CHECKPOINT_CONFIRM'; END IF;
  ELSIF op='journal' AND p_action='observe' THEN
   IF NOT r.checkpoint OR p->'output'->>'requestHash' IS DISTINCT FROM (SELECT payload->'body'->>'innerRequestHash' FROM voice_m505.submission WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)) THEN RAISE EXCEPTION 'M505_RESULT'; END IF;
   SELECT * INTO j FROM voice_m505.result_observation WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   IF FOUND THEN
    IF j.hash=p->>'resultHash' THEN RETURN jsonb_build_object('duplicate',true); END IF;
    UPDATE voice_m505.reservation SET artifact_state='QUARANTINED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
    INSERT INTO voice_m505.quarantine_hold VALUES(n,t,pr,mo,st,target,'RESULT_CONFLICT',false) ON CONFLICT DO NOTHING;
    UPDATE voice_m505.availability SET state='QUARANTINED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
    result:=jsonb_build_object('conflict',true);
   ELSE
    INSERT INTO voice_m505.result_observation VALUES(n,t,pr,mo,st,target,p->>'resultHash',p->'output',p->'receipt',p->>'audioHash',(p->>'bytes')::int);
   END IF;
  ELSIF op='settle' AND p_action='observe' THEN
   SELECT * INTO j FROM voice_m505.result_observation WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   IF NOT FOUND OR j.output->>'outcome' NOT IN('FIXTURE_BYTES','DEFINITIVE_FAILURE','UNKNOWN') THEN RAISE EXCEPTION 'M505_RESULT_MISSING'; END IF;
   UPDATE voice_m505.reservation SET delivery=CASE j.output->>'outcome' WHEN 'FIXTURE_BYTES' THEN 'DEFINITIVE_SUCCESS' WHEN 'DEFINITIVE_FAILURE' THEN 'DEFINITIVE_FAILURE' ELSE 'UNKNOWN' END,revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSIF op='unknown' AND p_action='recovery' THEN
   IF NOT r.checkpoint OR r.delivery NOT IN('AWAITING_RESULT','UNKNOWN') THEN RAISE EXCEPTION 'M505_UNKNOWN'; END IF;
   UPDATE voice_m505.reservation SET delivery='UNKNOWN',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSIF op='recover' AND p_action='recovery' THEN
   UPDATE voice_m505.reservation SET owner_generation=owner_generation+1,owner_principal=s.principal,lease_until=clock_timestamp()+interval '60 seconds',revision=revision+1,artifact_state=CASE WHEN artifact_state='VERIFIED' THEN 'STAGED' ELSE artifact_state END WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   INSERT INTO voice_m505.recovery_case VALUES(n,t,pr,mo,st,p->>'caseId',target,p->'recovery');
  ELSIF op='cancel' AND p_action='create' THEN
   UPDATE voice_m505.reservation SET cancelled=true,delivery=CASE WHEN checkpoint THEN delivery ELSE 'CANCELLED' END,artifact_state=CASE WHEN checkpoint THEN 'QUARANTINED' ELSE artifact_state END,revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   IF r.checkpoint THEN INSERT INTO voice_m505.quarantine_hold VALUES(n,t,pr,mo,st,target,'CANCELLED_AFTER_CHECKPOINT',false) ON CONFLICT DO NOTHING; END IF;
  ELSIF op='stage' AND p_action='create' THEN
   IF r.delivery<>'DEFINITIVE_SUCCESS' OR r.cancelled OR r.artifact_state NOT IN('PREPARED','STAGED') THEN RAISE EXCEPTION 'M505_STAGE'; END IF;
   SELECT * INTO j FROM voice_m505.result_observation WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   IF p->'stage'->'body'->>'id' IS DISTINCT FROM p->>'stageId' OR p->'stage'->'body'->>'reservationId' IS DISTINCT FROM target OR p->'stage'->'body'->>'submissionId' IS DISTINCT FROM target OR p->'stage'->'body'->>'objectVersion' IS DISTINCT FROM p->>'version' OR (p->'stage'->'body'->>'ownerGeneration')::int IS DISTINCT FROM r.owner_generation OR p->>'audioHash'<>j.audio_hash OR (p->>'bytes')::int<>j.bytes OR
    (SELECT count(*) FROM voice_m505.stage_attempt WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target))>=2 OR
    (SELECT coalesce(sum(bytes),0) FROM voice_m505.stage_attempt WHERE namespace=n)+(SELECT coalesce(sum(bytes),0) FROM voice_m505.orphan_object WHERE namespace=n)+(p->>'bytes')::int>16777216 THEN RAISE EXCEPTION 'M505_STAGE_QUOTA'; END IF;
   INSERT INTO voice_m505.stage_attempt VALUES(n,t,pr,mo,st,target,p->>'stageId',p->>'version',p->'stage',p->>'stageHash',(p->>'bytes')::int,p->>'audioHash');
   UPDATE voice_m505.reservation SET artifact_state='STAGED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSIF op='validate' AND p_action='validate' THEN
   SELECT * INTO a FROM voice_m505.stage_attempt WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,p->>'stageId') AND aggregate_id=target;
   SELECT * INTO j FROM voice_m505.result_observation WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   IF a.id IS NULL OR r.delivery<>'DEFINITIVE_SUCCESS' OR r.cancelled OR r.artifact_state<>'STAGED' OR p->'verification'->'body'->>'stageHash'<>a.hash
    OR p->'verification'->'body'->'inner' IS DISTINCT FROM j.receipt OR p->'verification'->'body'->>'submissionId' IS DISTINCT FROM target OR (p->'verification'->'body'->>'ownerGeneration')::int IS DISTINCT FROM r.owner_generation OR (p->'verification'->'body'->>'revision')::int IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'M505_VALIDATE'; END IF;
   INSERT INTO voice_m505.verification_receipt VALUES(n,t,pr,mo,st,target,a.id,r.owner_generation,r.revision,p->'verification',p->>'verificationHash');
   UPDATE voice_m505.reservation SET artifact_state='VERIFIED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSIF op='finalize' AND p_action='finalize' THEN
   IF r.cancelled OR r.delivery<>'DEFINITIVE_SUCCESS' OR r.artifact_state<>'VERIFIED' THEN RAISE EXCEPTION 'M505_FINALIZE'; END IF;
   SELECT * INTO v FROM voice_m505.verification_receipt WHERE (namespace,tenant,project,movie,studio,stage_id,owner_generation)=(n,t,pr,mo,st,p->>'stageId',r.owner_generation);
   SELECT * INTO a FROM voice_m505.stage_attempt WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,p->>'stageId') AND aggregate_id=target;
   IF v.hash IS NULL OR a.id IS NULL OR p->'artifact'->'body'->>'id' IS DISTINCT FROM target OR p->'artifact'->'body'->>'verificationHash'<>v.hash OR p->'artifact'->'body'->>'objectVersion'<>a.version
    OR p->'artifact'->'body'->>'requestHash' IS DISTINCT FROM q.hash OR p->'artifact'->'body'->>'recipeHash' IS DISTINCT FROM q.recipe OR p->'artifact'->'body'->>'reservationHash' IS DISTINCT FROM r.hash OR p->'artifact'->'body'->>'stageHash' IS DISTINCT FROM a.hash OR p->'artifact'->'body'->>'planHash' IS DISTINCT FROM q.payload->'body'->'plan'->>'planHash' OR p->'artifact'->'body'->>'chunkIndex' IS DISTINCT FROM q.payload->'body'->>'chunkIndex' OR p->'artifact'->'body'->'inner' IS DISTINCT FROM v.payload->'body'->'inner' THEN RAISE EXCEPTION 'M505_FINALIZE_BINDING'; END IF;
   INSERT INTO voice_m505.artifact VALUES(n,t,pr,mo,st,target,a.id,r.owner_generation,p->'artifact',p->>'artifactHash');
   INSERT INTO voice_m505.availability VALUES(n,t,pr,mo,st,target,'AVAILABLE',0);
   UPDATE voice_m505.reservation SET artifact_state='COMMITTED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSIF op='quarantine' AND p_action IN('recovery','validate','replay','observe') THEN
   UPDATE voice_m505.reservation SET artifact_state=CASE WHEN artifact_state='COMMITTED' THEN artifact_state ELSE 'QUARANTINED' END,revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   UPDATE voice_m505.availability SET state='QUARANTINED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target) AND state='AVAILABLE';
   INSERT INTO voice_m505.quarantine_hold VALUES(n,t,pr,mo,st,target,p->>'reason',false) ON CONFLICT DO NOTHING;
  ELSIF op='hold' AND p_action='replay' THEN
   IF r.cancelled OR q.source_epoch<>c.source_epoch OR q.policy_epoch<>c.policy_epoch OR q.payload->'body'->'plan' IS DISTINCT FROM c.expected->'plan' OR NOT EXISTS(SELECT 1 FROM voice_m505.availability WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target) AND state='AVAILABLE') THEN RAISE EXCEPTION 'M505_UNAVAILABLE'; END IF;
   IF (SELECT count(*) FROM voice_m505.read_hold WHERE namespace=n AND expires_at>clock_timestamp())>=720 THEN RAISE EXCEPTION 'M505_HOLD_QUOTA'; END IF;
   INSERT INTO voice_m505.read_hold VALUES(p->>'holdId',n,t,pr,mo,st,target,s.id,clock_timestamp()+interval '5 seconds');
  ELSIF op IN('replay_finish','release') AND p_action='replay' THEN
   IF NOT EXISTS(SELECT 1 FROM voice_m505.read_hold WHERE id=p->>'holdId' AND session_id=s.id AND aggregate_id=target AND expires_at>clock_timestamp()) OR op='replay_finish' AND
    (r.cancelled OR q.source_epoch<>c.source_epoch OR q.policy_epoch<>c.policy_epoch OR q.payload->'body'->'plan' IS DISTINCT FROM c.expected->'plan' OR NOT EXISTS(SELECT 1 FROM voice_m505.availability WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target) AND state='AVAILABLE')) THEN RAISE EXCEPTION 'M505_HOLD_EXPIRED'; END IF;
   DELETE FROM voice_m505.read_hold WHERE id=p->>'holdId' AND session_id=s.id;
  ELSIF op='release_quarantine_hold' AND p_action='recovery' THEN
   IF NOT r.cancelled OR r.delivery NOT IN('DEFINITIVE_SUCCESS','DEFINITIVE_FAILURE','CANCELLED') THEN RAISE EXCEPTION 'M505_HOLD_UNRESOLVED'; END IF;
   UPDATE voice_m505.quarantine_hold SET released=true WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target);
  ELSIF op='gc_begin' AND p_action='gc' THEN
   IF r.delivery NOT IN('DEFINITIVE_SUCCESS','DEFINITIVE_FAILURE','CANCELLED') OR NOT r.cancelled OR
    EXISTS(SELECT 1 FROM voice_m505.read_hold WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target) AND expires_at>clock_timestamp()) OR
    EXISTS(SELECT 1 FROM voice_m505.collection_member WHERE (namespace,tenant,project,movie,studio,artifact_id)=(n,t,pr,mo,st,target)) OR
    EXISTS(SELECT 1 FROM voice_m505.quarantine_hold WHERE (namespace,tenant,project,movie,studio,aggregate_id)=(n,t,pr,mo,st,target) AND NOT released) THEN RAISE EXCEPTION 'M505_GC_HELD'; END IF;
   SELECT * INTO a FROM voice_m505.stage_attempt WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,p->>'stageId') AND aggregate_id=target;
   IF a.id IS NULL THEN RAISE EXCEPTION 'M505_GC_TARGET'; END IF;
   INSERT INTO voice_m505.gc_intent VALUES(n,t,pr,mo,st,p->>'intentId',target,a.version,a.audio_hash,a.bytes,'DELETE_PENDING');
   UPDATE voice_m505.availability SET state='DELETE_PENDING',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   UPDATE voice_m505.reservation SET artifact_state=CASE WHEN artifact_state='COMMITTED' THEN artifact_state ELSE 'QUARANTINED' END,revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
   result:=jsonb_build_object('version',a.version,'hash',a.audio_hash,'bytes',a.bytes);
  ELSIF op='gc_finish' AND p_action='gc' THEN
   UPDATE voice_m505.gc_intent SET state='DELETED' WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,p->>'intentId') AND aggregate_id=target AND version=p->>'version';
   GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'M505_GC_INTENT'; END IF;
   UPDATE voice_m505.availability SET state='DELETED',revision=revision+1 WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target);
  ELSE RAISE EXCEPTION 'M505_ACTION'; END IF;
 END IF;
 -- Deadline is checked again after aggregate/constraint/audit contention.
 IF s.expires_at<=clock_timestamp() OR (w->>'expiresAtMs')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'M505_PROOF_EXPIRED_AFTER_WAIT'; END IF;
 meta:=0;
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='voice_m505' AND tablename NOT IN('audit_event','used_proof','proof_key') LOOP
  EXECUTE format('SELECT coalesce(sum(pg_column_size(x)),0) FROM voice_m505.%I x',item.tablename) INTO affected; meta:=meta+affected;
 END LOOP;
 IF meta>29360128 THEN RAISE EXCEPTION 'M505_METADATA_QUOTA'; END IF;
 INSERT INTO voice_m505.audit_event(namespace,tenant,project,movie,studio,aggregate_id,actor,action,prior_revision,next_revision,reason) VALUES(n,t,pr,mo,st,target,s.principal,op,prior,coalesce((SELECT revision FROM voice_m505.reservation WHERE (namespace,tenant,project,movie,studio,id)=(n,t,pr,mo,st,target)),0),coalesce(p->>'reason','OK'));
 RETURN coalesce(result,jsonb_build_object('ok',true));
END $$;
-- Helper is private and schema-qualified; PostgreSQL has no jsonb_object_length.
CREATE FUNCTION voice_m505.jsonb_object_length_safe(j jsonb) RETURNS int LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,voice_m505,pg_temp AS $$ SELECT count(*)::int FROM jsonb_object_keys(j) $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA voice_m505 FROM PUBLIC;
RESET ROLE;
