# M8-06 Phase 0 — Fake ownership and exclusion feasibility

Date: 2026-10-21, Asia/Bangkok. **Phase 0 PASS / narrowly scoped feasibility GO on the tested host. Operational recovery, Phase 1, real media and production activation remain NO-GO.** This report accepts an isolated ownership experiment, not an M8 storage/reader/GC repair.

## 1. Baseline and owned inventory

Entry: `main`, full HEAD `9e9f858e02102e66c9a9050a5be003307bfc90db`, upstream `origin/main`; clean index, worktree and nonignored untracked inventory. Both feasibility commit `03acd42c26d9e4020b47cfbefec5ab82e337c312` and accepted M8 commit `518bc953c33a54138c133013835267d0c1319db8` are ancestors. Cached `origin/main` remains at accepted M8. Origin matches the user-specified public repository. No fetch, branch switch, reset, merge, rebase or push.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), installed Next.js testing guidance, [M8-05](STORYLINE_M8_05_FAKE_OPERATIONAL_HARDENING_DESIGN.md), unchanged [real-media feasibility](STORYLINE_REAL_MEDIA_TTS_FEASIBILITY_SECURITY_DESIGN.md), [M8 final](STORYLINE_M8_FINAL_ACCEPTANCE.md), [M8-04](STORYLINE_M8_04_FAKE_EXECUTION_SECURITY_ACCEPTANCE.md), [M8-03](STORYLINE_M8_03_FAKE_EXECUTION_FOUNDATION.md), relevant [M7](STORYLINE_M7_FINAL_ACCEPTANCE.md)/[M6](STORYLINE_M6_FINAL_ACCEPTANCE.md) authority/currentness and original [M4 expiry controls](../tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts). Existing reports are historical evidence; fresh results appear only in section 9.

Exactly five new owned files were enumerated before creation:

| Path | Actual Phase 0 responsibility |
| --- | --- |
| [contracts.fixture.ts](../tests/storyline/ownership-exclusion-phase0/contracts.fixture.ts) | Twelve separate strict test-only record domains, permanent restrictions, canonical hashes and bounded parsing. No executable permit or production schema. |
| [supervisor.fixture.ts](../tests/storyline/ownership-exclusion-phase0/supervisor.fixture.ts) | `ownershipFixture`: fresh marked root, fixed child registration/identity checking, descriptor observations, nonserializable closure receipts and in-memory `qualifySuccessor` feasibility CAS. No fence unlink, hold release, quarantine, GC or invocation port. |
| [owner-child.fixture.py](../tests/storyline/ownership-exclusion-phase0/owner-child.fixture.py) | The single enumerated Python file has owner mode and fixed `--descriptor-probe` mode. Standard-library `fcntl.flock`, pinned descriptors, arbitrary `.blob` bytes, bounded commands and close/exit observations only. |
| [feasibility.test.ts](../tests/storyline/ownership-exclusion-phase0/feasibility.test.ts) | Strict contracts and independent service-process experiments; includes unchanged M8 simulator counters as an external no-relaunch oracle. No PostgreSQL bootstrap. |
| This document | Protocol freeze, host evidence, exact results, limitations and separate Phase 1 gates. |

No existing file, dependency, package script, configuration, runtime export, schema, test/assertion or UI is edited. New ignored receipts preserve diagnostic and final executions; all existing receipts/logs remain. Disposable experiment roots are retained, not adopted as M8 roots or cleaned by wildcard.

## 2. Actual existing-source boundaries

Inspected [M8 storage](../lib/storyline/render-execution-fake/storage.ts), [process](../lib/storyline/render-execution-fake/process.ts), [auth](../lib/storyline/render-execution-fake/auth.ts), [contracts](../lib/storyline/render-execution-fake/contracts.ts), [service](../lib/storyline/render-execution-fake/service.ts), [gateway](../lib/storyline/render-execution-fake/database.ts), [source](../lib/storyline/render-execution-fake/source.ts), [index](../lib/storyline/render-execution-fake/index.ts), [scratch schema](../tests/storyline/render-execution-fake/schema.sql), and existing [independent storage](../tests/storyline/render-execution-fake/independent-storage.test.ts), [independent security](../tests/storyline/render-execution-fake/independent-security.test.ts), [restart](../tests/storyline/render-execution-fake/restart.test.ts) definitions. New tests do not import the service/auth/database/source factories or any database fixture.

