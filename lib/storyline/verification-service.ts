import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "./canonical";
import { AUTHORITATIVE_DURATION, type AuthoritativeDurationObservation, type AuthoritativeDurationView, type DurableDurationRequest,
  type DurationObservationBinding } from "./authoritative-duration-contracts";
import { AuthoritativeDurationError } from "./authoritative-duration-errors";
import { calculateUntrustedStoryDuration, validateAutoStoryPolicy } from "./duration-engine";
import type { AutoStoryPolicy } from "./duration-contracts";
import { STORYLINE, type Immutable } from "./contracts";
import { HUMAN_VERIFICATION, type HumanVerificationDecision, type SourceVerificationProposal } from "./human-verification-contracts";
import { parseHumanVerificationDecision } from "./human-verification";
import { authorizeStorylineOperator, consumeStorylineOperator, hasStorylineOperatorAuthority, operatorDecisionHash,
  type OperatorScope, type ServerOperatorDecision, type TrustedOperatorAuthority } from "./operator-authority";
import { allClaims } from "./script";
import type { StorylineReadDatabase } from "./read-source";
import { isStorylineReceiptAttestor, type ReceiptAttestor } from "./verification-attestation";
import { assertVerificationSourceCurrent, inspectVerificationSource, loadVerificationContext, type VerificationContext, type VerificationMediaInspector } from "./verification-context";
import { assertVerificationDatabaseBoundary } from "./verification-database";
import { durableVerificationProposal, durableVerificationState, latestVerification, readDurableVerificationLedger, signDurableVerification,
  verificationLedgerHead, verifiedBasisReceipts, DURABLE_VERIFICATION, type DurableVerificationEntry } from "./durable-verification";
import { VerificationSecurityError } from "./verification-errors";
import { date, freeze, hash, id, integer, record, StorylineContractError, text } from "./validation";

type Selection = OperatorScope & { scriptVersionId: string };
type ProposalState = { selection: Selection; context: VerificationContext; proposal: SourceVerificationProposal; revision: number; receiptId: string | null };
declare const commandBrand: unique symbol;
export type DurableVerificationCommand = { readonly [commandBrand]: true };
type Command = ProposalState & { operatorToken: ServerOperatorDecision; decision: HumanVerificationDecision | { receiptId: string; rationale: string }; decisionHash: string };
// Only the genuine factory below can register a read closure. A copied lookup
// DTO, duck-typed service, callback or pure M1-C foundation never enters it.
const durationReaders = new WeakMap<object, (request: DurableDurationRequest, policy: Immutable<AutoStoryPolicy>) => Promise<AuthoritativeDurationObservation>>();

function selection(value: unknown): Selection {
  try {
    const row = record(value, ["projectId", "movieId", "studioId", "scriptVersionId"], "verification.selection");
    return { projectId: id(row.projectId, "projectId"), movieId: id(row.movieId, "movieId"), studioId: id(row.studioId, "studioId"), scriptVersionId: id(row.scriptVersionId, "scriptVersionId") };
  } catch { throw new VerificationSecurityError("VERIFICATION_CONTEXT_INVALID"); }
}
const scopeOf = ({ projectId, movieId, studioId }: OperatorScope): OperatorScope => ({ projectId, movieId, studioId });
async function safe<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) { if (error instanceof VerificationSecurityError || error instanceof AuthoritativeDurationError) throw error; throw new VerificationSecurityError("VERIFICATION_UNAVAILABLE"); }
}

/** Trusted server bootstrap only. No default database/authority/key, route, env
 * enable flag or application instance. Do not populate these ports from requests. */
