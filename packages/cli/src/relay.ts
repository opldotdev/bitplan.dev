import { Buffer } from 'node:buffer'
import { Transaction } from '@bsv/sdk'
import { DEFAULT_RELAY_URL } from './constants.js'
import { CliError } from './errors.js'

interface RelayResponse {
	txid?: unknown
	txStatus?: unknown
}

export interface RelayResult {
	state: 'accepted' | 'pending'
	txStatus: string
}

const TX_STATUSES = new Set([
	'UNKNOWN',
	'RECEIVED',
	'SENT_TO_NETWORK',
	'ACCEPTED_BY_NETWORK',
	'SEEN_ON_NETWORK',
	'SEEN_MULTIPLE_NODES',
	'PENDING_RETRY',
	'STUMP_PROCESSING',
	'REJECTED',
	'DOUBLE_SPEND_ATTEMPTED',
	'MINED',
	'IMMUTABLE',
])

/** Send wallet-returned Atomic BEEF through 1Sat's ORDFS/Arcade path. */
export async function relayBeef(
	beef: Uint8Array,
	expectedTxid: string,
): Promise<RelayResult> {
	let beefTxid: string
	try {
		beefTxid = Transaction.fromAtomicBEEF(beef).id('hex')
	} catch (error) {
		throw new CliError(
			`The wallet returned invalid Atomic BEEF: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
	if (beefTxid.toLowerCase() !== expectedTxid.toLowerCase()) {
		throw new CliError(
			`The wallet's Atomic BEEF contains txid ${beefTxid}, expected ${expectedTxid}.`,
		)
	}

	let response: Response
	try {
		response = await fetch(DEFAULT_RELAY_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body: Buffer.from(beef),
			signal: AbortSignal.timeout(45_000),
		})
	} catch (error) {
		throw new CliError(
			`1Sat relay request failed: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	const text = await response.text()
	if (response.status !== 200 && response.status !== 202) {
		throw new CliError(
			`1Sat relay returned HTTP ${response.status}${text ? `: ${text}` : ''}`,
		)
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new CliError('1Sat relay returned invalid JSON.')
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new CliError('1Sat relay returned an invalid response.')
	}
	const result = parsed as RelayResponse
	if (typeof result.txid !== 'string') {
		throw new CliError('1Sat relay response did not include a txid.')
	}
	if (result.txid.toLowerCase() !== expectedTxid.toLowerCase()) {
		throw new CliError(
			`1Sat relay returned txid ${result.txid}, expected ${expectedTxid}.`,
		)
	}
	if (
		typeof result.txStatus !== 'string' ||
		!TX_STATUSES.has(result.txStatus)
	) {
		throw new CliError('1Sat relay returned an unknown transaction status.')
	}
	if (['REJECTED', 'DOUBLE_SPEND_ATTEMPTED'].includes(result.txStatus)) {
		throw new CliError(`1Sat relay reported ${result.txStatus}.`)
	}

	return {
		state: response.status === 200 ? 'accepted' : 'pending',
		txStatus: result.txStatus,
	}
}