`attachOwnedBlobFixture` currently serializes cooperating mutations with exclusive empty `MUTATION_LOCK`; it records no per-mutation identity and never reaps by age. `createFakeProcessOwnerForTest` owns private one-use permits and original result maps. Current `inspectPrivate` has SQL read holds, independent byte/final response checks and a separately authenticated quarantine callback; failed release can leave a hold. Existing `recover` changes observation ownership but cannot invoke. Phase 0 neither attaches to these roots nor invokes their recovery paths.

The new test imports only the existing canonical/validation helpers and in-memory M8 process simulator from runtime source. The simulator is used deliberately for counters at zero/one; it performs no OS/media/provider operation. No invocation method is passed to the new supervisor. New child mode is unrelated to M8's older service-only child, which is not executed here.

The seven planning and fourteen execution domains remain unchanged. New Phase 0 domains are not additions to `EXECUTION`, grants in its nine gateways or extensions to v1 envelopes. No source hash, parsed closure record or available kernel lock acts as authorization.

## 3. Contract freeze

`parsePhase0`, `phase0Record`, `phase0Hash`, `phase0Domains`, `phase0Restrictions` and `ceilings` are **new test-only declarations**. They are not existing M8 exports or production APIs. The Phase 0 family is:

`story-recap-fake-ownership-phase0-{root,owner,guard,mutation,writer-closure,reader,reader-closure,decision,incident,health,authority,audit}-v1`.

Every record has exactly `{schemaVersion,scope,restrictions,body}`. Scope has exact namespace/tenant/project/movie/studio values for the isolated synthetic protocol. Actual roots additionally bind unique random fixture/root incarnations, so a record's shared synthetic scope does not confer cross-root authority. Original simulator oracles use a distinct fixture namespace per root. All identities are fixture-generated; request callers cannot supply a source path, URL, command, grant or replacement storage root.

| Kind | Frozen exact body fields |
| --- | --- |
| root | id, incarnation, supervisor, bootHash, device, inode |
| owner | id, incarnation, rootHash, supervisor, bootHash, processStart, pid, generation, descriptorPolicy=NO_TRANSFER_CLOEXEC |
| guard | rootHash, device, inode, registered=true |
| mutation | id, ownerHash, version, intentHash, generation, revision, state=REGISTERED/IO_ACTIVE/CLOSED/UNKNOWN |
| writer-closure | mutationHash, ownerHash, guardHash, allDescriptorsClosed=true, noFutureIO=true, quiescent=true |
| reader | id, ownerHash, version, ticketHash, generation, state=REGISTERED/IO_ACTIVE/CLOSED/UNKNOWN |
| reader-closure | readerHash, ownerHash, allDescriptorsClosed=true, noFutureOpen=true, quiescent=true |
| decision | id, action=OBSERVE/QUALIFY_SUCCESSOR, expectedGeneration, expectedRevision, evidence, outcome=BLOCKED/ELIGIBLE_FOR_FUTURE_PHASE1_ONLY |
| incident | id, targetHash, code=BUSY/IDENTITY/UNKNOWN/REVOKED/CLOSURE |
| health | state=READY/BLOCKED/UNKNOWN, registeredOwners, closedOwners, pending |
| authority | principal, grants, generation |
| audit | decisionHash, previousHash, sequence, actor |

Canonical serialization rejects getters, non-JSON values, invalid Unicode, unsafe/fractional numbers and negative zero; unknown/missing fields and mismatched domain/scope/restrictions reject. Identity lengths ≤100; SHA-256 hex digests exactly 64; decimal device/inode/start/PID strings ≤24 digits; counters ≤1,000,000; positive generations; evidence lists 1–16 hashes; grants unique and from the explicit matrix. Deep-frozen parsed records hash under the separate domain plus newline/canonical JSON. Domain/body hashes are consistency, not authentic authority.

Permanent fields include DISPOSABLE_FAKE_ONLY, SYNTHETIC_ONLY, SIMULATED_NOT_MEDIA, MEDIA_VERIFICATION_NOT_PERFORMED, NOT_RENDERED, humanApproval NONE, sourceVerified false, spending NONE, publication false, original audio EXCLUDED, synthesized narration NONE, speech NOT_VERIFIED, synchronization UNSUPPORTED and operationalRecovery false. No real media measurements are defined; supplying them as additional fields rejects.

