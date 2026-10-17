// Test-only integration bootstrap. Never imported by lib/, app/ or workers/.
// Owns one scratch cluster and an ephemeral HMAC key; has no live configuration.
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { PrismaClient, type Prisma } from "../../../generated/prisma/client";
import { contractHash } from "../../../lib/storyline/canonical";
import type { StoryTaskProfileDefinition, StoryTaskRecipeIdentity } from "../../../lib/storyline/jobs";
import { createPersistedStoryTaskSourceAccess } from "../../../lib/storyline/jobs/persisted-source";
import { createStoryTaskAdmission } from "../../../lib/storyline/jobs/admission";
import { createStoryTaskDispatch, type StoryFakeDelivery } from "../../../lib/storyline/jobs/dispatch";
import { createStoryTaskReconciler } from "../../../lib/storyline/jobs/reconcile";
import { createStoryTaskReader } from "../../../lib/storyline/jobs/read";
import { createStoryTaskFakeWorker } from "../../../lib/storyline/jobs/fake-worker";
import { createStoryTaskFakeRecovery } from "../../../lib/storyline/jobs/fake-worker-recovery";
import { createStoryTaskFakeCheckpoint } from "../../../lib/storyline/jobs/fake-checkpoint";
import { createProvisionalNarrationPersistence } from "../../../lib/storyline/narration-integration/persist";
import { createSyntheticEvidenceCandidatePersistence } from "../../../lib/storyline/evidence-analysis/persist-candidate";
import { persistPreparedStorylineSource } from "../../../lib/storyline/persist-source";
import { persistStorylineScriptDraft } from "../../../lib/storyline/persist-script";
import { prepareStorylineSource } from "../../../lib/storyline/prepare-source";
import { readStorylineSource } from "../../../lib/storyline/read-source";
import { validateSourceSnapshot } from "../../../lib/storyline/source";
import { DisposableStorylinePostgres } from "../disposable-postgres";
import { date, scope, scriptFixture } from "../fixtures";
import { fakePersistenceMedia, seedPersistenceFixture } from "../persistence.fixture";

