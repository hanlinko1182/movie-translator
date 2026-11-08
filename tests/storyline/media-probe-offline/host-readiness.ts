// Read-only Linux interface observations. No process, namespace or policy changes.
import { lstat, open } from "node:fs/promises";
import { assessSandboxReadiness, MEDIA_PROBE, type LinuxHintState } from "../../../lib/storyline/media-probe-offline";

async function readHint(path: string): Promise<string | null> {
  try {
    const file = await open(path, "r");
    try {
      const buffer = Buffer.alloc(8193);
      let count = 0;
      while (count < buffer.length) {
        const { bytesRead } = await file.read(buffer, count, buffer.length - count, null);
        if (!bytesRead) return buffer.toString("utf8", 0, count);
        count += bytesRead;
      }
      return null;
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}

async function namespaceHint(name: "user" | "mnt" | "net" | "pid"): Promise<LinuxHintState> {
  try {
    return (await lstat(`/proc/self/ns/${name}`)).isSymbolicLink() ? "VISIBLE" : "UNKNOWN";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "ABSENT_OR_DISABLED" : "UNKNOWN";
  }
}

async function main() {
  const linux = process.platform === "linux";
  const uid = process.geteuid?.();
  const [user, mount, network, pid, maxUsers, clonePolicy, status, controllers] = linux
    ? await Promise.all([namespaceHint("user"), namespaceHint("mnt"), namespaceHint("net"), namespaceHint("pid"),
      readHint("/proc/sys/user/max_user_namespaces"), readHint("/proc/sys/kernel/unprivileged_userns_clone"),
      readHint("/proc/self/status"), readHint("/sys/fs/cgroup/cgroup.controllers")])
    : ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", null, null, null, null] as const;
  const namespacePolicy = maxUsers?.trim() === "0" || clonePolicy?.trim() === "0"
    ? "ABSENT_OR_DISABLED"
    : user === "VISIBLE" && /^[1-9]\d*$/.test(maxUsers?.trim() ?? "") && clonePolicy?.trim() === "1" ? "VISIBLE" : "UNKNOWN";
  const controller = (name: string) => controllers === null ? "UNKNOWN" :
    controllers.trim().split(/\s+/).includes(name) ? "VISIBLE" : "ABSENT_OR_DISABLED";
  const report = assessSandboxReadiness({
    schemaVersion: MEDIA_PROBE.hostHints,
    platform: linux ? "LINUX" : "OTHER",
    identity: uid === undefined ? "UNKNOWN" : uid === 0 ? "ROOT" : "NON_ROOT",
    interfaces: {
      userNamespace: user, mountNamespace: mount, networkNamespace: network, pidNamespace: pid,
      unprivilegedUserNamespacePolicy: namespacePolicy,
      seccompInterface: /^Seccomp:\s*[012]\s*$/m.test(status ?? "") ? "VISIBLE" : "UNKNOWN",
      cgroupCpu: controller("cpu"), cgroupMemory: controller("memory"), cgroupPids: controller("pids"),
    },
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main().catch(() => {
  process.stderr.write("OFFLINE_HOST_HINT_COLLECTION_FAILED\n");
  process.exitCode = 1;
});