Owner/root records are used in actual registration observations. The broader mutation/reader/decision/incident/health/audit schemas are parsed/frozen contract specimens, **not implemented durable ledgers**. In particular, a well-shaped `writer-closure` or `reader-closure` is insufficient: only a supervisor-owned WeakMap receipt can qualify an owner in this experiment. Copied, JSON-reconstructed and correctly shaped invented closure objects fail that capability check.

## 4. Permission, evidence and lock-graph freeze

| Proposed purpose | Permitted Phase 0 scope | Not granted |
| --- | --- | --- |
| OBSERVE | Registered owner/guard identity and bounded closure observations | Source inspection, byte delivery, mutation release |
| REGISTER_WRITER | Separately owned non-media proof writer under fixed guard policy | Actual M8 storage mutation or invocation |
| REGISTER_READER | One-use fixture byte read ticket and closure observation | SQL hold release or source-inspection privilege |
| QUALIFY_SUCCESSOR | Exact original closure plus held original guard, complete registered-owner set and expected model generation/revision | Operational takeover, fence removal, invocation or UNKNOWN resolution |
| REPORT_INCIDENT | Bounded synthetic incident specimen | Quarantine, deletion, source metadata |
| OBSERVE_HEALTH | Redacted counters/state specimen | Root content, credentials, recovery or execution |

These are new record-level purpose names. No native session provider, HTTP endpoint, token issuer or SQL grant is installed. The parent fixture supervisor and enumerated children are trusted test infrastructure. Local reader revocation is an explicit supervisor flag, **not production authentication or a test of current M8 SQL revocation**. Existing inspect/read/quarantine/recover/GC permissions remain independent and unchanged. New authority parsing rejects execute/quarantine/source-inspection promotions and NULL grants.

Future Phase 1 must independently authenticate exact namespace/root/affected four-part scopes, purpose-specific grant, live session/expiry/revocation and native Request method/exact URL/Origin/Fetch Metadata/CSRF if any fixture request seam is proposed. One-use action/body/domain/PID/transaction/deadline MACs and independent SQL principal/grant agreement are mandatory; explicit `IS NOT TRUE` must reject NULL. No new gateway or MAC issuance exists in Phase 0.

Required original evidence: unique root/owner/supervisor incarnation; original pinned guard identity; registered child PID **plus** kernel boot hash/process start observed independently; complete descriptor ownership; live close acknowledgement independently checked, or supervisor-observed exit and pipe closure of the exact original child; no uncertain registered descendant; current original guard acquisition and all other registered owners closed. PID, guard availability, a claim of expiry or a canceled Promise alone never suffice.

Actual kernel exclusion graph: original owned root/guard registration → per-child pinned open → guard identity check → nonblocking exclusive flock → identity recheck → bounded original I/O → terminal seal before descriptor close → independent closure observation. Generation qualification occurs only after original closure and observer lock; Guard/root identity and CAS are rechecked after asynchronous status observation. The added late-replacement case verifies that qualification itself fails if the guard path changes after acquisition; this tightens only the new test fixture, not existing M8 behavior. No SQL transaction, database lock or durable availability transition occurs.

The [M6](../tests/storyline/highlights-persistence/schema.sql)/[M7](../tests/storyline/timeline-persistence/schema.sql) and M8 cooperating SQL graph remains a future integration constraint: action key → M7 scope/session/grant → M6 scope/session/grant/policy/dependency/head → M7 policy/head → execution authorization; service capture locks source before fixture/state, while standalone maintenance takes fixture before source/state. Phase 1 must freeze its full root/decision/hold order without source lock upgrades or reverse acquisitions. No SQL locks may span external I/O, guard acquisition or supervisor waits. Actual PostgreSQL contention/currentness/audit behavior is **NOT TESTED** by this experiment.

## 5. Tested mechanism and supported host

Observed host: Linux/Kali 2026.3, Node.js 26.12.0 and existing `/usr/bin/python3` 3.14.8. No packages installed or host configuration changed. Host review was limited to operating-system identifiers and the kernel/process/descriptor interfaces exercised below; no sandbox, media or deployment capability was probed.

