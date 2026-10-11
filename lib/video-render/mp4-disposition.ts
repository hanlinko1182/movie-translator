import "server-only";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { RenderError } from "./contracts";

// FFmpeg MOV's enable_tracks() enables the first subtitle even with disposition
// 0. Clear ONLY tkhd's enabled bit on the single generated subtitle in the
// private attempt file, before hashing/publication. No box sizes/offsets change.
// QuickTime may hide a disabled track; desktop-player qualification is required.
export async function disableGeneratedSubtitle(path: string, signal?: AbortSignal) {
  const file = await open(path, constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error();
    let boxes = 0;
    const read = async (position: number, size: number) => {
      if (signal?.aborted) throw new Error();
      const bytes = Buffer.alloc(size);
      if ((await file.read(bytes, 0, size, position)).bytesRead !== size) throw new Error();
      return bytes;
    };
    const children = async (start: number, end: number) => {
      const result: { type: string; start: number; end: number }[] = [];
      for (let offset = start; offset < end;) {
        if (++boxes > 10_000 || end - offset < 8) throw new Error();
        const header = await read(offset, 8); const size32 = header.readUInt32BE(); let size = size32; let prefix = 8;
        if (size32 === 1) { const large = (await read(offset + 8, 8)).readBigUInt64BE(); if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(); size = Number(large); prefix = 16; }
        if (size32 === 0) size = end - offset;
        if (size < prefix || offset + size > end) throw new Error();
        result.push({ type: header.toString("ascii", 4, 8), start: offset + prefix, end: offset + size }); offset += size;
      }
      return result;
    };
    const moovs = (await children(0, stat.size)).filter((box) => box.type === "moov");
    if (moovs.length !== 1 || moovs[0].end - moovs[0].start > 128 * 1024 ** 2) throw new Error();
    let subtitles = 0;
    for (const track of (await children(moovs[0].start, moovs[0].end)).filter((box) => box.type === "trak")) {
      const parts = await children(track.start, track.end);
      const mdia = parts.find((box) => box.type === "mdia"); const tkhd = parts.find((box) => box.type === "tkhd");
      if (!mdia || !tkhd) throw new Error();
      const handler = (await children(mdia.start, mdia.end)).find((box) => box.type === "hdlr");
      if (!handler || handler.end - handler.start < 12) throw new Error();
      if (!["sbtl", "text"].includes((await read(handler.start + 8, 4)).toString("ascii"))) continue;
      if (++subtitles > 1 || tkhd.end - tkhd.start < 4) throw new Error();
      const flags = await read(tkhd.start, 4);
      if (flags[0] !== 0 && flags[0] !== 1) throw new Error();
      flags[3] &= ~1;
      if ((await file.write(flags, 0, flags.length, tkhd.start)).bytesWritten !== flags.length) throw new Error();
    }
    if (subtitles !== 1) throw new Error();
    await file.sync();
  } catch { throw new RenderError("OUTPUT_INVALID"); }
  finally { await file.close(); }
}
