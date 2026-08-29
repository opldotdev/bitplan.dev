/**
 * ORDFS reader.
 *
 * The 1sat content gateway (https://api.1sat.app) resolves an origin outpoint
 * to the current tip of its transfer chain, which is exactly what
 * reinscription-as-versioning needs: `GET /content/<origin>:-1` walks forward
 * to the newest envelope and reports where it landed in `X-Outpoint` /
 * `X-Ord-Seq`.
 *
 * Sequence values (see the ORDFS docs):
 *   (none) raw content at that outpoint, no crawl
 *   -2     origin only (backward crawl)
 *   -1     latest state (forward crawl to the tip)
 *   N      the Nth state in the chain
 *
 * This is a read path only. Nothing here can produce a key or a signature.
 */

import { DEFAULT_ORDFS_URL } from './constants.js'
import { CliError } from './errors.js'
import { toOrdinalOutpoint } from './outpoint.js'
import { readConfig } from './state.js'
import { errorMessage } from './wallet.js'

export interface OrdfsContent {
	bytes: Uint8Array
	contentType: string
	/** Outpoint the content was actually served from. */
	outpoint: string | null
	origin: string | null
	/** Position in the transfer chain, when ORDFS reports one. */
	sequence: number | null
}

export function resolveOrdfsUrl(override?: string): string {
	if (override) return override.replace(/\/+$/, '')
	const configured = readConfig().ordfsUrl
	if (configured) return configured.replace(/\/+$/, '')
	return DEFAULT_ORDFS_URL
}

/**
 * Fetch the newest inscription in an origin chain.
 *
 * `seq` defaults to -1 (latest). Pass a specific number to pin a version.
 */
export async function fetchLatest(
	origin: string,
	options: { baseUrl?: string; seq?: number } = {},
): Promise<OrdfsContent> {
	const base = resolveOrdfsUrl(options.baseUrl)
	const pointer = toOrdinalOutpoint(origin)
	const seq = options.seq ?? -1
	const url = `${base}/content/${pointer}:${seq}`

	let response: Response
	try {
		response = await fetch(url)
	} catch (error) {
		throw new CliError(
			`Could not reach ORDFS at ${base}: ${errorMessage(error)}`,
		)
	}

	if (response.status === 404) {
		throw new CliError(
			`ORDFS has no inscription for ${pointer}. If you published it moments ago, give the indexer a minute.`,
		)
	}
	if (!response.ok) {
		throw new CliError(
			`ORDFS returned ${response.status} ${response.statusText} for ${pointer}.`,
		)
	}

	const buffer = await response.arrayBuffer()
	const sequenceHeader = response.headers.get('x-ord-seq')
	const parsedSequence = sequenceHeader
		? Number.parseInt(sequenceHeader, 10)
		: Number.NaN

	return {
		bytes: new Uint8Array(buffer),
		contentType:
			response.headers.get('content-type') ?? 'application/octet-stream',
		outpoint: response.headers.get('x-outpoint'),
		origin: response.headers.get('x-origin'),
		sequence: Number.isFinite(parsedSequence) ? parsedSequence : null,
	}
}

/**
 * Accept either a bare origin outpoint or a bitplan viewer URL and return the
 * origin. `https://bitplan.dev/d/<origin>` is what `upload` prints, so it is
 * what a user is most likely to paste back in.
 */
export function originFromReference(reference: string): string {
	const trimmed = reference.trim()
	if (!trimmed) throw new CliError('No draft reference given.')

	if (/^https?:\/\//i.test(trimmed)) {
		let url: URL
		try {
			url = new URL(trimmed)
		} catch {
			throw new CliError(`Not a usable draft reference: ${reference}`)
		}
		const last = url.pathname.split('/').filter(Boolean).at(-1)
		if (!last) {
			throw new CliError(`No outpoint in that URL: ${reference}`)
		}
		return normalizeOrigin(decodeURIComponent(last), reference)
	}

	return normalizeOrigin(trimmed, reference)
}

function normalizeOrigin(value: string, reference: string): string {
	try {
		return toOrdinalOutpoint(value)
	} catch {
		throw new CliError(
			`Not an outpoint: ${reference}. Expected txid_vout (or a https://bitplan.dev/d/... URL).`,
		)
	}
}