The candidate is Python standard-library **`fcntl.flock(LOCK_EX | LOCK_NB)` on one stable, pinned regular file**. Each test owns a fresh private temporary root, marker, empty GUARD and arbitrary `fixture.blob`. Guard registration binds device/inode; opens use O_NOFOLLOW/O_CLOEXEC and root-relative descriptors. Current path and pinned descriptor identities/link counts are checked before and after acquisition. Separate cooperating owner processes opened the same inode and rejected overlapping writer acquisition with BUSY.

GUARD is never unlinked, recreated or unlocked as a recovery action. Normal terminal owner closure releases its kernel handle; crash closure occurs through the kernel after the supervisor observes the original child exit. Replacement-inode fault injection occurs only inside a new root: new attachment, old writer and a late successor observation all reject identity mismatch; closing the old handle does not delete the substituted path or original retained inode. This demonstrates why locking a newly replaced path would be unsound.

The owner file has exactly two enumerated service-only entry points: owner mode accepts a bounded fixed command vocabulary; `--descriptor-probe` reports descriptors only. The owner can invoke only its same pinned code path under the same interpreter with `-I -S -B --descriptor-probe`; it cannot execute caller commands. No shell, network, media module, arbitrary executable, FD-transfer operation or actual M8 recovery is present. The parent uses only fixed `/usr/bin/python3`/script argv and explicit minimal environment, not inherited provider/database credentials.

This is advisory serialization among reviewed cooperating attachments, not a same-UID attacker sandbox or an enforceably immutable production storage service. `/proc` visibility, local flock semantics, immutable guard registration and trusted code ownership are prerequisites. Other kernels, filesystems, containers, interpreters and mounts are unsupported until separately tested. A passing temporary-root experiment does not certify network-filesystem locks, host power-loss persistence or deployment isolation.

## 6. Original writer and reader evidence

`ownershipFixture` registers supervisor UUID, kernel boot hash and supervisor process start; each child gets unique owner incarnation and PID/start independently compared with `/proc/<owned-pid>/stat`. Root and guard device/inode are bound before commands. Raw root/PID/boot/process observations are retained only in ignored local receipts, not public tracked documentation.

Writer proof: W holds flock and an open create-only diagnostic `.blob`; a second independently opened guard returns BUSY. A stale wire generation rejects. A queued old callback after terminal seal/model generation advance is denied before I/O; original bytes remain unchanged. There is no callback/descriptor escape interface. Owner objects and closure receipts are immutable, and a closure receipt is nonserializable/process-private. No receipt is restored from an ACK string or disk checkpoint.

Normal close: the child seals its future-I/O state **before** closing blob, guard and root descriptors. A returned close observation reports no descriptors beyond standard I/O; parent independently enumerates the exact child's descriptor table and confirms closure. Only then is the receipt minted. One-use reader tickets reject a second open even before termination; terminal seal rejects every subsequent read/write/open.

Reader proof: supervisor revocation while the fixture file descriptor is still open denies delivery/new reads, but independent `/proc` observation still sees the exact original file inode. No closure receipt exists until terminal closure. The experiment does not delete a real hold row, issue a quarantine grant or return narration/movie bytes. It proves that revocation alone cannot establish I/O completion.

CLOEXEC proof: with root, guard and reader file open, all three fixture descriptors report CLOEXEC. The fixed descriptor-probe is exec'd with `close_fds=False`, intentionally avoiding subprocess's blanket descriptor-close shortcut. It independently reports only standard descriptors; the owner waits for that exact probe to finish before returning its result. A second probe ticket and descriptor-export command reject. There is no SCM_RIGHTS, duplicate-FD or arbitrary child interface.

Fork/exec has an intermediate inheritance window. Therefore an unacknowledged probe outcome does **not** produce full-descendant closure authority merely because the owner was killed or the guard became free. That uncertainty is sticky; repeated kill/reap attempts cannot manufacture a receipt. This expected BLOCKED case is essential to the supported protocol. It is not certification that no malicious program could transfer a descriptor.

## 7. State machines, crash cuts and lost ACKs

```mermaid
stateDiagram-v2
  [*] --> REGISTERED
  REGISTERED --> GUARD_HELD: Same pinned inode and exclusive kernel lock
  GUARD_HELD --> IO_ACTIVE: One original write ticket
  REGISTERED --> IO_ACTIVE: One original reader ticket
  IO_ACTIVE --> SEALED: Revoke future I/O then close descriptors
  GUARD_HELD --> SEALED: Close without new work
  SEALED --> CLOSURE_OBSERVED: Independent descriptor observation
  IO_ACTIVE --> REAPED: Exact child SIGKILL and exit observation
  REAPED --> CLOSURE_OBSERVED: No uncertain descendant
  REAPED --> BLOCKED: Descendant evidence uncertain
  CLOSURE_OBSERVED --> QUALIFIED: Original guard and complete owner set plus CAS
```

