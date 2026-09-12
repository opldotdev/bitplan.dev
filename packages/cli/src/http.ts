import { CliError } from './errors.js'

const LENGTH = /^\d+$/

export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>

/** Require TLS except for the local wallet/development loopback endpoints. */
export function assertSecureHttpUrl(url: URL, label: string): void {
	if (url.protocol === 'https:') return
	if (url.protocol !== 'http:') {
		throw new CliError(
			`Invalid ${label} URL ${JSON.stringify(url.toString())}: expected https.`,
		)
	}
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return
	throw new CliError(
		`Refusing cleartext http ${label} URL for ${JSON.stringify(url.host)}: use https, or http only for localhost development.`,
	)
}

/** Preserve a caller cancellation signal while enforcing a finite deadline. */
export function withTimeoutSignal(
	timeoutMs: number,
	signal?: AbortSignal | null,
): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs)
	return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** Stream a response into a bounded buffer, including chunked/decompressed data. */
export async function readBoundedResponseBody(
	response: Response,
	maxBytes: number,
	label: string,
): Promise<Uint8Array> {
	if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
		throw new RangeError('maxBytes must be a positive safe integer.')
	}
	const contentLength = response.headers.get('content-length')
	const claimed =
		contentLength && LENGTH.test(contentLength) ? Number(contentLength) : null
	if (claimed !== null && claimed > maxBytes) {
		await response.body?.cancel().catch(() => undefined)
		throw new CliError(`${label} exceeds the ${maxBytes}-byte limit.`)
	}
	if (!response.body) return new Uint8Array()

	const reader = response.body.getReader()
	let bytes = new Uint8Array(claimed ?? Math.min(64 * 1024, maxBytes))
	let total = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			if (!value) continue
			const nextTotal = total + value.byteLength
			if (nextTotal > maxBytes) {
				await reader.cancel().catch(() => undefined)
				throw new CliError(`${label} exceeds the ${maxBytes}-byte limit.`)
			}
			if (nextTotal > bytes.byteLength) {
				const capacity = Math.min(
					maxBytes,
					Math.max(nextTotal, Math.max(1, bytes.byteLength * 2)),
				)
				const grown = new Uint8Array(capacity)
				grown.set(bytes.subarray(0, total))
				bytes = grown
			}
			bytes.set(value, total)
			total = nextTotal
		}
	} finally {
		reader.releaseLock()
	}
	return bytes.subarray(0, total)
}

/** Decode a bounded response as UTF-8 without calling the unbounded text/json helpers. */
export async function readBoundedResponseText(
	response: Response,
	maxBytes: number,
	label: string,
): Promise<string> {
	return new TextDecoder().decode(
		await readBoundedResponseBody(response, maxBytes, label),
	)
}

/** Adapt a third-party fetch transport to a bounded, timed response. */
export async function fetchBoundedResponse(
	input: string | URL | Request,
	init: RequestInit | undefined,
	options: { label: string; maxBytes: number; timeoutMs: number },
	fetchImpl: FetchLike = globalThis.fetch,
): Promise<Response> {
	const response = await fetchImpl(input, {
		...init,
		redirect: 'error',
		signal: withTimeoutSignal(options.timeoutMs, init?.signal),
	})
	const bytes = await readBoundedResponseBody(
		response,
		options.maxBytes,
		options.label,
	)
	return new Response(Uint8Array.from(bytes).buffer, {
		headers: response.headers,
		status: response.status,
		statusText: response.statusText,
	})
}