export function createDurableStorylineVerificationService(options: {
  readerDatabase: StorylineReadDatabase | null; issuerDatabase: StorylineReadDatabase | null;
  authority: TrustedOperatorAuthority | null; attestor: ReceiptAttestor | null;
  now: () => string; inspectMedia?: VerificationMediaInspector;
}) {
  const proposals = new WeakMap<object, ProposalState>(), commands = new WeakMap<object, Command>();
  const attestor = options.attestor;
  function reader() {
    if (!options.readerDatabase || !isStorylineReceiptAttestor(attestor)) throw new VerificationSecurityError("VERIFICATION_DISABLED");
    return { database: options.readerDatabase, attestor };
  }
  function issuer() {
    if (!options.issuerDatabase || !isStorylineReceiptAttestor(attestor) || !attestor.canIssue || !hasStorylineOperatorAuthority(options.authority)) {
      throw new VerificationSecurityError("VERIFICATION_DISABLED");
    }
    return { database: options.issuerDatabase, attestor, authority: options.authority! };
  }
  async function read(tx: Prisma.TransactionClient, selected: Selection, current: boolean, purpose: "READER" | "ISSUER") {
    await assertVerificationDatabaseBoundary(tx, purpose);
    const context = await loadVerificationContext(tx, scopeOf(selected), selected.scriptVersionId, current);
    const entries = await readDurableVerificationLedger(tx, context, attestor!);
    return { context, entries };
  }
  async function prepare(value: unknown, claimId: string, receiptId: string | null) {
    const { database } = issuer(), selected = selection(value);
    const state = await database.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return read(tx, selected, receiptId === null, "ISSUER");
    }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    const { context, entries } = state;
    if (receiptId) {
      const previous = latestVerification(entries, claimId);
      if (!previous || previous.id !== receiptId || previous.content.kind !== "RECEIPT" || previous.content.scriptVersionId !== selected.scriptVersionId) {
        throw new VerificationSecurityError("VERIFICATION_LEDGER_CONFLICT");
      }
    } else await inspectVerificationSource(context, database, options.inspectMedia);
    let proposal: SourceVerificationProposal;
    try { proposal = durableVerificationProposal(context, id(claimId, "claimId"), verificationLedgerHead(entries, context)); }
    catch { throw new VerificationSecurityError("VERIFICATION_CONTEXT_INVALID"); }
    proposals.set(proposal, { selection: selected, context, proposal, revision: context.revision, receiptId });
    return proposal;
  }
  async function authorize(proposal: SourceVerificationProposal, value: unknown, serverSession: unknown, revocation: boolean) {
    const { authority } = issuer(), state = proposals.get(proposal);
    if (!state || (state.receiptId !== null) !== revocation) throw new VerificationSecurityError("VERIFICATION_AUTHORIZATION_INVALID");
    let decision: Command["decision"];
    try { decision = revocation ? { receiptId: state.receiptId!, rationale: text(value, 2000, "revocation.rationale") } : parseHumanVerificationDecision(value, proposal); }
    catch { throw new VerificationSecurityError("VERIFICATION_DECISION_INVALID"); }
    const decisionHash = operatorDecisionHash(revocation ? { proposalHash: proposal.proposalHash, ...decision } : { proposalHash: proposal.proposalHash, decision });
    const operatorToken = await authorizeStorylineOperator(authority, serverSession, {
      scope: scopeOf(state.selection), action: revocation ? "REVOKE_VERIFICATION" : "VERIFY_SOURCE", decisionHash,
    });
    // One authorization per proposal; competing authorize calls may both consult
    // the adapter, but only the first still owns the proposal after awaiting it.
    if (!proposals.delete(proposal)) throw new VerificationSecurityError("VERIFICATION_AUTHORIZATION_INVALID");
    const token = Object.freeze({}) as DurableVerificationCommand;
    commands.set(token, { ...state, decision, decisionHash, operatorToken });
    return token;
  }
  async function append(token: DurableVerificationCommand, revoke: boolean) {
    return safe(async () => {
      const { database, authority, attestor } = issuer(), command = commands.get(token);
      commands.delete(token);
      if (!command || (command.receiptId !== null) !== revoke) throw new VerificationSecurityError("VERIFICATION_AUTHORIZATION_INVALID");
      const action = revoke ? "REVOKE_VERIFICATION" as const : "VERIFY_SOURCE" as const;
      const grant = consumeStorylineOperator(authority, command.operatorToken, { scope: scopeOf(command.selection), action, decisionHash: command.decisionHash });
      // Full private media inspection occurs outside the write transaction. A
      // revocation must remain possible after old source dependencies have changed.
      const media = revoke ? null : await inspectVerificationSource(command.context, database, options.inspectMedia);
      return database.$transaction(async tx => {
        await assertVerificationDatabaseBoundary(tx, "ISSUER");
        const scope = scopeOf(command.selection);
        await tx.$executeRaw`SELECT public.story_m1_verification_lock(${scope.projectId}, ${scope.movieId}, ${scope.studioId})`;
        const { context, entries } = await read(tx, command.selection, !revoke, "ISSUER");
        if (context.revision !== command.revision || verificationLedgerHead(entries, context) !== command.proposal.ledgerHeadHash) {
          throw new VerificationSecurityError("VERIFICATION_LEDGER_CONFLICT");
        }
        if (entries.length >= HUMAN_VERIFICATION.maxEntries) throw new VerificationSecurityError("VERIFICATION_LEDGER_FULL");
        const proposal = durableVerificationProposal(context, command.proposal.binding.claimId, verificationLedgerHead(entries, context));
        if (canonicalJson(proposal) !== canonicalJson(command.proposal)) throw new VerificationSecurityError("VERIFICATION_SOURCE_STALE");
        if (media) await assertVerificationSourceCurrent(tx, context, media);
        const previous = latestVerification(entries, proposal.binding.claimId), decision = command.decision;
        if (revoke && (!previous || previous.id !== command.receiptId || previous.content.kind !== "RECEIPT" ||
          canonicalJson(previous.content.proposal.binding) !== canonicalJson(proposal.binding))) throw new VerificationSecurityError("VERIFICATION_LEDGER_CONFLICT");
        const issuedAt = date(options.now(), "issuedAt");
        if (issuedAt < grant.authorizedAt || issuedAt > grant.expiresAt || entries.at(-1) && issuedAt < entries.at(-1)!.content.issuedAt) {
          throw new VerificationSecurityError("VERIFICATION_AUTHORIZATION_INVALID");
        }
        const outcome = "receiptId" in decision ? "REVOKED" as const : decision.outcome;
        const entry = signDurableVerification({ ...DURABLE_VERIFICATION, persisted: true, studioId: scope.studioId,
          scriptVersionId: context.script.payload.id, kind: revoke ? "REVOCATION" : "RECEIPT", previousEntryId: previous?.id ?? null,
          sequence: entries.length, previousLedgerHash: proposal.ledgerHeadHash, proposal, outcome,
          comparison: "receiptId" in decision ? null : decision.comparison, rationale: decision.rationale,
          operator: { authority: "AUTHENTICATED_OPERATOR", operatorId: grant.subjectId, auditLabel: grant.auditLabel },
          authorityDecision: grant, reviewedAt: grant.authorizedAt, issuedAt,
          basisReceiptHashes: outcome === "SOURCE_VERIFIED" ? verifiedBasisReceipts(entries, context, proposal) : [],
        }, attestor);
        await tx.$executeRaw`SELECT public.story_m1_verification_append(${entry.id}, ${entry.entryHash}, ${canonicalJson(entry.content)})`;
        if (media) {
          try { await media.assertUnchanged(); } catch { throw new VerificationSecurityError("VERIFICATION_SOURCE_STALE"); }
        }
        const final = await tx.storylineStudio.findUniqueOrThrow({ where: { id: scope.studioId }, select: { revision: true } });
        return freeze({ persisted: true, receiptId: entry.id, claimId: proposal.binding.claimId, outcome, revision: final.revision,
          sourceContextHash: context.source.sourceContextHash, scriptHash: context.script.scriptHash });
      }, { isolationLevel: "ReadCommitted", timeout: 30_000, maxWait: 5000 });
    });
  }
  async function observe(value: unknown, receiptId: string | null, durationRequest?: { request: DurableDurationRequest; policy: Immutable<AutoStoryPolicy> }) {
    return safe(async () => {
      const { database } = reader(), selected = selection(value);
      const initial = await database.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await assertVerificationDatabaseBoundary(tx, "READER");
        return loadVerificationContext(tx, scopeOf(selected), selected.scriptVersionId, false);
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
      let media = null;
      try { media = await inspectVerificationSource(initial, database, options.inspectMedia); }
      catch (error) { if (!(error instanceof VerificationSecurityError) || error.code !== "VERIFICATION_SOURCE_STALE") throw error; }
      return database.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const { context, entries } = await read(tx, selected, false, "READER");
        const studio = await tx.storylineStudio.findUniqueOrThrow({ where: { id: selected.studioId } });
        let current = !!media && studio.currentSnapshotId === context.source.payload.id && studio.currentScriptVersionId === context.script.payload.id;
        if (current && media) {
          try { await assertVerificationSourceCurrent(tx, context, media); } catch { current = false; }
        }
        const stateFor = (entry: DurableVerificationEntry) => {
          const state = durableVerificationState(entries, entry, context);
          return !current && state !== "REVOKED" && state !== "SUPERSEDED" ? "STALE" as const : state;
        };
        const claims = allClaims(context.script).map(claim => {
          const entry = latestVerification(entries, claim.id);
          return { claimId: claim.id, state: entry ? stateFor(entry) : "PENDING" as const, receiptId: entry?.id ?? null };
        });
        const requested = receiptId === null ? null : entries.find(row => row.id === id(receiptId, "receiptId"));
        if (receiptId !== null && (!requested || requested.content.scriptVersionId !== selected.scriptVersionId)) throw new VerificationSecurityError("VERIFICATION_CONTEXT_INVALID");
        const lookup = freeze({ persisted: true, contextState: current ? "CURRENT" as const : "STALE" as const,
          studioId: selected.studioId, scriptVersionId: selected.scriptVersionId, scriptHash: context.script.scriptHash,
          sourceContextHash: context.source.sourceContextHash, claims, receipt: requested ? { receiptId: requested.id, state: stateFor(requested) } : null,
          sourceEligible: current && claims.length > 0 && claims.every(claim => claim.state === "SOURCE_VERIFIED"),
          scriptApproved: false, voiceEligible: false,
          dependencyHash: contractHash("story-durable-verification-lookup-v1", { current, script: context.script.scriptHash, source: context.source.sourceContextHash,
            ledger: verificationLedgerHead(entries, context), claims }) });
        if (!durationRequest) return { lookup, duration: null };
        const { request, policy } = durationRequest;
        if (!current || request.sourceSnapshotId !== context.source.payload.id) throw new VerificationSecurityError("VERIFICATION_SOURCE_STALE");
        if (request.expectedRevision !== context.revision) throw new AuthoritativeDurationError("DURATION_REVISION_STALE");
        const durationPolicyHash = contractHash("story-duration-policy-v1", validateAutoStoryPolicy(policy));
        if (request.policyHash !== durationPolicyHash) throw new AuthoritativeDurationError("DURATION_POLICY_MISMATCH");
        // No caller-supplied trust: these states were derived from the complete
        // signed ledger above in this same read-only transaction snapshot.
        let plan: ReturnType<typeof calculateUntrustedStoryDuration>;
        try { plan = calculateUntrustedStoryDuration(context.source, context.script, request.inventory, policy, lookup); }
        catch (error) {
          if (error instanceof StorylineContractError) throw new AuthoritativeDurationError("DURATION_INPUT_INVALID");
          throw error;
        }
        const binding: DurationObservationBinding = { ...scopeOf(selected), sourceSnapshotId: context.source.payload.id,
          scriptVersionId: selected.scriptVersionId, sourceContentHash: context.source.sourceContentHash,
          sourceContextHash: context.source.sourceContextHash, scriptHash: context.script.scriptHash, studioRevision: context.revision,
          verificationPolicy: HUMAN_VERIFICATION.version, verificationBindingPolicy: STORYLINE.verificationVersion,
          receiptSchemaVersion: DURABLE_VERIFICATION.schemaVersion, issuerPolicy: DURABLE_VERIFICATION.issuerPolicyVersion,
          rubricVersion: HUMAN_VERIFICATION.rubricVersion, ledgerHeadHash: verificationLedgerHead(entries, context),
          verificationDependencyHash: lookup.dependencyHash, durationPolicy: policy.id, durationPolicyHash,
          durationEngineVersion: plan.schemaVersion, inputHash: plan.inputHash, currentness: "CURRENT_AT_READ_SNAPSHOT" };
        const observedAt = date(options.now(), "duration.observedAt");
        // Filesystem identity is not protected by PostgreSQL MVCC. Recheck at
        // the end of the observation, without claiming a reservation afterwards.
        try { await media!.assertUnchanged(); } catch { throw new VerificationSecurityError("VERIFICATION_SOURCE_STALE"); }
        const unsupported = new Set(["STALE", "UNSUPPORTED", "REVOKED", "SUPERSEDED"]);
        const contributions = plan.provisionalEvents.map(event => ({ eventId: event.eventId,
          reasons: [...new Set([...event.claims.filter(claim => claim.state !== "SOURCE_VERIFIED").map(claim => claim.state),
            ...(event.predecessorBlocked ? ["PREDECESSOR_UNVERIFIED"] : [])])].sort() }));
        const excludedContributions = contributions.filter(event => event.reasons.some(reason => unsupported.has(reason)));
        const provisionalContributions = contributions.filter(event => !event.reasons.some(reason => unsupported.has(reason)));
        const duration = freeze({ ...plan, observationVersion: AUTHORITATIVE_DURATION.version, observationOnly: true as const,
          contextStatus: "AUTHORITATIVE_DURABLE_OBSERVATION" as const, observedAt, binding,
          observationHash: contractHash(AUTHORITATIVE_DURATION.version, { binding, observedAt }),
          authorizesScriptApproval: false as const, authorizesVoice: false as const, authorizesExecution: false as const,
          contributionCounts: { supported: plan.counts.supportedEvents, provisional: provisionalContributions.length, excluded: excludedContributions.length },
          provisionalContributions, excludedContributions });
        canonicalJson(duration, AUTHORITATIVE_DURATION.bytes);
        return { lookup, duration };
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    });
  }
  const service = Object.freeze({
    capability: Object.freeze({ applicationEnabled: false, requiresTrustedBootstrap: true }),
    propose: (value: unknown, claimId: string) => safe(() => prepare(value, claimId, null)),
    proposeRevocation: (value: unknown, claimId: string, receiptId: string) => safe(() => prepare(value, claimId, id(receiptId, "receiptId"))),
    authorize: (proposal: SourceVerificationProposal, value: unknown, session: unknown) => safe(() => authorize(proposal, value, session, false)),
    authorizeRevocation: (proposal: SourceVerificationProposal, rationale: unknown, session: unknown) => safe(() => authorize(proposal, rationale, session, true)),
    issue: (token: DurableVerificationCommand) => append(token, false),
    revoke: (token: DurableVerificationCommand) => append(token, true),
    lookup: async (value: unknown, receiptId: string | null = null) => (await observe(value, receiptId)).lookup,
  });
  durationReaders.set(service, async (request, policy) => (await observe({ projectId: request.projectId, movieId: request.movieId,
    studioId: request.studioId, scriptVersionId: request.scriptVersionId }, null, { request, policy })).duration!);
  return service;
}

