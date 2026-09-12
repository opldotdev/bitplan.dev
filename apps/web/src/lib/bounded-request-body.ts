const DIGITS = /^\d+$/;

/** Read a request body without buffering more than the accepted byte limit. */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number
): Promise<Uint8Array | null> {
  const claimed = parseLength(request.headers.get("content-length"));
  if (claimed !== null && claimed > maxBytes) {
    return null;
  }
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const bytes = new Uint8Array(claimed ?? maxBytes);
  let total = 0;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential reads enforce the bound
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      const nextTotal = total + value.byteLength;
      if (nextTotal > maxBytes || (claimed !== null && nextTotal > claimed)) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      bytes.set(value, total);
      total = nextTotal;
    }
  } finally {
    reader.releaseLock();
  }

  return bytes.subarray(0, total);
}

function parseLength(value: string | null): number | null {
  if (!(value && DIGITS.test(value))) {
    return null;
  }
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}
