import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, realpath, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { formatAss } from "@/lib/subtitle-export/ass";
import { RenderError } from "./contracts";
import { runSupervised } from "./runner";

const execute = promisify(execFile);
const xml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export function assertShapingEvidence(stderr: string) {
  if (!/Shaper:.*HarfBuzz/i.test(stderr) || !/fontselect:.*NotoSansMyanmar/i.test(stderr) || /Glyph .*not found|failed to find.*font|Error opening|fontselect: failed/i.test(stderr)) throw new RenderError("MYANMAR_FONT_UNAVAILABLE");
}
export async function prepareMyanmarFont(directory: string, text: string, signal: AbortSignal) {
  try {
    const { stdout } = await execute("fc-match", ["-f", "%{family}\n%{file}\n", "Noto Sans Myanmar"], { timeout: 5000, maxBuffer: 65536 });
    const [family, file] = stdout.trim().split("\n");
    if (family !== "Noto Sans Myanmar" || !file || !(await lstat(file)).isFile() || await realpath(file) !== file) throw new Error();
    const { stdout: charset } = await execute("fc-query", ["--format", "%{charset}", file], { timeout: 5000, maxBuffer: 65536 });
    const ranges = charset.trim().split(/\s+/).map((range) => range.split("-").map((v) => parseInt(v, 16)));
    for (const character of text) {
      const point = character.codePointAt(0)!;
      if ((point >= 0x1000 && point <= 0x109f || point >= 0xa9e0 && point <= 0xa9ff || point >= 0xaa60 && point <= 0xaa7f) &&
        !ranges.some(([start, end = start]) => point >= start && point <= end)) throw new Error();
    }
    // ASS bytes remain exact, including its generic family. Only the child-local
    // fontconfig maps that family to the verified installed Myanmar face.
    const config = join(directory, "fonts.conf");
    await writeFile(config, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${xml(dirname(file))}</dir><cachedir>${xml(join(directory, "font-cache"))}</cachedir><match target="pattern"><test name="family"><string>sans-serif</string></test><edit name="family" mode="assign" binding="strong"><string>${xml(family)}</string></edit></match></fontconfig>`, { flag: "wx", mode: 0o600 });
    const fixture = formatAss([{ sequence: 0, startMs: 0, endMs: 1000, text: "မင်္ဂလာပါ။ မြန်မာစာ စမ်းသပ်မှု" }]);
    await writeFile(join(directory, "font-check.ass"), fixture, { flag: "wx", mode: 0o600 });
    const { stderr } = await runSupervised({ cwd: directory, fontConfig: config, outputLimit: 1024 * 1024,
      durationMs: 1000, signal, timeoutMs: 30_000,
      args: ["-hide_banner", "-nostdin", "-loglevel", "info", "-filter_threads", "1", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=1", "-vf", "ass=font-check.ass:shaping=complex", "-frames:v", "1", "-f", "null", "-"] });
    assertShapingEvidence(stderr);
    return config;
  } catch (error) {
    if (signal.aborted) throw new RenderError("RENDER_FAILED");
    if (error instanceof RenderError && error.code === "RENDER_RESOURCE_LIMIT") throw error;
    throw new RenderError("MYANMAR_FONT_UNAVAILABLE");
  }
}
