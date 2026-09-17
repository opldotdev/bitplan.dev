/**
 * The `fetch` handed to the AI SDK for this provider. It authenticates every
 * request with the current wallet-signed token, asks the gateway to charge
 * only what the call needs, and settles a 402 in-line: pay the challenge from
 * the wallet, then repeat the identical request once with the proof.
 */

import { Utils, type WalletInterface } from '@bsv/sdk'
import { errorMessage, GatewayError } from './errors.js'
import {
	amountSats,
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

/**
 * The x402 PaymentRequired of a 402: the PAYMENT-REQUIRED header (base64
 * JSON) when present, else the same object in the body. The body also
 * carries `fund` for identified callers, so it is read either way.
 */
async function readPaymentRequired(
	response: Response,
): Promise<PaymentRequired | null> {
	let body: unknown
	try {
		body = await response.json()
	} catch {
		body = undefined
	}
	const header = response.headers.get('payment-required')
	if (header) {
		try {
			const required: unknown = JSON.parse(
				Utils.toUTF8(Utils.toArray(header, 'base64')),
			)
			const parsed = parsePaymentRequired(required, body)
			if (parsed) return parsed
		} catch {
			// fall through to the body
		}
	}
	return parsePaymentRequired(body)
}

function fundingHint(required: PaymentRequired): string {
	const paymail = required.fund?.paymail
	const need = amountSats(required).toLocaleString('en-US')
	const ways = [
		'add BSV to the wallet and the plugin pays from it',
		paymail
			? `send at least ${need} sats to the account's paymail ${paymail} from any BSV wallet (HandCash, Yours, RelayX, ...)`
			: undefined,
		'buy credits by card at https://gateway.bitplan.dev signed in with the same key',
	].filter((w): w is string => w !== undefined)
	return ` Nothing was charged and billing is not a dead end: tell the person to ${ways.join(', or ')}, then send the same request again unchanged. Do not pick a cheaper model or shrink the request instead.`
}

/** Satoshis the wallet said it was short by, when its error says so. */
function shortBySats(error: unknown): number | undefined {
	const message = errorMessage(error)
	const match = /(\d[\d,]*) more satoshis/.exec(message)
	if (!match?.[1]) return undefined
	const n = Number(match[1].replace(/,/g, ''))
	return Number.isFinite(n) ? n : undefined
}

function walletRefusal(error: unknown, amountSats: number): string {
	const need = formatBsv(amountSats)
	const short = shortBySats(error)
	if (short !== undefined) {
		return `This call needs a ${need} reserve (${amountSats.toLocaleString('en-US')} sats, unused reserve comes back as credits) and the wallet is short by about ${short.toLocaleString('en-US')} sats.`
	}
	// Keep the wallet's first sentence only; the raw call dump helps nobody.
	const first = errorMessage(error).split(/[.\n]/)[0]?.trim() ?? ''
	return `The wallet declined to pay the ${need} reserve (${amountSats.toLocaleString('en-US')} sats)${first ? `: ${first}` : ''}.`
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
				'The gateway answered 402 without x402 requirements the plugin can pay (exact on BSV); nothing was paid.',
			)
		}
		if (!isReplayable(body)) {
			throw new GatewayError(
				`The gateway asks for ${formatBsv(amountSats(required))} but this request body cannot be sent twice; nothing was paid.${fundingHint(required)}`,
			)
		}

		const { accepted } = required
		log('info', 'Paying a gateway challenge from the wallet.', {
			challengeId: accepted.extra.challengeId,
			amountSats: amountSats(required),
			payee: accepted.payTo,
		})
		let signature: string
		try {
			const wallet = await options.wallet()
			signature = await payChallenge(wallet, required)
		} catch (error) {
			throw new GatewayError(
				`${walletRefusal(error, amountSats(required))}${fundingHint(required)}`,
			)
		}

		const retryHeaders = new Headers(headers)
		retryHeaders.set('payment-signature', signature)
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
				`The gateway still answered 402 after the payment for challenge ${accepted.extra.challengeId} was sent${again ? ` (it now asks for ${formatBsv(amountSats(again))})` : ''}. Check GET /v1/account/usage before paying again.`,
			)
		}
		return second
	}
}
