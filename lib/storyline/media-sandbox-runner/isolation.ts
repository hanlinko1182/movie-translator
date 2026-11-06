import "server-only";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, realpath, rmdir, statfs, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { SANDBOX_POLICY } from "./contracts";
import type { HostBlocker } from "./evidence";

const cgroupMount = "/sys/fs/cgroup";
const cgroup2Magic = 0x63677270;
const control = (path: string) => readFile(path, "utf8").then(value => value.trim());

export function checkMountInfo(mountInfo: string): HostBlocker | undefined {
  const entries = mountInfo.split("\n").map(line => line.split(" "));
  const matches = entries.filter(fields => fields[4] === cgroupMount);
  if (matches.length !== 1) return "CGROUP_V2_UNAVAILABLE";
  const fields = matches[0];
  const separator = fields.indexOf("-");
  if (separator < 6 || fields[separator + 1] !== "cgroup2") return "CGROUP_V2_UNAVAILABLE";
  if (fields[5].split(",").includes("ro") || fields[separator + 3]?.split(",").includes("ro")) {
    return "CGROUP_MOUNT_READ_ONLY";
  }
  if (!fields[5].split(",").includes("rw")) return "CGROUP_V2_UNAVAILABLE";
}

export async function preflight(delegation: string | undefined): Promise<HostBlocker | undefined> {
  if (process.platform !== "linux" || process.arch !== "x64") return "UNSUPPORTED_PLATFORM";
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (!uid || !gid || uid !== process.geteuid?.() || gid !== process.getegid?.()) return "ROOT_EXECUTION_DENIED";

  try {
    const mountBlocker = checkMountInfo(await readFile("/proc/self/mountinfo", "utf8"));
    if (mountBlocker) return mountBlocker;
    if ((await statfs(cgroupMount)).type !== cgroup2Magic) return "CGROUP_V2_UNAVAILABLE";
  } catch {
    return "CGROUP_V2_UNAVAILABLE";
  }
  if (typeof delegation !== "string" || delegation.length > 512 ||
      !/^\/sys\/fs\/cgroup(?:\/[a-zA-Z0-9_@.-]+)+$/.test(delegation) ||
      delegation.split("/").some(part => part === "." || part === "..")) return "DELEGATION_UNAVAILABLE";
  try {
    const group = await lstat(delegation);
    const mount = await lstat(cgroupMount);
    if (await realpath(delegation) !== delegation || !group.isDirectory() || group.uid !== uid ||
        group.dev !== mount.dev || (group.mode & 0o022)) return "DELEGATION_UNAVAILABLE";
    const membership = (await control("/proc/self/cgroup")).split("\n").find(line => line.startsWith("0::"));
    const own = membership && cgroupMount + membership.slice(3);
    if (own !== delegation && !own?.startsWith(delegation + "/")) return "DELEGATION_UNAVAILABLE";
    const controllers = (await control(delegation + "/cgroup.subtree_control")).split(/\s+/);
    if (!["cpu", "memory", "pids"].every(name => controllers.includes(name))) return "DELEGATION_UNAVAILABLE";
    await access(delegation, constants.W_OK | constants.X_OK);
    await access(delegation + "/cgroup.procs", constants.W_OK);
    await access("/usr/bin/cc", constants.X_OK).catch(() => { throw new Error("FIXTURE_COMPILER_UNAVAILABLE"); });
  } catch (error) {
    return error instanceof Error && error.message === "FIXTURE_COMPILER_UNAVAILABLE"
      ? "FIXTURE_COMPILER_UNAVAILABLE" : "DELEGATION_UNAVAILABLE";
  }
}

const limits = Object.freeze({
  "memory.max": String(SANDBOX_POLICY.memoryBytes),
  "memory.swap.max": "0",
  "memory.oom.group": "1",
  "cpu.max": SANDBOX_POLICY.cpuQuotaMicros + " " + SANDBOX_POLICY.cpuPeriodMicros,
  "pids.max": String(SANDBOX_POLICY.pids),
});

export async function reserveCgroup(delegation: string) {
  const path = delegation + "/movie-translator-m10-04d-qualification";
  await mkdir(path, { mode: 0o700 });
  try {
    const original = await lstat(path, { bigint: true });
    const verify = async () => {
      const current = await lstat(path, { bigint: true });
      if (current.ino !== original.ino || current.dev !== original.dev ||
          current.uid !== BigInt(process.getuid!()) || !current.isDirectory() ||
          await realpath(path) !== path) throw new Error("CGROUP_OWNERSHIP_UNPROVEN");
    };
    await verify();
    for (const [name, limit] of Object.entries(limits)) {
      await writeFile(path + "/" + name, limit);
      if (await control(path + "/" + name) !== limit) throw new Error("CGROUP_LIMIT_UNPROVEN");
    }
    if (await control(path + "/cgroup.type") !== "domain" ||
        !/^populated 0$/m.test(await control(path + "/cgroup.events"))) throw new Error("CGROUP_OWNERSHIP_UNPROVEN");
    await writeFile(path + "/cgroup.kill", "1");
    const enroll = await open(path + "/cgroup.procs", constants.O_WRONLY | constants.O_NOFOLLOW);
    return {
      enroll,
      async measure() {
        await verify();
        const [memory, cpu, pids, live, events] = await Promise.all([
          control(path + "/memory.events.local"), control(path + "/cpu.stat"), control(path + "/pids.events"),
          control(path + "/pids.current"), control(path + "/cgroup.events"),
        ]);
        return {
          oomKilled: /^oom_kill [1-9]\d*$/m.test(memory),
          cpuThrottled: /^nr_throttled [1-9]\d*$/m.test(cpu),
          cpuLimitReached: Number(/^usage_usec (\d+)$/m.exec(cpu)?.[1]) >= SANDBOX_POLICY.cpuSeconds * 1_000_000,
          pidLimitHit: /^max [1-9]\d*$/m.test(pids),
          descendantsPresent: /^[2-4]$/.test(live),
          emptyBeforeCleanup: /^populated 0$/m.test(events),
        };
      },
      async killAndRemove(deadline: number) {
        await verify();
        await writeFile(path + "/cgroup.kill", "1");
        do {
          await verify();
          if (/^populated 0$/m.test(await control(path + "/cgroup.events"))) {
            await rmdir(path);
            return true;
          }
          await delay(20);
        } while (performance.now() < deadline);
        return false;
      },
    };
  } catch {
    // Before returning an enrollment descriptor this runner has started no process.
    try {
      await rmdir(path);
    } catch {
      throw new Error("CGROUP_CLEANUP_UNPROVEN");
    }
    throw new Error("CGROUP_CONTROLS_UNAVAILABLE");
  }
}
