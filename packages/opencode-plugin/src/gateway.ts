/**
 * gateway.bitplan.dev protocol pieces: the wallet-signed bearer token and the
 * x402 (protocol version 2) payment: PAYMENT-REQUIRED on the 402,
 * PAYMENT-SIGNATURE on the retry, scheme `exact` on BSV with the signed raw
 * transaction as the payload. `mintGatewayToken` and `payChallenge` are the same
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

/** The CAIP-2 id the gateway uses for BSV (bip122, genesis block hash). */
export const BSV_NETWORK = 'bip122:000000000019d6689c085ae165831e93'

/** One entry of an x402 PaymentRequired `accepts` list, as the gateway sends it. */
export interface PaymentRequirements {
	scheme: string
	network: string
	/** satoshis */
	amount: string
	asset: string
	payTo: string
	maxTimeoutSeconds: number
	extra: {
		challengeId: string
		lockingScript: string
		expiresAt?: string
		payUrl?: string
	}
}

/** What the plugin needs from a 402: the requirements it will pay and, for identified callers, `fund`. */
export interface PaymentRequired {
	x402Version: number
	resource?: { url?: string; description?: string; mimeType?: string }
	accepted: PaymentRequirements
	error?: { type?: string; message?: string }
	fund?: { paymail?: string; note?: string }
}

/** Satoshis the requirements ask for. */
export function amountSats(required: PaymentRequired): number {
	return Number(required.accepted.amount)
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

/** Pay the accepted requirements from the wallet and return the PAYMENT-SIGNATURE header value. */
export async function payChallenge(
	wallet: WalletInterface,
	required: PaymentRequired,
): Promise<string> {
	const { accepted } = required
	const sats = amountSats(required)
	const action = await wallet.createAction({
		description: `gateway.bitplan.dev credits: ${formatBsv(sats)}`,
		outputs: [
			{
				lockingScript: accepted.extra.lockingScript,
				satoshis: sats,
				outputDescription: 'gateway.bitplan.dev credits',
			},
		],
		options: { randomizeOutputs: false },
	})
	if (!action.tx)
		throw new GatewayError('The wallet did not return the transaction.')
	const tx = Transaction.fromAtomicBEEF(action.tx)
	const payload = JSON.stringify({
		x402Version: 2,
		...(required.resource ? { resource: required.resource } : {}),
		accepted,
		payload: { transaction: Utils.toBase64(tx.toBinary()) },
	})
	return Utils.toBase64(Utils.toArray(payload, 'utf8'))
}

function requirementsOf(value: unknown): PaymentRequirements | null {
	if (!value || typeof value !== 'object') return null
	const a = value as Record<string, unknown>
	const extra = a.extra as Record<string, unknown> | undefined
	if (
		a.scheme !== 'exact' ||
		a.network !== BSV_NETWORK ||
		typeof a.amount !== 'string' ||
		!/^[1-9]\d*$/.test(a.amount) ||
		typeof a.payTo !== 'string' ||
		typeof extra?.challengeId !== 'string' ||
		typeof extra?.lockingScript !== 'string'
	) {
		return null
	}
	return {
		scheme: 'exact',
		network: BSV_NETWORK,
		amount: a.amount,
		asset: typeof a.asset === 'string' ? a.asset : 'BSV',
		payTo: a.payTo,
		maxTimeoutSeconds:
			typeof a.maxTimeoutSeconds === 'number' ? a.maxTimeoutSeconds : 0,
		extra: {
			challengeId: extra.challengeId,
			lockingScript: extra.lockingScript,
			...(typeof extra.expiresAt === 'string'
				? { expiresAt: extra.expiresAt }
				: {}),
			...(typeof extra.payUrl === 'string' ? { payUrl: extra.payUrl } : {}),
		},
	}
}

/**
 * Validate an x402 PaymentRequired (from the PAYMENT-REQUIRED header or the
 * 402 body). Returns null when it offers no exact-on-BSV requirements.
 * `fund` comes from the body when one is given.
 */
export function parsePaymentRequired(
	required: unknown,
	body?: unknown,
): PaymentRequired | null {
	if (!required || typeof required !== 'object') return null
	const r = required as Record<string, unknown>
	if (r.x402Version !== 2 || !Array.isArray(r.accepts)) return null
	const accepted = r.accepts.map(requirementsOf).find((a) => a !== null)
	if (!accepted) return null
	const b = (body ?? required) as Record<string, unknown>
	return {
		x402Version: 2,
		...(r.resource && typeof r.resource === 'object'
			? { resource: r.resource as PaymentRequired['resource'] }
			: {}),
		accepted,
		error: b.error as PaymentRequired['error'],
		fund: b.fund as PaymentRequired['fund'],
	}
}
