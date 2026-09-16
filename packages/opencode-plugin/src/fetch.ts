/**
 * The `fetch` handed to the AI SDK for this provider. It authenticates every
 * request with the current wallet-signed token, asks the gateway to charge
 * only what the call needs, and settles a 402 in-line: pay the challenge from
 * the wallet, then repeat the identical request once with the proof.
 */

import type { WalletInterface } from '@bsv/sdk'
import { errorMessage, GatewayError } from './errors.js'
import {
	formatBsv,
	type PaymentRequired,
	parsePaymentRequired,
	payChallenge,
} from './gateway.js'
import type { Log } from './session.js'

export type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>

export interface GatewayFetchOptions {
	/** The bearer to send; refreshed by the caller when due. */
	token: () => Promise<string>
	/** Connect the wallet that pays a challenge. Called only on a 402. */
	wallet: () => Promise<WalletInterface>
	fetch?: FetchLike
	log?: Log
}

function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
	const headers = new Headers(
		input instanceof Request ? input.headers : undefined,
	)
	if (init?.headers) {
		for (const [key, value] of new Headers(init.headers))
			headers.set(key, value)
	}
	return headers
}

function isReplayable(body: BodyInit | null | undefined): boolean {
	if (body === undefined || body === null) return true
	if (typeof body === 'string') return true
	if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true
	if (body instanceof URLSearchParams || body instanceof Blob) return true
	if (body instanceof FormData) return true
	return false
}

async function readPaymentRequired(
	response: Response,
): Promise<PaymentRequired | null> {
	let body: unknown
	try {
		body = await response.json()
	} catch {
		return null
	}
	return parsePaymentRequired(body)
}

function fundingHint(required: PaymentRequired): string {
	const paymail = required.fund?.paymail
	return paymail
		? ` You can also send BSV to ${paymail} from any paymail wallet and retry.`
		: ''
}

export function createGatewayFetch(options: GatewayFetchOptions): FetchLike {
	const send = options.fetch ?? fetch
	const log = options.log ?? (() => undefined)

	return async (input, init) => {
		const headers = mergeHeaders(input, init)
		headers.set('authorization', `Bearer ${await options.token()}`)
		headers.set('x-gateway-deposit', 'exact')
		headers.delete('x-api-key')

		// The AI SDK sends JSON strings; a streamed body could not be sent twice.
		const body =
			init?.body ??
			(input instanceof Request ? await input.clone().arrayBuffer() : undefined)
		const request = input instanceof Request ? input.url : input
		const first = await send(request, {
			...init,
			method:
				init?.method ?? (input instanceof Request ? input.method : undefined),
			body,
			headers,
		})
		if (first.status !== 402) return first

		const required = await readPaymentRequired(first)
		if (!required) {
			throw new GatewayError(
				'The gateway answered 402 without a bsv-tx-v1 challenge; nothing was paid.',
			)
		}
		if (!isReplayable(body)) {
			throw new GatewayError(
				`The gateway asks for ${formatBsv(required.challenge.amount_sats)} but this request body cannot be sent twice; nothing was paid.${fundingHint(required)}`,
			)
		}

		const { challenge } = required
		log('info', 'Paying a gateway challenge from the wallet.', {
			challengeId: challenge.challenge_id,
			amountSats: challenge.amount_sats,
			payee: challenge.payee_address,
		})
		let proof: string
		try {
			const wallet = await options.wallet()
			proof = await payChallenge(wallet, challenge)
		} catch (error) {
			throw new GatewayError(
				`The wallet did not pay the gateway's ${formatBsv(challenge.amount_sats)} (${challenge.amount_sats.toLocaleString('en-US')} sats) challenge: ${errorMessage(error)}${fundingHint(required)}`,
			)
		}

		const retryHeaders = new Headers(headers)
		retryHeaders.set('x402-proof', proof)
		const second = await send(request, {
			...init,
			method:
				init?.method ?? (input instanceof Request ? input.method : undefined),
			body,
			headers: retryHeaders,
		})
		if (second.status === 402) {
			const again = await readPaymentRequired(second.clone())
			throw new GatewayError(
				`The gateway still answered 402 after the payment for challenge ${challenge.challenge_id} was sent${again ? ` (it now asks for ${formatBsv(again.challenge.amount_sats)})` : ''}. Check GET /v1/account/usage before paying again.`,
			)
		}
		return second
	}
}
