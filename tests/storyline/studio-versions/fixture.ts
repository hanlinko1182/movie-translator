// Owns a new disposable cluster. No application datasource or real media.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { EVIDENCE_ANALYSIS } from "@/lib/storyline/evidence-analysis/contracts";
import { createPersistedEvidenceCandidateValidator } from "@/lib/storyline/evidence-analysis/persisted-candidate";
import { createSyntheticEvidenceAnalysisWorkflow } from "@/lib/storyline/evidence-analysis/synthetic-workflow";
import { createStoryFakeWire } from "@/lib/storyline/jobs/fake-transport";
import { createPersistedNarrationPreparation } from "@/lib/storyline/narration-integration/prepare";
import { STUDIO_EDIT, type SaveStudioEdit } from "@/lib/storyline/studio-versions/contracts";
import { signStudioAuthorization } from "@/lib/storyline/studio-versions/database";
import { sqlCode } from "@/lib/storyline/studio-versions/errors";
import { createDisposableStudioVersionService } from "@/lib/storyline/studio-versions/service";
import { createSyntheticStudioAuthenticationForTest, type SyntheticStudioSession } from "@/lib/storyline/studio-versions/synthetic-auth";
import { scope } from "../fixtures";
import { transactionalFixture } from "../jobs/transactional-gateway.fixture";