/** Trusted bootstrap only. This service has no writer, issuer, global instance,
 * environment defaults or application integration. Every observation/recheck
 * performs the actual restricted-role durable lookup; a view is never a lease. */
export function createAuthoritativeStorylineDurationService(verificationService: unknown, policyValue: unknown) {
  const read = verificationService !== null && typeof verificationService === "object" ? durationReaders.get(verificationService) : undefined;
  if (!read) throw new AuthoritativeDurationError("DURATION_AUTHORITY_INVALID");
  const policy = validateAutoStoryPolicy(policyValue), policyHash = contractHash("story-duration-policy-v1", policy);
  const views = new WeakMap<object, { requestHash: string; bindingHash: string }>();
  function parse(value: unknown): DurableDurationRequest {
    try {
      canonicalJson(value, AUTHORITATIVE_DURATION.bytes / 2);
      const row = record(value, ["projectId", "movieId", "studioId", "sourceSnapshotId", "scriptVersionId", "expectedRevision", "policyHash", "inventory"], "duration.request");
      const selected = selection({ projectId: row.projectId, movieId: row.movieId, studioId: row.studioId, scriptVersionId: row.scriptVersionId });
      const request = freeze({ ...selected, sourceSnapshotId: id(row.sourceSnapshotId, "sourceSnapshotId"),
        expectedRevision: integer(row.expectedRevision, "expectedRevision"), policyHash: hash(row.policyHash, "policyHash"),
        // Own a bounded copy across awaits. The numerical kernel validates its
        // event/arc/visual ownership against server-loaded source and script.
        inventory: JSON.parse(canonicalJson(row.inventory)) });
      if (request.policyHash !== policyHash) throw new AuthoritativeDurationError("DURATION_POLICY_MISMATCH");
      return request;
    } catch (error) {
      if (error instanceof AuthoritativeDurationError) throw error;
      throw new AuthoritativeDurationError("DURATION_INPUT_INVALID");
    }
  }
  async function observe(value: unknown) {
    const request = parse(value), result = await read!(request, policy);
    // No fields can be cloned into authority. JSON/structuredClone fail, spreads
    // and forged brands fail the private identity check before any I/O.
    const view = Object.freeze({ toJSON() { throw new AuthoritativeDurationError("DURATION_AUTHORITY_INVALID"); } }) as unknown as AuthoritativeDurationView;
    views.set(view, { requestHash: contractHash("story-duration-request-v1", request), bindingHash: contractHash("story-duration-binding-v1", result.binding) });
    return Object.freeze({ view, result });
  }
  return Object.freeze({
    capability: Object.freeze({ applicationEnabled: false, observationOnly: true, policyHash }),
    observe,
    async recheck(view: unknown, value: unknown) {
      const previous = view !== null && typeof view === "object" ? views.get(view) : undefined;
      if (!previous) throw new AuthoritativeDurationError("DURATION_AUTHORITY_INVALID");
      const request = parse(value);
      if (previous.requestHash !== contractHash("story-duration-request-v1", request)) throw new AuthoritativeDurationError("DURATION_OBSERVATION_STALE");
      const next = await observe(request);
      if (previous.bindingHash !== contractHash("story-duration-binding-v1", next.result.binding)) throw new AuthoritativeDurationError("DURATION_OBSERVATION_STALE");
      return next;
    },
  });
}