QUALIFIED means **ELIGIBLE_FOR_FUTURE_PHASE1_ONLY**, never “recovered”, “AVAILABLE” or “safe to delete”. Only the in-memory model generation/revision advances. No existing M8 generation, operation/key/submission, storage version, tombstone, hold, artifact or quota changes.

| Cut / observation | Actual behavior and evidence |
| --- | --- |
| Live original W holds guard | Separate attachment denies BUSY. No forged closure object can qualify a successor. Original bytes survive. |
| Write performed, ACK withheld | Deterministic barrier retained; parent SIGKILL/exit/pipe-close observes original child; independently opened original guard can be acquired. Only a valid original closure receipt permits model qualification. No second write. |
| Seal performed, ACK withheld | A child's unacknowledged claim is insufficient. Test kills/reaps the exact child, obtains independent closure evidence and observes the same original bytes. |
| Qualification result response considered lost | Same decision/body returns original in-memory result; changed-body reuse conflicts and stale expected generation/revision rejects. This is not durable lost-COMMIT recovery. |
| Probe result ACK withheld | Owner exit plus available guard still leaves descendant evidence UNKNOWN; repeated attempts remain BLOCKED and model revision unchanged. |
| Reader revoked with FD live | No delivery/closure claim; original inode remains open until explicit sealed close. No session/lease cleanup. |
| Legacy sentinel/foreign marker | Sentinel retained; foreign registration and invented closure reject. A successful guard acquisition does not fix unknown original ownership. |
| Registered unclosed reader remains | Even with another owner's legitimate receipt and free guard, qualification denies OWNER_NOT_QUIESCENT until every relevant owner is proved closed. |

The supervisor itself stays alive in these crash experiments. Parent death, durable registry loss, unknown foreign descendants, delayed kernel I/O after a host crash, changed boot identity, lost trusted closure journal or power loss are unsupported and must remain BLOCKED. JSONL observations are diagnostics, not replayable recovery capabilities. Service-child restart under the same instrumented parent is not multi-host/power-loss durability.

## 8. Resource and authority separation

Frozen limits: one active owned root; at most four child allocations per root including probe attempts; 64 commands per owner; 4-KiB command frames; 16-KiB contract envelopes; ≤4-KiB readable fake blob; 64-KiB per-owner diagnostics; 15-second parent kill watchdog. Probe invocation is one-use with a three-second subprocess timeout. Bytes are arbitrary non-media text, not WAV/MP4 or video/audio assets. Receipt roots and fixture data are retained. These are small test-fixture bounds, not hostile-media CPU/RAM/disk sandbox guarantees.

Root-limit rejection occurs before another active root is allocated. Rejected registrations/attempts consume the conservative child allowance; no evidence is evicted for capacity. Full observation/root/setup failure is not authorization to continue on weaker ownership. The supervisor has no `arm`, `invoke`, `releaseHold`, `remove`, quarantine or GC API. Its only generation decision is an explicitly named feasibility model.

All seven M8-04 correction families are preserved by byte-identical existing source/tests: concurrent quota serialization; exact surviving-byte tombstone checks; maintenance/inspect separation; independent failed-read quarantine coordinator; authorized live-flow consumption; NULL-denying SQL grants; complete definitive-result/QUIESCENT checks. None is reimplemented or certified through a new SQL run here. The new code cannot clear UNKNOWN, adopt planted bytes, delete substituted versions, release a live database hold or broaden a grant.

Actual unchanged simulator oracles establish one original fake start in each definitive-success crash test and zero/one in BEFORE_START/UNKNOWN variants. Ownership observations and successor qualification leave those counters unchanged; original uncertain journals remain absent. Replacement simulators have zero starts. The original permit is never handed to the supervisor; copied closure/ACK records do not reconstruct it. This is fake-counter evidence, not exactly-once OS/media execution.

## 9. Executed manifest and fresh results

