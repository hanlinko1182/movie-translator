import { qualifyLinuxSandboxHost } from "../../../lib/storyline/media-sandbox-runner";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 2 || args.length > 0 && args[0] !== "--qualify-harmless-linux-host") {
    throw new Error("QUALIFICATION_ARGUMENTS_DENIED");
  }
  const result = await qualifyLinuxSandboxHost(args.length ? { optIn: true, delegation: args[1] } : undefined);
  console.log(JSON.stringify(result));
  if (result.status === "HOST_ENFORCEMENT_BLOCKED") process.exitCode = 2;
}

main().catch(() => {
  console.error("QUALIFICATION_COMMAND_DENIED");
  process.exitCode = 1;
});
