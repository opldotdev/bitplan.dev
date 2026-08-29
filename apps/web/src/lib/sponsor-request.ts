import { MAX_SPONSOR_BEEF_BYTES } from "@/lib/sponsor-receipt";

export class RequestBodyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readAtomicBeef(request: Request): Promise<Uint8Array> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !==
    "application/octet-stream"
  ) {
    throw new RequestBodyError(415, "Expected application/octet-stream.");
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_SPONSOR_BEEF_BYTES
  ) {
    throw new RequestBodyError(413, "Atomic BEEF exceeds 1 MiB.");
  }
  if (!request.body) {
    throw new RequestBodyError(400, "Atomic BEEF body is required.");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const value of request.body) {
    length += value.length;
    if (length > MAX_SPONSOR_BEEF_BYTES) {
      throw new RequestBodyError(413, "Atomic BEEF exceeds 1 MiB.");
    }
    chunks.push(value);
  }
  if (length === 0) {
    throw new RequestBodyError(400, "Atomic BEEF body is required.");
  }

  const beef = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    beef.set(chunk, offset);
    offset += chunk.length;
  }
  return beef;
}
