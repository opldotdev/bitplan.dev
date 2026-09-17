import {
	PrivateKey,
	ProtoWallet,
	Script,
	Transaction,
	type WalletInterface,
} from '@bsv/sdk'
import type { FetchLike } from '../src/fetch.js'
import { mintGatewayToken } from '../src/gateway.js'

export const ORIGIN = 'https://gateway.test'

export const CHALLENGE = {
	version: 'bsv-tx-v1' as const,
	challenge_id: '2f6b7c1e-0000-4000-8000-000000000001',
	amount_sats: 2000,
	payee_locking_script_hex:
		'76a914000000000000000000000000000000000000000088ac',
	payee_address: '1111111111111111111114oLvT2',
	expires_at: '2099-01-01T00:00:00.000Z',
}

export interface StubWalletCalls {
	createAction: Array<{
		outputs: Array<{
			lockingScript: string
			satoshis: number
			outputDescription?: string
		}>
		description: string
	}>
}

/**
 * A wallet that signs with a real key (so tokens verify) and "pays" by
 * returning a one-output transaction as Atomic BEEF, which is what a BRC-100
 * wallet's createAction returns. It never touches a network.
 */
export function createStubWallet(options: { failPaymentWith?: string } = {}): {
	wallet: WalletInterface
	identityKey: string
	calls: StubWalletCalls
	txid: () => string
} {
	const key = PrivateKey.fromRandom()
	const proto = new ProtoWallet(key)
	const calls: StubWalletCalls = { createAction: [] }
	let lastTxid = ''
	const wallet = {
		getVersion: async () => ({ version: 'stub-1.0.0' }),
		getPublicKey: async (args: { identityKey?: boolean }) => {
			if (args.identityKey) return { publicKey: key.toPublicKey().toString() }
			return proto.getPublicKey(args as never)
		},
		createSignature: (args: unknown) => proto.createSignature(args as never),
		createAction: async (args: {
			description: string
			outputs: Array<{
				lockingScript: string
				satoshis: number
				outputDescription?: string
			}>
		}) => {
			calls.createAction.push({
				outputs: args.outputs,
				description: args.description,
			})
			if (options.failPaymentWith) throw new Error(options.failPaymentWith)
			const tx = new Transaction()
			for (const out of args.outputs) {
				tx.addOutput({
					lockingScript: Script.fromHex(out.lockingScript),
					satoshis: out.satoshis,
				})
			}
			lastTxid = tx.id('hex')
			return { txid: lastTxid, tx: tx.toAtomicBEEF() }
		},
	} as unknown as WalletInterface
	return {
		wallet,
		identityKey: key.toPublicKey().toString(),
		calls,
		txid: () => lastTxid,
	}
}

export async function freshToken(wallet: {
	wallet: WalletInterface
	identityKey: string
}): Promise<string> {
	return mintGatewayToken(wallet.wallet, wallet.identityKey, ORIGIN)
}

/** A token whose timestamp is `ageMs` in the past. */
export function agedToken(identityKey: string, ageMs: number): string {
	const timestamp = new Date(Date.now() - ageMs).toISOString()
	return `${identityKey}|brc100|${timestamp}|${ORIGIN}/v1|c2ln`
}

export interface RecordedRequest {
	url: string
	method: string
	headers: Headers
	body: string | undefined
}

/** A fetch that answers from a queue and records what it was sent. */
export function createStubFetch(responses: Array<() => Response>): {
	fetch: FetchLike
	requests: RecordedRequest[]
} {
	const requests: RecordedRequest[] = []
	const queue = [...responses]
	const fetch: FetchLike = async (input, init) => {
		const url =
			input instanceof Request
				? input.url
				: input instanceof URL
					? input.href
					: input
		requests.push({
			url,
			method: init?.method ?? 'GET',
			headers: new Headers(init?.headers),
			body:
				typeof init?.body === 'string'
					? init.body
					: init?.body instanceof ArrayBuffer
						? new TextDecoder().decode(init.body)
						: undefined,
		})
		const next = queue.shift()
		if (!next) throw new Error('stub fetch: no response queued')
		return next()
	}
	return { fetch, requests }
}

export function json(status: number, body: unknown): () => Response {
	return () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' },
		})
}

/** The x402 v2 requirements the gateway derives from CHALLENGE. */
export const REQUIREMENTS = {
	scheme: 'exact',
	network: 'bip122:000000000019d6689c085ae165831e93',
	amount: String(CHALLENGE.amount_sats),
	asset: 'BSV',
	payTo: CHALLENGE.payee_address,
	maxTimeoutSeconds: 899,
	extra: {
		challengeId: CHALLENGE.challenge_id,
		lockingScript: CHALLENGE.payee_locking_script_hex,
		expiresAt: CHALLENGE.expires_at,
		payUrl: `${ORIGIN}/v1/chat/completions`,
	},
}

export const PAYMENT_REQUIRED = {
	x402Version: 2,
	error: 'PAYMENT-SIGNATURE header is required',
	resource: {
		url: `${ORIGIN}/v1/chat/completions`,
		description: 'POST /v1/chat/completions',
		mimeType: 'application/json',
	},
	accepts: [REQUIREMENTS],
}

/**
 * A 402 as the gateway sends it: the PaymentRequired base64 in the
 * PAYMENT-REQUIRED header, and repeated in the body with the legacy
 * `challenge` and any `extra` (such as `fund`).
 */
export function paymentRequired(
	extra: Record<string, unknown> = {},
	options: { header?: boolean } = {},
): () => Response {
	const { error: _e, ...fields } = PAYMENT_REQUIRED
	const body = {
		error: { type: 'payment_required', message: 'Pay 2000 sats.' },
		...fields,
		challenge: CHALLENGE,
		...extra,
	}
	return () =>
		new Response(JSON.stringify(body), {
			status: 402,
			headers: {
				'content-type': 'application/json',
				...(options.header === false
					? {}
					: {
							'payment-required': Buffer.from(
								JSON.stringify(PAYMENT_REQUIRED),
							).toString('base64'),
						}),
			},
		})
}

/** Decodes a PAYMENT-SIGNATURE header value (base64 JSON PaymentPayload). */
export function decodePayload(header: string): {
	x402Version: number
	accepted: typeof REQUIREMENTS
	payload: { transaction: string }
} {
	return JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
}
