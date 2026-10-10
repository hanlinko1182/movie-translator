// Invoked only by execution.test.ts to simulate an abrupt worker process death.
import { runSupervised } from "@/lib/video-render/runner";
const directory = process.argv[2];
let announced = false;
void runSupervised({ cwd: directory, fontConfig: `${directory}/fonts.conf`, outputLimit: 1048576,
  signal: new AbortController().signal, durationMs: 10000,
  args: ["-nostdin", "-re", "-f", "lavfi", "-i", "color=s=640x360:d=10", "-progress", "pipe:1", "-f", "null", "-"],
  progress() { if (!announced) { announced = true; process.stdout.write("ENCODING\n"); } },
}).catch(() => { process.exitCode = 1; });