Final focused acceptance: **27/27 tests PASS**, zero failures/skips/cancellations/TODO, 0.954 seconds reported by TAP. Cases comprise twelve strict domain records, one broader contract-negative case, thirteen ownership/process cases and one source-boundary case. One process case uses two separate roots for zero/one-start variants; this adds no test count.

| Prioritized family | Executed subset and result | Limits / future specifications |
| --- | --- | --- |
| A01 | PASS: separate live writer/observer, BUSY, closure plus held guard, unclosed registered reader blocks qualification; active-root limit | No PostgreSQL or actual recovery release. |
| A03 | PASS: old wire generation and queued callback denied; model CAS after closure; original bytes unchanged | No database takeover or durable worker callback protocol. |
| A04 | PASS: two deterministic write/seal lost-ACK barriers, original SIGKILL/exit observations, independent original guard acquisition | Not host power loss or a real encoder crash. |
| A06 | PASS: foreign marker and fake closure rejected; legacy sentinel retained verbatim | Cannot reconstruct uninstrumented ownership. |
| A07 | PASS: replacement guard inode rejected by new attachment and old writer; old close deletes neither inode/path | Trusted-owner fault injection, not same-UID tamper resistance. |
| B02 | PASS: locally revoked reader's exact FD remains open until closure; no delivery or forged closure | Actual M8 SQL session/hold integration NOT RUN. |
| B05 | PASS: live FD inventory, CLOEXEC across fixed exec, no export/reopen, invented receipt rejection; uncertain probe outcome stays BLOCKED | Complete inherited-descendant recovery is not claimed. |
| G02 | PASS: registered service restart/observer qualification adds no fake starts; original zero/one UNKNOWN counters/journals unchanged | Supervisor restart/durable authority reconstruction NOT TESTED. |

These are selected subsets of eight prioritized M8-05 families, **not all 29 families passing**. Complete SQL proof/privilege/currentness/rollback, mutation-fence release, reader-hold release, quarantine-coordinator operation, real GC/retention and UNKNOWN quota saturation remain design-only future acceptance obligations.

Fresh commands (unreachable application datasource applies to all):

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
export PHASE0_RECEIPTS="$PWD/coverage/m8-06-phase0-4o962jt2/phase0-final"
node --conditions=react-server --import tsx --test --test-isolation=none \
  --test-reporter=tap --test-concurrency=1 \
  tests/storyline/ownership-exclusion-phase0/feasibility.test.ts
