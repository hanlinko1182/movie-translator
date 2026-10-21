/** Enumerated metadata-only child. No fixture bootstrap, storage or process adapter. */
import { createMaintenanceAuthenticationForTest, type Session } from "../../../lib/storyline/maintenance-fake/auth";
import { createMaintenanceGatewayForTest, type Connections, type Keys } from "../../../lib/storyline/maintenance-fake/database";
import { createMaintenanceServiceForTest } from "../../../lib/storyline/maintenance-fake/service";
import type { Context, Envelope } from "../../../lib/storyline/maintenance-fake/contracts";
type Setup = { connections: Connections; keys: Keys; sessions: Session[]; context: Context; input: Envelope; revision: number;
  phase: "submit-before-commit" | "submit-after-commit" | "qualify-after-commit" };
process.once("message", async (setup: Setup) => {
  try {
    const auth = createMaintenanceAuthenticationForTest(setup.sessions);
    const barrier = async () => { process.send?.({ event: "barrier", phase: setup.phase, id: setup.input.body.decisionId }); await new Promise<void>(() => {}); };
    const gateway = createMaintenanceGatewayForTest({ mode: "M806_PHASE1A_DISPOSABLE_ONLY", connections: setup.connections, keys: setup.keys, authentication: auth.authentication,
      hooks: setup.phase === "submit-before-commit" ? { beforeCommit: barrier } : { afterCommit: barrier } });
    const api = createMaintenanceServiceForTest({ mode: "M806_PHASE1A_DISPOSABLE_ONLY", context: setup.context, gateway });
    const s = setup.sessions.find(v => v.principalId === "editor")!;
    const r = new Request(`${s.origin}/isolated-maintenance`, { method: "POST", headers: { cookie: `maintenance_m806_session=${s.token}`,
      origin: s.origin, "sec-fetch-site": "same-origin", "x-maintenance-csrf": s.csrf } });
    if (setup.phase.startsWith("submit")) await api.submit(r, setup.input);
    else await api.qualify(r, String(setup.input.body.rootId), String(setup.input.body.decisionId), setup.revision);
    process.send?.({ event: "unexpected-completion" }); process.exitCode = 1; process.disconnect();
  } catch (error) { process.send?.({ event: "error", code: String((error as { code?: string }).code ?? "CHILD_FAILED") }); process.exitCode = 1; process.disconnect(); }
});
