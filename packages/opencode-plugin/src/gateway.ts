/**
 * gateway.bitplan.dev protocol pieces: the wallet-signed bearer token and the
 * bsv-tx-v1 payment proof. `mintGatewayToken` and `payChallenge` are the same
 * code as packages/cli/src/commands/gateway.ts (the `bitplan gateway` command);
 * the CLI package ships only a bin, so they are extracted here rather than
 * imported. Keep the two copies identical.
 */

import { Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { GatewayError } from './errors.js'

export const DEFAULT_GATEWAY_URL = 'https://gateway.bitplan.dev'

/** Session tokens are accepted for 24 hours from their timestamp. */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const TOKEN_PROTOCOL: [1, string] = [1, 'bitcoin auth']

export interface Challenge {
	version: 'bsv-tx-v1'
	challenge_id: string
	amount_sats: number
	payee_locking_script_hex: string
	payee_address: string
	expires_at: string
}

/** The 402 body the gateway sends; `fund` is present for identified callers. */
export interface PaymentRequired {
	error?: { type?: string; message?: string }
	challenge: Challenge
	fund?: { paymail?: string; note?: string }
}

/** Require TLS except for the local wallet/development loopback endpoints. */
export function assertSecureHttpUrl(url: URL, label: string): void {
	if (url.protocol === 'https:') return
	if (url.protocol !== 'http:') {
		throw new GatewayError(
			`Invalid ${label} URL ${JSON.stringify(url.toString())}: expected https.`,
		)
	}
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return
	throw new GatewayError(
		`Refusing cleartext http ${label} URL for ${JSON.stringify(url.host)}: use https, or http only for localhost development.`,
	)
}

export function gatewayOrigin(override?: string): string {
	const raw = override ?? DEFAULT_GATEWAY_URL
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		throw new GatewayError(`Invalid gateway URL: ${JSON.stringify(raw)}`)
	}
	assertSecureHttpUrl(url, 'gateway')
	return url.origin
}

/**
 * A bitcoin-auth session token in the brc100 scheme:
 * `pubkey|brc100|timestamp|<origin>/v1|signature`. The wallet signs
 * `<origin>/v1|<timestamp>|` with protocol [1, "bitcoin auth"], key id =
 * timestamp, counterparty "anyone"; the gateway verifies with the same
 * derivation. Valid for 24 hours on every /v1 route.
 */
export async function mintGatewayToken(
	wallet: WalletInterface,
	key: string,
	origin: string,
): Promise<string> {
	const requestPath = `${origin}/v1`
	const timestamp = new Date().toISOString()
	const message = Utils.toArray(`${requestPath}|${timestamp}|`, 'utf8')
	const { signature } = await wallet.createSignature({
		data: message,
		protocolID: TOKEN_PROTOCOL,
		keyID: timestamp,
		counterparty: 'anyone',
	})
	return `${key.toLowerCase()}|brc100|${timestamp}|${requestPath}|${Utils.toBase64(signature)}`
}

export interface TokenInfo {
	identityKey: string
	/** Epoch milliseconds the token was signed at. */
	issuedAt: number
	/** Epoch milliseconds the gateway stops accepting it. */
	expiresAt: number
	requestPath: string
}

/**
 * Read the public parts of a session token. Returns null for anything that is
 * not a five-part brc100 token with a parseable timestamp, so a pasted value
 * that is not a gateway token is treated as expired rather than trusted.
 */
export function parseToken(token: string): TokenInfo | null {
	const parts = token.split('|')
	if (parts.length !== 5) return null
	const [identityKey, scheme, timestamp, requestPath] = parts
	if (scheme !== 'brc100' || !identityKey || !timestamp || !requestPath)
		return null
	const issuedAt = Date.parse(timestamp)
	if (!Number.isFinite(issuedAt)) return null
	return {
		identityKey,
		issuedAt,
		expiresAt: issuedAt + TOKEN_TTL_MS,
		requestPath,
	}
}

export function formatBsv(sats: number): string {
	const bsv = sats / 1e8
	const digits = bsv >= 1 ? 2 : bsv >= 0.01 ? 4 : 6
	return `${bsv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })} BSV`
}

/** Pay a challenge from the wallet and return the X402-Proof header value. */
export async function payChallenge(
	wallet: WalletInterface,
	challenge: Challenge,
): Promise<string> {
	const action = await wallet.createAction({
		description: `gateway.bitplan.dev credits: ${formatBsv(challenge.amount_sats)}`,
		outputs: [
			{
				lockingScript: challenge.payee_locking_script_hex,
				satoshis: challenge.amount_sats,
				outputDescription: 'gateway.bitplan.dev credits',
			},
		],
		options: { randomizeOutputs: false },
	})
	if (!action.tx)
		throw new GatewayError('The wallet did not return the transaction.')
	const tx = Transaction.fromAtomicBEEF(action.tx)
	const proof = JSON.stringify({
		version: 'bsv-tx-v1',
		challenge_id: challenge.challenge_id,
		rawtx_base64: Utils.toBase64(tx.toBinary()),
		txid: tx.id('hex'),
	})
	return Utils.toBase64(Utils.toArray(proof, 'utf8'))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '')
}

/** Validate a 402 body. Returns null when it is not a bsv-tx-v1 challenge. */
export function parsePaymentRequired(body: unknown): PaymentRequired | null {
	if (!body || typeof body !== 'object') return null
	const challenge = (body as { challenge?: unknown }).challenge
	if (!challenge || typeof challenge !== 'object') return null
	const c = challenge as Record<string, unknown>
	if (
		c.version !== 'bsv-tx-v1' ||
		typeof c.challenge_id !== 'string' ||
		typeof c.amount_sats !== 'number' ||
		!Number.isSafeInteger(c.amount_sats) ||
		c.amount_sats <= 0 ||
		typeof c.payee_locking_script_hex !== 'string' ||
		typeof c.payee_address !== 'string' ||
		typeof c.expires_at !== 'string'
	) {
		return null
	}
	const record = body as PaymentRequired
	return {
		error: record.error,
		challenge: {
			version: 'bsv-tx-v1',
			challenge_id: c.challenge_id,
			amount_sats: c.amount_sats,
			payee_locking_script_hex: c.payee_locking_script_hex,
			payee_address: c.payee_address,
			expires_at: c.expires_at,
		},
		fund: record.fund,
	}
}
