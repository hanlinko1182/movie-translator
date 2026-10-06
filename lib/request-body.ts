// Shared byte limits apply even when Content-Length is absent or dishonest.
export class BodyLimitError extends Error {
  constructor() { super("Request body exceeds the supported limit"); this.name = "BodyLimitError"; }
}
export function boundedRequest(request: Request, maxBytes: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new BodyLimitError();
  if (!request.body) return request;
  let bytes = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > maxBytes) throw new BodyLimitError(); controller.enqueue(chunk); },
  }));
  return new Request(request.url, { method: request.method, headers: request.headers, body, duplex: "half" } as RequestInit);
}
export async function boundedJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  return boundedRequest(request, maxBytes).json();
}