export type ProofHooks = {
  beforeLock?: () => Promise<void>;
  afterValidation?: () => Promise<void>;
  afterFinalize?: () => Promise<void>;
};
export type DispatchClaim = { taskId: string; generation: number; stateRevision: number; owner: string };
export async function transactionalFixture(m1First: boolean, withFakeWorker = false, withCheckpoint = false, withApiReader = false, withM3Reader = false, withM3Candidate = false,
  seedAdditionalSourceForTest?: (database: PrismaClient) => Promise<void>, withM4NarrationReader = false, withM4NarrationPersistence = false) {
  const owned = await DisposableStorylinePostgres.start();
  const baseline = await owned.client(), admin = await owned.securityAdministrator();
  const setup = new PrismaClient({ adapter: new PrismaPg({ ...owned.prismaAdapterConfig(), pipeline: true, max: 1 }) });
  const clients: Client[] = [], prismaClients: PrismaClient[] = [setup];
  const close = async () => {
    await Promise.all(prismaClients.map(db => db.$disconnect()));
    await Promise.all(clients.map(client => client.end()));
    await admin.end(); await baseline.end(); await owned.stop();
  };
  try {
    for (const folder of (await readdir("prisma/migrations", { withFileTypes: true })).filter(row => row.isDirectory()).map(row => row.name).sort())
      await baseline.query(await readFile(join("prisma/migrations", folder, "migration.sql"), "utf8"));
    await seedPersistenceFixture(setup);
    await seedAdditionalSourceForTest?.(setup);
    const roles = await readFile("docs/drafts/storyline-verification-roles.sql", "utf8");
    if (m1First) await admin.query(roles);
    for (const name of ["storyline-m2-jobs.sql", "storyline-m2-admission-ledger.sql"]) {
      const sql = await readFile(`docs/drafts/${name}`, "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (!m1First) await admin.query(roles);
    for (const name of ["storyline-m2-disposable-admission-gateway.sql", "storyline-m2-transactional-gateway.sql"]) {
      const sql = await readFile(`docs/drafts/${name}`, "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withFakeWorker) {
      const sql = await readFile("docs/drafts/storyline-m2-fake-worker-gateway.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withCheckpoint) {
      assert.equal(withFakeWorker, true);
      const sql = await readFile("docs/drafts/storyline-m2-checkpoint-gateway.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withApiReader) {
      const sql = await readFile("docs/drafts/storyline-m2-api-read.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withM3Reader) {
      assert.equal(withCheckpoint && withApiReader, true);
      const sql = await readFile("docs/drafts/storyline-m3-evidence-read.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withM3Candidate) {
      assert.equal(withM3Reader, true);
      const sql = await readFile("docs/drafts/storyline-m3-candidate-persistence.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withM4NarrationReader) {
      assert.equal(withM3Candidate, true);
      const sql = await readFile("docs/drafts/storyline-m4-narration-read.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    if (withM4NarrationPersistence) {
      assert.equal(withM4NarrationReader, true);
      const sql = await readFile("docs/drafts/storyline-m4-narration-persistence.sql", "utf8");
      assert.match(sql, /ROLLBACK;\s*$/); await admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    }
    const runtimeConfig = await owned.restrictedLogin("storyline_runtime");
    const admissionConfig = await owned.restrictedLogin("storyline_admission_writer");
    const issuerConfig = await owned.restrictedLogin("storyline_synthetic_issuer");
    const outboxConfig = await owned.restrictedLogin("storyline_outbox");
    const readerConfig = await owned.restrictedLogin("storyline_m2_reader");
    const runtime = new PrismaClient({ adapter: new PrismaPg({ ...runtimeConfig, pipeline: true, max: 1 }) });
    const admission = new PrismaClient({ adapter: new PrismaPg({ ...admissionConfig, pipeline: true, max: withCheckpoint ? 1 : 2 }) });
    prismaClients.push(runtime, admission);
    const connect = async (config: typeof runtimeConfig) => { const client = new Client(config); await client.connect(); clients.push(client); return client; };
    const issuer = await connect(issuerConfig), outbox = await connect(outboxConfig), outboxTwin = await connect(outboxConfig), reader = await connect(readerConfig), legacyRuntime = await connect(runtimeConfig), rawAdmission = await connect(admissionConfig);
    const m1Issuer=await connect(await owned.restrictedLogin("storyline_verification_issuer"));
    const checkpoint=await connect(await owned.restrictedLogin("storyline_checkpoint_worker"));
    const media = fakePersistenceMedia();
    const candidate = await prepareStorylineSource(scope, { database: runtime, inspectMedia: media.inspect, now: () => date });
    const saved = await persistPreparedStorylineSource({ selection: scope, candidate, expectedRevision: null }, { database: runtime, inspectMedia: media.inspect });
    assert.equal(saved.snapshotId,candidate.snapshot.payload.id);
    const storedSource=await runtime.storySourceSnapshot.findUniqueOrThrow({where:{id:saved.snapshotId}});
    const source=validateSourceSnapshot(JSON.parse(storedSource.canonicalPayload),scope);
    assert.equal(source.payload.id,saved.snapshotId);
    const scriptSaved = await persistStorylineScriptDraft({ ...scope, sourceSnapshotId: saved.snapshotId, expectedRevision: saved.revision,
      origin: "HUMAN", beats: scriptFixture(source).beats }, { database: runtime, inspectMedia: media.inspect });
    const secret = randomBytes(32); // Private closure; no environment key or exported signer.
    await admin.query(`INSERT INTO public."StoryTestValidationKey" VALUES (true,$1)`, [secret]);
    for (const [config, kind] of [[readerConfig, "READER"], [outboxConfig, "OUTBOX"]] as const)
      await admin.query(`INSERT INTO public."StoryTestAccess" VALUES ($1,$2,$3,$4,$5)`, [config.user, kind, scope.projectId, scope.movieId, saved.studioId]);

    const profile = (kind: "ANALYZE_EVIDENCE" | "REVIEW_EVIDENCE"): StoryTaskProfileDefinition => ({
      id: "synthetic-text", version: "v1", kind, execution: "PAID_TEXT", providerId: "synthetic", modelId: "synthetic/model",
      promptVersion: "p1", responseSchemaVersion: "s1", validatorVersion: "v1", policyVersion: "policy-v1",
      limits: { requestBytes: 100000, responseBytes: 50000, inputTokens: 1000, outputTokens: 500, timeoutMs: 1000 },
      costPolicy: { id: "synthetic-quote", version: "v1", maxEstimatedUsdMicros: 10000 },
    });
    const sourceAccess=createPersistedStoryTaskSourceAccess(admission);
    const sourceReference=(kind: "ANALYZE_EVIDENCE" | "REVIEW_EVIDENCE" = "ANALYZE_EVIDENCE") => ({...scope,studioId:saved.studioId,
      sourceSnapshotId:saved.snapshotId,scriptVersionId:kind === "REVIEW_EVIDENCE" ? scriptSaved.scriptVersionId : null,
      expectedStudioRevision:scriptSaved.revision});
    let currentProfile = profile("ANALYZE_EVIDENCE");
    let identity:StoryTaskRecipeIdentity;
    const configure = async (key: string, kind: "ANALYZE_EVIDENCE" | "REVIEW_EVIDENCE" = "ANALYZE_EVIDENCE", last = 11,
      responseSchemaVersion = "s1") => {
      currentProfile = { ...profile(kind), responseSchemaVersion };
      const inspected=await media.inspect((await readStorylineSource(scope,admission)).storageKey);
      identity=await sourceAccess.transaction(async tx=> {
        const handle=await sourceAccess.load(tx,sourceReference(kind),inspected);
        return sourceAccess.createRecipe(tx,{...sourceReference(kind),kind,profileId:currentProfile.id,profileVersion:currentProfile.version,
          window:{firstSegmentSequence:0,lastSegmentSequence:last},parentResultHashes:[]},handle,currentProfile);
      });
      const r = identity.recipe;
      for (const [config, role] of [[issuerConfig, "ISSUER"], [admissionConfig, "ADMISSION"]] as const)
        await admin.query(`INSERT INTO public."StorySyntheticAuthority" ("loginName","roleKind","subjectId","projectId","movieId","studioId",
          "idempotencyKey",kind,"sourceSnapshotId","sourceContentHash","sourceContextHash","scriptVersionId","scriptHash",
          "recipeHash","canonicalRecipe","profileHash","costPolicyHash","quoteMaxUsdMicros","expectedStudioRevision","canCreate","canSpend","acknowledgedAt")
          VALUES ($1,$2,'synthetic-operator',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1000,$17,true,true,clock_timestamp())
          ON CONFLICT ("loginName") DO UPDATE SET "idempotencyKey"=excluded."idempotencyKey",kind=excluded.kind,
          "scriptVersionId"=excluded."scriptVersionId","scriptHash"=excluded."scriptHash","recipeHash"=excluded."recipeHash",
          "canonicalRecipe"=excluded."canonicalRecipe","profileHash"=excluded."profileHash","acknowledgedAt"=excluded."acknowledgedAt"`,
        [config.user, role, scope.projectId, scope.movieId, saved.studioId, key, kind, saved.snapshotId, source.sourceContentHash,
          source.sourceContextHash, r.script?.versionId ?? null, r.script?.hash ?? null, identity.recipeHash, identity.canonicalRecipe,
          r.profile.definitionHash, contractHash("synthetic-cost-policy-v1", currentProfile.costPolicy), scriptSaved.revision]);
      return identity;
    };
    await configure("key-one");
    const issue = async (ttl = 120000) => (await issuer.query<{ id: string }>(`SELECT public.story_m2_test_issue_decision($1) id`, [ttl])).rows[0].id;
    let lastProof = "";
    // This is the only signer. Caller cannot supply a validation result, recipe,
    // signing callback or proof. All state below is read inside the same tx.
    const admit = async (decisionId: string, hooks: ProofHooks = {}) => {
      const initial = await readStorylineSource(scope, admission);
      const inspected = await media.inspect(initial.storageKey); // outside the lock
      await hooks.beforeLock?.();
      return sourceAccess.transaction(async tx => {
        const opened = await tx.$queryRaw<Array<{ challenge: string }>>`SELECT public.story_m2_test_open_fence(${decisionId},${scope.projectId},${scope.movieId},${saved.studioId}) challenge`;
        const handle=await sourceAccess.load(tx,sourceReference(currentProfile.kind as "ANALYZE_EVIDENCE"|"REVIEW_EVIDENCE"),inspected);
        const checked=await sourceAccess.validateRecipe(tx,identity.recipe,handle,currentProfile);
        assert.equal(checked.canonicalRecipe, identity.canonicalRecipe); assert.equal(checked.recipeHash, identity.recipeHash);
        const challenge = JSON.parse(opened[0].challenge);
        assert.equal(challenge.decisionId, decisionId); assert.equal(challenge.projectId, scope.projectId);
        assert.equal(challenge.movieId, scope.movieId); assert.equal(challenge.studioId, saved.studioId);
        assert.equal(challenge.recipeHash, checked.recipeHash); assert.equal(challenge.sourceSnapshotId, checked.recipe.source.snapshotId);
        assert.equal(challenge.sourceContentHash, checked.recipe.source.contentHash); assert.equal(challenge.sourceContextHash, checked.recipe.source.contextHash);
        assert.equal(challenge.scriptHash, checked.recipe.script?.hash ?? null); assert.equal(challenge.studioRevision, checked.recipe.expectedStudioRevision);
        await hooks.afterValidation?.(); await inspected.assertUnchanged();
        const proof = createHmac("sha256", secret).update(opened[0].challenge, "utf8").digest("hex");
        const result = await tx.$queryRaw<Array<{ id: string }>>`SELECT public.story_m2_test_finalize(${decisionId},${proof},0,0) id`;
        await hooks.afterFinalize?.(); await inspected.assertUnchanged();
        lastProof = proof;
        return result[0].id;
      });
    };
    const replay = async (decisionId: string) => admission.$transaction(async tx => {
      await tx.$queryRaw`SELECT public.story_m2_test_open_fence(${decisionId},${scope.projectId},${scope.movieId},${saved.studioId})`;
      return tx.$queryRaw`SELECT public.story_m2_test_finalize(${decisionId},${lastProof},0,0)`;
    });
    const mutateSource = async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => runtime.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM public."Project" WHERE id=${scope.projectId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM public."Movie" WHERE id=${scope.movieId} FOR UPDATE`;
      return run(tx);
    });
    const claim = async (client = outbox) => (await client.query<DispatchClaim>(`SELECT * FROM public.story_m2_test_claim_due($1,$2,$3,10)`,
      [scope.projectId, scope.movieId, saved.studioId])).rows;
    const delivery = async (c: DispatchClaim, ok: boolean) => (await outbox.query<{ ok: boolean }>(
      `SELECT public.story_m2_test_delivery($1,$2,$3,$4,$5) ok`, [c.taskId,c.generation,c.stateRevision,c.owner,ok])).rows[0].ok;
    const status = async (after: string | null = null, limit = 50) => (await reader.query(
      `SELECT * FROM public.story_m2_test_status($1,$2,$3,$4,$5)`, [scope.projectId,scope.movieId,saved.studioId,after,limit])).rows;
    const keyEnabled = async (enabled:boolean) => {
      if(enabled) await admin.query(`INSERT INTO public."StoryTestValidationKey" VALUES (true,$1)`,[secret]);
      else await admin.query(`DELETE FROM public."StoryTestValidationKey"`);
    };
    // Explicit test-only composition. Keys/credentials never leave this closure;
    // production bootstrap cannot install the synthetic authority from here.
    let outboxDatabase: PrismaClient | undefined, readerDatabase: PrismaClient | undefined;
    const services = (delivery: StoryFakeDelivery, inspectMedia = media.inspect) => {
      if (!outboxDatabase || !readerDatabase) {
        outboxDatabase = new PrismaClient({ adapter: new PrismaPg({ ...outboxConfig, pipeline: true, max: 1 }) });
        readerDatabase = new PrismaClient({ adapter: new PrismaPg({ ...readerConfig, pipeline: true, max: 1 }) });
        prismaClients.push(outboxDatabase, readerDatabase);
      }
      const dispatch = createStoryTaskDispatch({ database: outboxDatabase, delivery, scope: { ...scope, studioId: saved.studioId } });
      return {
        admission: createStoryTaskAdmission({ database: admission, profile: currentProfile, inspectMedia, validationKey: secret }),
        dispatch, reconcile: createStoryTaskReconciler(dispatch), read: createStoryTaskReader(readerDatabase), resultDatabase: readerDatabase,
      };
    };
    const workerDatabases: PrismaClient[] = [];
    const fakeWorker = async (inspectMedia = media.inspect, separateConnection = false) => {
      assert.equal(withFakeWorker, true, "Worker extension is installed only in this explicitly selected disposable fixture");
      const slot = separateConnection ? 1 : 0;
      if (!workerDatabases[slot]) {
        const config = await owned.restrictedLogin("storyline_fake_worker");
        await admin.query(`INSERT INTO public."StoryTestWorkerAccess" VALUES ($1,$2,$3,$4)`, [config.user, scope.projectId, scope.movieId, saved.studioId]);
        workerDatabases[slot] = new PrismaClient({ adapter: new PrismaPg({ ...config, pipeline: true, max: 1 }) });
        prismaClients.push(workerDatabases[slot]);
      }
      const workerDatabase = workerDatabases[slot];
      const worker = createStoryTaskFakeWorker({ database: workerDatabase, scope: { ...scope, studioId: saved.studioId },
        profile: currentProfile, inspectMedia, validationKey: secret });
      return { worker, recovery: createStoryTaskFakeRecovery(worker), database: workerDatabase };
    };
    const checkpointDatabases: PrismaClient[] = [];
    const checkpointServices = async (worker: ReturnType<typeof createStoryTaskFakeWorker>, options: {
      acknowledgementFault?: "DROP_AFTER_COMMIT"; separateConnection?: boolean; inspectMedia?: typeof media.inspect;
    } = {}) => {
      assert.equal(withCheckpoint, true, "Checkpoint gateway is disposable opt-in only");
      const slot = options.separateConnection ? 1 : 0;
      if (!checkpointDatabases[slot]) {
        const config = await owned.restrictedLogin("storyline_checkpoint_worker");
        await admin.query(`INSERT INTO public."StoryTestCheckpointAccess" VALUES ($1,$2,$3,$4)`, [config.user, scope.projectId, scope.movieId, saved.studioId]);
        checkpointDatabases[slot] = new PrismaClient({ adapter: new PrismaPg({ ...config, pipeline: true, max: 1 }) });
        prismaClients.push(checkpointDatabases[slot]);
      }
      return { service: createStoryTaskFakeCheckpoint({ database: checkpointDatabases[slot], worker, scope: { ...scope, studioId: saved.studioId },
        profile: currentProfile, validationKey: secret, inspectMedia: options.inspectMedia ?? media.inspect, acknowledgementFault: options.acknowledgementFault }),
        database: checkpointDatabases[slot] };
    };
    const candidateDatabases: PrismaClient[] = [];
    const candidateWriter = async (separateConnection = false) => {
      assert.equal(withM3Candidate, true, "Candidate gateway is disposable opt-in only");
      const slot = separateConnection ? 1 : 0;
      if (!candidateDatabases[slot]) {
        const config = await owned.restrictedLogin("storyline_m3_candidate_writer");
        await admin.query(`INSERT INTO public."StoryTestCandidateAccess" VALUES ($1,$2,$3,$4)`,
          [config.user, scope.projectId, scope.movieId, saved.studioId]);
        candidateDatabases[slot] = new PrismaClient({ adapter: new PrismaPg({ ...config, pipeline: true, max: 1 }) });
        prismaClients.push(candidateDatabases[slot]);
      }
      return candidateDatabases[slot];
    };
    const candidateService = async (readerDatabase: PrismaClient, options: {
      separateConnection?: boolean; afterInsertForTest?: () => Promise<void>;
    } = {}) => createSyntheticEvidenceCandidatePersistence({
      writerDatabase: await candidateWriter(options.separateConnection), readerDatabase,
      inspectMedia: media.inspect, profile: currentProfile, validationKey: secret,
      afterInsertForTest: options.afterInsertForTest,
    });
    const narrationDatabases: PrismaClient[] = [];
    const narrationReader = async (separateConnection = false) => {
      assert.equal(withM4NarrationReader, true, "Narration read gateway is disposable opt-in only");
      const slot = separateConnection ? 1 : 0;
      if (!narrationDatabases[slot]) {
        const config = await owned.restrictedLogin("storyline_m4_narration_reader");
        await admin.query(`INSERT INTO public."StoryTestAccess" VALUES ($1,'READER',$2,$3,$4)`,
          [config.user, scope.projectId, scope.movieId, saved.studioId]);
        narrationDatabases[slot] = new PrismaClient({ adapter: new PrismaPg({ ...config, pipeline: true, max: 1 }) });
        prismaClients.push(narrationDatabases[slot]);
      }
      return narrationDatabases[slot];
    };
    const narrationWriters: PrismaClient[] = [];
    const narrationWriter = async (separateConnection = false) => {
      assert.equal(withM4NarrationPersistence, true);
      const slot = separateConnection ? 1 : 0;
      if (!narrationWriters[slot]) {
        const config = await owned.restrictedLogin("storyline_m4_narration_writer");
        await admin.query(`INSERT INTO public."StoryTestAccess" VALUES ($1,'READER',$2,$3,$4)`,
          [config.user, scope.projectId, scope.movieId, saved.studioId]);
        narrationWriters[slot] = new PrismaClient({ adapter: new PrismaPg({ ...config, pipeline: true, max: 1 }) });
        prismaClients.push(narrationWriters[slot]);
      }
      return narrationWriters[slot];
    };
    const narrationPersistence = async (options: {
      separateConnection?: boolean; beforeFenceForTest?: () => Promise<void>; afterComposeForTest?: () => Promise<void>; afterInsertForTest?: () => Promise<void>;
    } = {}) => createProvisionalNarrationPersistence({ database: await narrationWriter(options.separateConnection),
      readerDatabase: await narrationReader(), inspectMedia: media.inspect, profile: currentProfile, validationKey: secret, ...options });
    if (withCheckpoint) await setup.$disconnect(); // Release provisioning pool; never worker runtime.
    return { owned, admin, runtime, admission, issuer, outbox, outboxTwin, reader, legacyRuntime, rawAdmission, m1Issuer, checkpoint, saved, scriptSaved, source, media,
      configure, issue, admit, replay, mutateSource, claim, delivery, status, sourceAccess, sourceReference, currentRecipe:()=>identity,
      currentProfile:()=>currentProfile,candidate,keyEnabled,services,fakeWorker,checkpointServices,candidateWriter,candidateService,narrationReader,narrationWriter,narrationPersistence, close };
  } catch (error) { await close(); throw error; }
}
