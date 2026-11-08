# M10-04D Linux media sandbox runner

## Verdict

- **Runner code** `RUNNER_CODE_TESTS_PASS`. The harmless fixture compiles as static Linux x86-64 ELF, and the descriptor verifier accepted its independently measured bytes. The guarded focused suite passed 32 cases.
- **Host enforcement** `HOST_ENFORCEMENT_BLOCKED` with `CGROUP_MOUNT_READ_ONLY`. The opt-in command exited 2 at preflight with zero enforcement checks and zero fixture launches. Each native enforcement challenge is `NOT_RUN` on this host.
- **M10-04E real-media pilot** `BLOCKED`. Host enforcement, probe executable and dependency trust, current source-byte read authority, and source rights still need independent evidence. No `SANDBOX_QUALIFIED` receipt was issued.

## Baseline and design

Implementation began on clean `main` at `7bde18da4be78edb3f878871a3ada1447029c3f7`. Git ancestry checks found the expected M10-04A, M10-04B and M10-03B commits. The entry hash manifest contains 759 tracked files. Each entry matched after implementation. Review covered AGENTS.md, CLAUDE.md, the installed Next.js testing guide, prior milestone reports and corresponding contracts, and the existing server and production audits. [M10-04A planning](STORYLINE_M10_04A_VIDEO_HIGHLIGHTS_FOUNDATION.md), [M10-04B source integrity](STORYLINE_M10_04B_PRIVATE_VIDEO_SOURCE_INTEGRITY.md), [M10-04C probe contracts](STORYLINE_M10_04C_MEDIA_PROBE_FOUNDATION.md), [M10-03A narration intake](STORYLINE_M10_03A_NARRATION_AUDIO_INTAKE.md), [M10-03B private narration store](STORYLINE_M10_03B_PRIVATE_NARRATION_ARTIFACTS.md).