export const origin = "https://studio.synthetic.invalid";
type ServiceOptions = Partial<Parameters<typeof createDisposableStudioVersionService>[0]>;
export async function studioVersionFixture(first = true) {
  const f = await transactionalFixture(first, true, true, true, true, true, undefined, true, true);
  const databases: PrismaClient[] = [];
  const close = async () => { await Promise.all(databases.map(db => db.$disconnect())); await f.close(); };
  try {
    await f.configure("r4-analysis", "ANALYZE_EVIDENCE", 11, EVIDENCE_ANALYSIS.version);
    const deliveries = new Map<string, { taskId: string; generation: number }>();
    const services = f.services({ publish: async row => { deliveries.set(row.id, row.payload); return row.id; }, has: async key => deliveries.has(key) });
    const worker = await f.fakeWorker(), checkpoint = await f.checkpointServices(worker.worker), wire = createStoryFakeWire("SUCCESS");
    const workflow = createSyntheticEvidenceAnalysisWorkflow({ sourceDatabase: f.admission, inspectMedia: f.media.inspect, profile: f.currentProfile(),
      admission: services.admission, reconcile: services.reconcile, reader: services.read, worker: worker.worker, checkpoint: checkpoint.service, wire: wire.wire,
      persistence: await f.candidateService(services.resultDatabase), validator: createPersistedEvidenceCandidateValidator({ sourceDatabase: f.runtime,
        resultDatabase: services.resultDatabase, inspectMedia: f.media.inspect, profile: f.currentProfile() }) });
    const result = await workflow.run({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
    if (result.outcome !== "CANDIDATE_READY") assert.fail("Missing synthetic M3 candidate");
    const selectedScope = { ...scope, studioId: f.saved.studioId };
    const selection = { scope: selectedScope, candidateId: result.candidate.id, candidateHash: result.candidate.candidateHash };
    const prepared = await createPersistedNarrationPreparation({ database: await f.narrationReader(), inspectMedia: f.media.inspect, profile: f.currentProfile() }).prepare(selection);
    const m4 = await f.narrationPersistence(), parent = await m4.persist({ ...selection, draft: prepared.draft });
    const original = { id: parent.id, draftHash: parent.draftHash };
    const sql = await readFile("docs/drafts/storyline-m9-r4-disposable-versions.sql", "utf8");
    assert.match(sql, /ROLLBACK;\s*$/); await f.admin.query(sql.replace(/ROLLBACK;\s*$/, "COMMIT;"));
    const key = randomBytes(32);
    await f.admin.query(`INSERT INTO public."StoryR4ValidationKey" VALUES(true,$1)`, [key]);
    await f.admin.query(`INSERT INTO public."StoryR4ProjectTenant" VALUES($1,'tenant-one')`, [scope.projectId]);
    const sessions: SyntheticStudioSession[] = ["editor-a", "editor-b", "reader", "denied", "foreign", "expired", "wide"].map(name => ({
      sessionId: `session-${name}`, token: randomBytes(32).toString("hex"), csrfToken: randomBytes(32).toString("hex"),
      tenantId: name === "foreign" ? "tenant-two" : "tenant-one", principalId: name,
      expiresAt: Date.now() + (name === "expired" ? -60000 : 3600000),
      grants: [{ scope: selectedScope, canRead: name !== "denied", canSave: !["reader", "denied"].includes(name) }],
    }));
    sessions.find(row => row.principalId === "wide")!.grants.push(...["projectId", "movieId", "studioId"].map(field => ({ scope: { ...selectedScope, [field]: "other-resource" }, canRead: true, canSave: true })));
    const authentication = createSyntheticStudioAuthenticationForTest({ mode: "DISPOSABLE_SYNTHETIC_ONLY", allowedOrigin: origin, sessions });
    const configs: { reader?: ReturnType<typeof f.owned.prismaAdapterConfig>; writer?: ReturnType<typeof f.owned.prismaAdapterConfig> } = {};
    for (const kind of ["reader", "writer"] as const) {
      const user = `r4_${kind}_${randomBytes(8).toString("hex")}`, password = randomBytes(32).toString("hex");
      await f.admin.query(`CREATE ROLE "${user}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE "storyline_r4_${kind}" PASSWORD '${password}'`);
      const config = { ...f.owned.prismaAdapterConfig(), user, password }; configs[kind] = config;
      await f.admin.query(`INSERT INTO public."StoryTestAccess" VALUES($1,'READER',$2,$3,$4)`, [user, scope.projectId, scope.movieId, f.saved.studioId]);
      for (const session of sessions.filter(row => row.tenantId === "tenant-one")) await f.admin.query(`INSERT INTO public."StoryR4Access"
        (login,"sessionId","tenantId","principalId","projectId","movieId","studioId","canRead","canSave","validUntil") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [user, session.sessionId, session.tenantId, session.principalId, scope.projectId, scope.movieId, f.saved.studioId,
        session.grants[0].canRead, kind === "writer" && session.grants[0].canSave, new Date(session.expiresAt)]);
    }
    const database = (kind: "reader" | "writer") => { const db = new PrismaClient({ adapter: new PrismaPg({ ...configs[kind]!, pipeline: true, max: 1 }) }); databases.push(db); return db; };
    const readerDatabase = database("reader"), writerDatabase = database("writer");
    const service = (options: ServiceOptions = {}) => createDisposableStudioVersionService({ mode: "DISPOSABLE_SYNTHETIC_ONLY", authentication,
      readerDatabase, writerDatabase, validationKey: key, profile: f.currentProfile(), inspectMedia: f.media.inspect, ...options });
    function request(name = "editor-a", save = false, overrides: { origin?: string | null; csrf?: string | null; cookie?: string | null; fetchSite?: string | null; method?: string; url?: string } = {}) {
      const s = sessions.find(row => row.principalId === name)!;
      const headers = new Headers({ origin, "sec-fetch-site": "same-origin", cookie: `story_r4_test_session=${s.token}`, "x-story-r4-csrf": s.csrfToken });
      for (const [key, header] of [["origin", "origin"], ["csrf", "x-story-r4-csrf"], ["cookie", "cookie"], ["fetchSite", "sec-fetch-site"]] as const)
        if (Object.hasOwn(overrides, key)) { const v = overrides[key]; if (v === null) headers.delete(header); else headers.set(header, v!); }
      return new Request(overrides.url ?? `${origin}/synthetic-internal-adapter`, { method: overrides.method ?? (save ? "POST" : "GET"), headers });
    }
    const api = service(), originalView = await api.readOriginal(request(), { scope: selectedScope, original });
    const anotherOriginalForTest = async () => {
      // A distinct recipe window creates a distinct durable logical task. A
      // new idempotency key alone cannot replace M2's immutable task identity.
      await f.configure("r4-another-analysis", "ANALYZE_EVIDENCE", 10, EVIDENCE_ANALYSIS.version);
      const result = await workflow.run({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
      if (result.outcome !== "CANDIDATE_READY") assert.fail("Missing second synthetic candidate");
      const selection = { scope: selectedScope, candidateId: result.candidate.id, candidateHash: result.candidate.candidateHash };
      const prepared = await createPersistedNarrationPreparation({ database: await f.narrationReader(), inspectMedia: f.media.inspect, profile: f.currentProfile() }).prepare(selection);
      const receipt = await m4.persist({ ...selection, draft: prepared.draft });
      return api.readOriginal(request(), { scope: selectedScope, original: { id: receipt.id, draftHash: receipt.draftHash } });
    };
    function input(key = "edit-one", expectedRevision = 0, previousVersion: SaveStudioEdit["previousVersion"] = null): SaveStudioEdit {
      const sections = originalView.sections.map(row => ({ sectionId: row.sectionId, paragraphs: [...row.paragraphs] }));
      sections[0].paragraphs[0] = "  ပြင်ဆင်ထားသော မြန်မာစာ ဖြစ်သည်။\nအထောက်အထားကို ထပ်မံစစ်ဆေးရမည်။  ";
      return { scope: selectedScope, binding: structuredClone(originalView.binding), sections, idempotencyKey: key, expectedRevision, previousVersion };
    }
    const counts = async () => (await f.admin.query(`SELECT
      (SELECT count(*) FROM public."StoryR4EditedVersion") versions,(SELECT count(*) FROM public."StoryR4SaveFence") fences,
      (SELECT count(*) FROM public."StorySourceVerification") verification,(SELECT count(*) FROM public."StoryScriptVersion") scripts,
      (SELECT count(*) FROM public."StoryNarrationDraft") originals,(SELECT count(*) FROM public."StoryEvidenceCandidate") candidates,
      (SELECT count(*) FROM public."StoryTaskEvent") events,(SELECT count(*) FROM public."StoryProviderSubmission") submissions`)).rows[0];
    // Direct gateway negative probes are internal test code with a synthetic key,
    // never a client-supplied validation proof. Always roll back the probe.
    const probe = async (proposal: SaveStudioEdit, finish = false) => {
      let observed: unknown;
      const sentinel = new Error("Rollback probe");
      try { await writerDatabase.$transaction(async tx => {
        const s = sessions[0], auth = await signStudioAuthorization(tx, key, { sessionId: s.sessionId, tenantId: s.tenantId, principalId: s.principalId }, selectedScope,
          "SAVE", original, { proposalHash: contractHash(STUDIO_EDIT.proposalDomain, proposal) });
        const [row] = await tx.$queryRaw<Array<{ result: unknown }>>`SELECT public.story_r4_save_open(${auth.bytes},${auth.proof},${canonicalJson(proposal)}) result`;
        observed = row.result;
        if (finish) {
          assert.equal((observed as { outcome: string }).outcome, "OPEN", "Negative finish test must first create a real fence");
          try {
            await tx.$queryRaw`SELECT public.story_r4_save_finish(${'{}'},${"0".repeat(64)},${"0".repeat(64)})`;
            assert.fail("Invalid finish proof was accepted");
          } catch (error) {
            if (sqlCode(error) !== "42501") throw error;
            observed = { outcome: "INVALID_FINISH_PROOF_REJECTED" };
          }
        }
        throw sentinel;
      }); } catch (error) { if (error !== sentinel) throw error; }
      return observed;
    };
    return { f, service, api, authentication, sessions, request, input, original, originalView, scope: selectedScope, prepared, wire,
      readerDatabase, writerDatabase, twinWriter: () => database("writer"), readerLogin: configs.reader!.user!, writerLogin: configs.writer!.user!, counts, probe, anotherOriginalForTest, close };
  } catch (error) { await close(); throw error; }
}
