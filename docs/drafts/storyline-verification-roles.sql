-- REVIEW/DEPLOYMENT PROPOSAL ONLY. Executed only by the disposable M1-E2B test.
-- Run as a privileged migration administrator, never an application connection.
-- Existing application credentials/environment are deliberately not changed.
-- NOLOGIN groups contain no credentials. Provision distinct login identities out
-- of band; runtime/issuer must never be members of migration_owner or each other.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
CREATE ROLE storyline_migration_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE storyline_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE storyline_verification_issuer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO storyline_migration_owner, storyline_runtime, storyline_verification_issuer;
GRANT CREATE ON SCHEMA public TO storyline_migration_owner;
ALTER TABLE public."StorylineStudio" OWNER TO storyline_migration_owner;
ALTER TABLE public."StorySourceSnapshot" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryScriptVersion" OWNER TO storyline_migration_owner;
ALTER TABLE public."StoryBeat" OWNER TO storyline_migration_owner;
ALTER TABLE public."StorySourceVerification" OWNER TO storyline_migration_owner;
-- Owner is privileged administration. These grants enable bounded source locks
-- inside the fixed SECURITY DEFINER gateway; issuer gets no source write grant.
GRANT SELECT, UPDATE ON public."Project", public."Movie" TO storyline_migration_owner;
-- Enumerate the reviewed pre-M2 tables. ON ALL TABLES would grant direct M2
-- paid-table DML when this script runs after the M2 draft.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public."Project", public."Movie", public."Scene", public."Transcript", public."TranscriptSegment",
  public."Translation", public."TranslatedSegment", public."GlossaryEntry", public."TranslationMemoryEntry",
  public."TranslationQcIssue", public."Character", public."CharacterAlias", public."CharacterAnalysisRun",
  public."CharacterEvidence", public."CharacterRelationship", public."CharacterRelationshipEvidence",
  public."Recap", public."RecapSection", public."RecapCharacterInsight", public."RecapRelationshipInsight",
  public."RecapEvidence", public."RenderJob", public."RenderOutput", public."RenderDispatch",
  public."StorylineStudio", public."StorySourceSnapshot", public."StoryScriptVersion", public."StoryBeat"
TO storyline_runtime;
GRANT SELECT ON
  public."Project", public."Movie", public."Scene", public."Transcript", public."TranscriptSegment",
  public."Translation", public."TranslatedSegment", public."GlossaryEntry", public."TranslationMemoryEntry",
  public."TranslationQcIssue", public."Character", public."CharacterAlias", public."CharacterAnalysisRun",
  public."CharacterEvidence", public."CharacterRelationship", public."CharacterRelationshipEvidence",
  public."Recap", public."RecapSection", public."RecapCharacterInsight", public."RecapRelationshipInsight",
  public."RecapEvidence", public."RenderJob", public."RenderOutput", public."RenderDispatch",
  public."StorylineStudio", public."StorySourceSnapshot", public."StoryScriptVersion", public."StoryBeat",
  public."StorySourceVerification"
TO storyline_verification_issuer;
REVOKE ALL ON public."StorySourceVerification" FROM PUBLIC, storyline_runtime, storyline_verification_issuer;
GRANT SELECT ON public."StorySourceVerification" TO storyline_runtime, storyline_verification_issuer;

-- Existing invoker triggers remain unchanged. Only runtime and privileged owner
-- can invoke helpers needed by snapshot/script writes; issuer uses gateways only.
REVOKE ALL ON FUNCTION public.story_m1_lock_studio(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.story_m1_lock_studio(text) TO storyline_runtime, storyline_migration_owner;

CREATE FUNCTION public.story_m1_verification_lock(project_id text, movie_id text, studio_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public."Project" WHERE id = project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification scope unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public."Movie" WHERE id = movie_id AND "projectId" = project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification scope unavailable' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public."StorylineStudio" WHERE id = studio_id AND "movieId" = movie_id AND "projectId" = project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification scope unavailable' USING ERRCODE = '23514'; END IF;
END;
$$;
ALTER FUNCTION public.story_m1_verification_lock(text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m1_verification_lock(text,text,text) FROM PUBLIC, storyline_runtime;
GRANT EXECUTE ON FUNCTION public.story_m1_verification_lock(text,text,text) TO storyline_verification_issuer;

CREATE FUNCTION public.story_m1_verification_append(entry_id text, entry_hash text, payload text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p json; b json; studio_id text; script_id text;
BEGIN
  IF octet_length(payload) NOT BETWEEN 1 AND 32768 THEN
    RAISE EXCEPTION 'Invalid verification envelope' USING ERRCODE = '23514';
  END IF;
  p := payload::json; b := p->'proposal'->'binding';
  studio_id := p->>'studioId'; script_id := p->>'scriptVersionId';
  IF (json_typeof(p) = 'object' AND p->>'persisted' = 'true' AND
      p->>'schemaVersion' = 'story-persisted-human-verification-v1' AND
      p->>'issuerPolicyVersion' = 'story-server-issuer-v1' AND
      p->'operator'->>'authority' = 'AUTHENTICATED_OPERATOR' AND
      p->'issuerAttestation'->>'algorithm' = 'Ed25519' AND
      (p->'issuerAttestation'->>'signature') ~ '^[a-f0-9]{128}$' AND
      studio_id IS NOT NULL AND script_id IS NOT NULL) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid verification envelope' USING ERRCODE = '23514';
  END IF;
  PERFORM public.story_m1_verification_lock(b->>'projectId', b->>'movieId', studio_id);
  -- Cryptographic signature, exact Chinese comparison, authority and live source
  -- validation belong to the server issuer/lookup. This function is not an auth API.
  INSERT INTO public."StorySourceVerification" (
    id, "studioId", "scriptVersionId", "sourceSnapshotId", "sourceContentHash", "sourceContextHash", "scriptHash",
    "claimId", "claimContentHash", "anchorSetHash", "allowedAnchorSetHash", "translationContextHash", "qualificationHash",
    "entryHash", sequence, "previousLedgerHash", "previousEntryId", kind, outcome, "canonicalPayload", "reviewedAt", "issuedAt"
  ) VALUES (
    entry_id, studio_id, script_id, b->>'sourceSnapshotId', b->>'sourceContentHash', b->>'sourceContextHash', p->'proposal'->>'scriptHash',
    b->>'claimId', b->>'claimContentHash', b->>'anchorSetHash', b->>'allowedAnchorSetHash', p->'proposal'->>'translationContextHash', b->>'qualificationHash',
    entry_hash, (p->>'sequence')::integer, p->>'previousLedgerHash', p->>'previousEntryId',
    (p->>'kind')::public."StoryVerificationKind", (p->>'outcome')::public."StoryVerificationOutcome", payload,
    ((p->>'reviewedAt')::timestamptz AT TIME ZONE 'UTC'), ((p->>'issuedAt')::timestamptz AT TIME ZONE 'UTC')
  );
END;
$$;
ALTER FUNCTION public.story_m1_verification_append(text,text,text) OWNER TO storyline_migration_owner;
REVOKE ALL ON FUNCTION public.story_m1_verification_append(text,text,text) FROM PUBLIC, storyline_runtime;
GRANT EXECUTE ON FUNCTION public.story_m1_verification_append(text,text,text) TO storyline_verification_issuer;
COMMIT;