The host has Linux `7.1.5+kali-amd64` on x86-64, Node `26.12.0`, Bubblewrap `0.13.1` and a local C toolchain. The selected path uses a reviewed static native bootstrap and fixture with direct Linux controls. It keeps the dependency graph and descriptor handoff small. The cgroup v2 mount reports `ro,nosuid,nodev,noexec,relatime,nsdelegate,memory_recursiveprot,memory_hugetlb_accounting`. The opt-in path stops on the read-only mount before compiler discovery, reservation or launch. Host configuration was left in place. [Linux cgroup v2 controls](https://docs.kernel.org/admin-guide/cgroup-v2.html), [Linux seccomp filters](https://docs.kernel.org/userspace-api/seccomp_filter.html).

## Execution and trust boundaries

1. The server-only entry point accepts explicit opt-in and a canonical, already delegated cgroup v2 subtree. It rejects root, unsupported platforms, unknown options, inherited opt-in and accessor fields. It checks ownership, mount identity, caller membership, active controllers and access. The operator must supply an existing dedicated delegation with a trusted ancestor and enough reserved CPU, memory and PID headroom to isolate the negative controls. The runner enables no controllers and uses no system setup helper.
2. The runner verifies the shipped C source hash and compiles only that source with the installed trusted compiler and fixed arguments. Its private scratch directory contains only a fixed text canary, the reviewed C source and the generated binary. The compiler runs in a detached group with a fixed path, environment, time and captured-output budget. The host toolchain, the initiating Node process, repository files, and other processes with the same host identity are trusted. This milestone does not defend against a compromised toolchain, kernel, or same-UID host writer.
3. Every fixture case reserves the same exclusive child name under the approved delegation. The runner refuses a conflicting reservation. Before launch it sets and reads back a 32 MiB memory cap with zero swap and group OOM, 50 ms of CPU per 100 ms period, and four tasks. It confirms a domain cgroup is empty and that the kernel accepts `cgroup.kill` on that newly owned empty leaf. The trusted bootstrap self-enrolls via the inherited control descriptor before creating descendants.
4. The bootstrap opens private user, mount, PID, network, IPC and UTS namespaces. A PID-namespace child checks distinct namespace inodes and runs as PID 1 with non-root UID/GID 65534 mapped to the initiating user. It builds a 64 KiB tmpfs root, copies only the fixed input from a read-only descriptor, detaches the previous root and remounts its root read-only with `nodev,nosuid,noexec`. There is no host directory, repository, narration store, procfs, device or socket exposed in the new root. It drops capability sets and applies no-new-privileges and an x86-64 default-deny seccomp filter. Socket creation, namespace creation, privilege changes, executable mappings and further execution are outside the allowlist. The only accepted input protocol in this policy is a synthetic local descriptor.
5. The payload has a 128 MiB address-space rlimit, zero core dumps and a one-second CPU rlimit. Node enforces a five-second wall deadline and caps stdout at 64 KiB and stderr at 8 KiB. A separate six-second native alarm protects the namespace if the Node supervisor is lost. The PID 1 child registers kernel parent-death signaling and checks a liveness pipe to close the registration race. The watchdog qualification case allows eight seconds to observe native termination without an earlier Node kill.
6. On termination the runner combines child closure with scoped cgroup kill, kernel `populated 0` and removal of the exact owned cgroup. A cleanup timeout or failed ownership check blocks qualification. A leftover cgroup causes a later reservation to fail closed. Qualification emits fixed codes, fixture case names and hashes. Child text, diagnostics, absolute paths and underlying exception messages stay outside the returned evidence.

## Executable identity

The internal verifier checks a frozen expected absolute path, trusted version label, dependency policy, UID and independently measured SHA-256. It requires a regular, single-link, mode `0500` file, rejects symlink resolutions and checks device, inode, times, size, owner and mode against the held file and path. Its bounded ELF inspection requires x86-64 `ET_EXEC`, a valid executable entry segment and no `PT_INTERP`, `PT_DYNAMIC`, executable stack or writable executable load segment. Each launch rechecks the held bytes and metadata. It executes through the same descriptor exposed as child FD 3, using fixed fixture-case arguments and an internally generated scratch root. No version command is executed. The version is an external review assertion bound to exact bytes. Dynamic dependency closure, installed FFprobe trust and the future probe argument list require separate review.

The independently compiled fixture was inspected with `readelf` and passed the pinned descriptor check. Its build-specific SHA-256 is `a13a0ad50aade749bbe7e97e4e76935bdfe278553b08935cbb7f85df8f9a682f`. This digest describes the compilation check. The qualification command produced no launch receipt.

## Qualification evidence

```sh
node --conditions=react-server --import tsx tests/storyline/media-sandbox-runner/qualify.ts
node --conditions=react-server --import tsx tests/storyline/media-sandbox-runner/qualify.ts --qualify-harmless-linux-host /sys/fs/cgroup/ALREADY_DELEGATED_SCOPE
```

Without the flag, the command reports `HOST_ENFORCEMENT_NOT_RUN`. With the flag on this host, it returned `{"status":"HOST_ENFORCEMENT_BLOCKED","blocker":"CGROUP_MOUNT_READ_ONLY","checks":[],"qualificationScope":"HARMLESS_FIXTURE_ONLY"}`. The flag without a scope was sufficient to observe this early blocker safely.

| Control | Evidence required on an eligible host | This run |
| --- | --- | --- |
| Isolation | Separate fixture markers for namespace identities, socket rejection, non-root/no-new-privileges and cleared capabilities, syscall denial, exact read-only canary and denied host file, and address-space rejection | NOT_RUN |
| CPU | CPU marker, rlimit signal observation, kernel CPU usage and throttling counters, absence of cgroup OOM | NOT_RUN |
| Memory and process limits | Local group OOM kill after a bounded 48 MiB allocation attempt, and a separate rejected fork with PID limit event | NOT_RUN |
| Output | Independent stdout and stderr overflow outcomes followed by proven cleanup | NOT_RUN |
| Wall deadline and cleanup | Live descendants before Node timeout and proven empty cgroup after cleanup. Separate alarm case requires kernel SIGALRM and an already empty cgroup before cleanup | NOT_RUN |
| Exit | Expected deliberate nonzero exit after isolation checks, with proven cleanup | NOT_RUN |
| Executable identity | Independently measured binary hash, descriptor pin and pre-launch recheck on the actual run | Static identity PASS, launch NOT_RUN |

A successful run fingerprints kernel build and release, boot identity, namespace identities, effective security status, runtime version, delegated cgroup identity, runner source, policy and fixture bytes. Changes in that environment or execution policy require new evidence. The evidence is scoped to the exact harmless fixture. The code tests exercise observation classification and refusal paths with simulated child events. Actual namespace, seccomp, cgroup, watchdog and descendant-cleanup behavior has yet to be exercised together on a delegated host.

## Verification

Verification used a clean inherited environment with explicit tool settings, telemetry disabled, and an unreachable dummy application datasource at `127.0.0.1:1/storyline_unreachable`. A local verification preload denied dotenv/npmrc reads and Node socket, HTTP, HTTPS and fetch dispatch. Guarded compiler subprocess permission was used for Webpack. Logs are preserved under the ignored `coverage/m10-04d-20261106/` directory.

| Command or scope | Result |
| --- | --- |
| `node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/media-sandbox-runner/runner.test.ts` | PASS, 32 passed, 0 failed, 0 skipped |
| Same runner for M10-04C probe/boundaries/sandbox, M10-04A boundaries/compatibility/planner, M10-04B boundaries/reader/security, M10-03A/B boundary suites, M6 highlights foundation and M7 timeline boundaries/foundation | PASS, 401 passed, 0 failed, 0 skipped |
| Distinct acceptance cases | 433 passed across disjoint focused and regression selections. 591 passing executions across all recorded runs, including 158 repeated focused executions |
| Host CLI without flag and with flag | NOT_RUN by default, BLOCKED on opt-in, zero fixtures launched |
| `cc -static -no-pie -O2 -Wall -Wextra -Werror`, `readelf -h -l`, independent `sha256sum` and descriptor check | PASS, no fixture invocation |
| `pnpm lint` and `pnpm exec tsc --noEmit --incremental false` | PASS |
| `pnpm exec next build --webpack` | PASS, 12 static pages and build traces |
| `node tests/storyline/<area>/production-audit.mjs` | 14 PASS, including 04D, M10, M8 and applicable M6/M7 audits. New audit inspected eight module files, two fixed launch call sites, 391 external source files and 217 built JavaScript files. Zero production runner references or Server Actions |
| Source inventory, SHA-256 verification, scoped secret scan, documentation links, `git diff --check` and `git diff --cached --check` | PASS |

Development logs retain the initial ES2017 bigint and environment-type errors, an accessor return annotation error, a missing policy import during watchdog development, and a TypeScript run racing replacement of generated Next types. The first sandboxed Webpack attempt could not read the compiler subprocess output. A guarded compiler-permission run exposed the remaining environment-type cast, which was corrected. Standalone TypeScript and the guarded production build subsequently passed in sequence. Initial shell wrappers also used the reserved zsh `status` variable after the underlying commands completed. Their replacement preserved the recorded test output and actual exit statuses.

**NOT_RUN** Native fixture execution and every OS challenge, FFprobe, FFmpeg, decoders, real media, the private narration WAV, authenticated provider requests, paid work, application databases, disposable PostgreSQL, Redis, production workers, broad UI/Chromium suites and the M4 timing suite. The scope uses existing boundary and pure regressions, with no production activation. OpenRouter remains `OPENROUTER_ONLY` with `google/gemini-3.8-flash-tts` and Kore. M10-02B live admission remains BLOCKED. M8 fake authority stays separate. The M4 timing incident remains unresolved. All sixteen expiry controls and their original 700 ms positive deadline are preserved. Its SHA-256 remains `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. [Unchanged expiry source](../tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts).

## M10-04E handoff

The public entry point exposes the frozen policy and digest, the explicit fixture qualifier and a pure handoff. The handoff accepts no authority input and keeps `probeExecutionAuthorized`, `realMediaVerified`, `sourceRightsVerified`, `clipsExtracted`, `narrationSyncVerified`, `rendered` and `productionEligible` false. A later separately authorized probe needs current scoped byte access and use rights, a reviewed pinned executable and dependencies, matching current host-policy qualification, one authorized descriptor, a fixed reviewed argument list and strict protocol denial, bounded output, and independent result validation with redaction. Even a positive fixture result has no media or production authority.

## Exact new file inventory

Every path below was added by M10-04D. The report's digest is recorded with the other paths in the local verification manifest so the report does not embed its own digest.

| Path | SHA-256 |
| --- | --- |
| `lib/storyline/media-sandbox-runner/contracts.ts` | `500e798b71ed7f16afdc749f079cb54b2a5506bad2352fbb9018d7700ee1a2d4` |
| `lib/storyline/media-sandbox-runner/evidence.ts` | `d89a3851989661492ccd365577b1172c1a2f8ac6aeb8ae81e9932011e2732808` |
| `lib/storyline/media-sandbox-runner/executable.ts` | `0e136dbf1e63f7f43547d01e6a9430e81d4e1ebb36878154b4cdf2cadae97a52` |
| `lib/storyline/media-sandbox-runner/index.ts` | `c834f4a627946bd68c181680889020ecd39243f7835d1f5198e1240ded0b1681` |
| `lib/storyline/media-sandbox-runner/isolation.ts` | `a41fac9a20919d3a8d339083872e967423bf58a528e7d4b6bb3c4e37b378fc47` |
| `lib/storyline/media-sandbox-runner/lifecycle.ts` | `402de55637017238cab9a7ce1e1de4f6a797594b1aab9a48b720967b48e01ae2` |
| `lib/storyline/media-sandbox-runner/qualification-fixture.c` | `4e27c48cae45bb2aea86ba79ddc718f26a9e1c50adcbe98eb85a02a3b3b26e43` |
| `lib/storyline/media-sandbox-runner/runner.ts` | `0456aea6553f6d1dfbe1d8faf1232619051f4fc11e6e7424ac9e7ef31da3501c` |
| `tests/storyline/media-sandbox-runner/production-audit.mjs` | `686942295e7ba3a579cf41eb8dcf8830b55e78692535c94d7f360a7a1303b843` |
| `tests/storyline/media-sandbox-runner/qualify.ts` | `e001149d4efbbd13adf215f33156d0b85e455abdf9755875e7cdf15c55c08b7a` |
| `tests/storyline/media-sandbox-runner/runner.test.ts` | `64d09b4372954d290fe22e7ba5be9ca1d86868ef07c442eb3bd6420dae7222c7` |
| `docs/STORYLINE_M10_04D_LINUX_SANDBOX_RUNNER.md` | See local acceptance manifest |