pnpm lint
pnpm exec tsc --noEmit --incremental false
git diff --check
git diff --cached --check
```

Final evidence is retained in a new ignored coverage directory: TAP, per-root JSONL ownership/descriptor/barrier observations, source freeze, static/staged audits and command results. Each process fixture retains exact unique root/guard/owner identities, original child start/boot observations and command outcomes. SIGKILL barriers precede reaping; normal closure has independent FD observations. Raw operational identities are excluded from this public report and commit. Final run: **14 unique owned roots, 25 registered owner processes, two denied registrations, two fixed descriptor-probe processes (29 total enumerated service processes), five observed SIGKILL exits, three recorded crash barriers, twelve independent descriptor observations and ten normal sealed-closure receipts**. Counts of process observations are not extra tests.

During development, one ordinary Node test-isolation invocation returned only a passing file wrapper; it is **excluded from individual-case accounting**. A direct native test execution reported 24 passing cases; a subsequent isolation-none run reported 25; three intermediate 26-case runs overlap the final manifest and are not additional distinct acceptance cases. The final explicit isolation-none command supplies the 27 counted cases, not a historical report. The earlier 24-, 25- and three 26-case executions total 127 overlapping development/intermediate passes; together with final acceptance, 154 reported leaf executions represent 27 current distinct case titles. The single file wrapper is disclosed separately and adds no distinct leaf case; no claim is made for full M8-05 family acceptance. An initial TypeScript run failed on the new child's missing required NODE_ENV environment type, producing cascading overload errors; that owned-file issue was corrected without changing existing files/assertions. All development receipts remain; no test failure is erased or timing assertion relaxed.

Final `pnpm lint` **PASS**, exit 0; standalone `pnpm exec tsc --noEmit --incremental false` **PASS**, exit 0 with no diagnostics. Python source AST parsing **PASS** without executing a module or creating bytecode. Final exit/results are retained with static acceptance receipts. Full M1–M8 server/PostgreSQL regressions, all original M4 runtime controls, component/Chromium suites, Webpack and executable production bundle audits are **NOT RUN**. No PostgreSQL/Redis/worker startup, schema operation, real source/media access, provider/API/TTS call, package install, host change, approval or spending occurred.

## 10. M4 and existing-boundary preservation

All sixteen original [M4 controls](../tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts) remain byte-identical with SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. The original positive confirmation remains 700 ms. The historical M1-last actual-wire-before-expiry positive repeat 2 incident remains **UNRESOLVED**; no new timing execution or diagnosis occurred. Future recurrence needs original checkpoint ACK, database lock-wait/commit and confirmation/lease epochs, monotonic permit deadline, owner generation and actual fake-wire entry. No widened deadline or speculative resend.

Static source preservation covers every baseline tracked text hash, original M6/M7 scratch SQL/roles/gateways and M8 storage/auth/service/process/contracts/tests. Existing API/UI/routes/actions/configuration and production defaults remain unchanged. New helpers live only under tests; production-source import/reference checks must contain no new fixture/domain/owner capability. No provider credential, root nonce, real media or private process identity enters staged content.

## 11. GO/BLOCKED decision and Phase 1 handoff

| Decision | Verdict / precise gate |
| --- | --- |
| Stable cooperative kernel exclusion on tested disposable Linux roots | **GO / Phase 0 PASS**: measured pinned-inode flock, cross-process exclusion, identity mismatch denial and original closure observations. |
| Qualification with complete registered original closure | **GO only as an in-memory feasibility observation**; no operational effect or new execution authority. |
| Legacy sentinel, unregistered owner, missing receipt or uncertain descendant | **BLOCKED**; guard/PID/session/lease/clock evidence alone never releases anything. |
| Phase 1 operational implementation | **Not authorized here.** Requires a separate scoped request, frozen durable protocols and independent adversarial review. |
| Shared real-media recovery/production/M10 execution | **NO-GO**. Phase 0 PASS does not satisfy M8-05's later implementation-and-acceptance prerequisite. |

Proposed separately authorized Phase 1:

1. Select and review the actual supported storage-owner broker/guard mechanism. The Python helper is test infrastructure, not automatically a runtime adapter. Preserve a fixed single-host ownership/no-transfer policy; unsupported environments stop before SQL. Close or explicitly retain blocked descendant/parent-restart cases; do not reinterpret receipts as durable capabilities.
2. Freeze separate maintenance action/proof/receipt domains, exact owner/scope/root identities, request/session rules, idempotent decision/CAS, bounded audit/quota and full cooperating lock graph. Keep old 7+14 domains and all M6/M7 grants unchanged.
3. Only under the new authorization, introduce separate restricted scratch maintenance ledgers/gateways and instrumental original storage/read lifetimes. No filesystem I/O or guard wait under SQL locks; no cross-system atomicity claim. Durable original journal loss must remain UNKNOWN/BLOCKED.
4. Implement only the specifically authorized fence/read-hold/incident/health paths with audit-complete split-effect recovery. No new fake invocation, permit reconstruction, UNKNOWN quota recycling, identity reuse, unquarantine shortcut or copied source-inspection/quarantine privilege.
5. Independently accept actual restricted SQL/catalog/proof/lock-wait/expiry/audit rollback; complete M8-05 adversarial families, seven preserved fix families and original sixteen M4 controls. Add required regression/UI/build/production audits then, with exact fresh test accounting and retained failures. Neither this document nor 27 passing Phase 0 cases replaces those gates.

Completed static review **PASS**: all **656 baseline tracked text-file hashes** unchanged, **29 relative links** resolved, all **21 existing M8 domains** and original expiry SHA preserved, **12 Phase 0 domains** collision-free, one state diagram with **11 reviewed transitions**, Python syntax valid, no owned-file secret/whitespace matches and no production references to the new fixture. Exact staged scope/bytes are rechecked before commit. Existing exports referenced by new TypeScript also resolved in the completed standalone TypeScript check.

Final static acceptance requires exact five-path inventory, valid referenced symbols/links, diagram transition review, frozen baseline/domain/expiry hashes, proposed-domain collision and secret scans, syntax/whitespace and exact staged bytes. Only these five owned files may enter the authorized local commit `test(storyline): evaluate M8-06 fake ownership exclusion`; full SHA and final status are reported outside this document. No push. Stop after Phase 0, with no Phase 1 or M10 implementation.
