import { describe, expect, test } from 'bun:test'
import { GatewayError } from '../src/errors.js'
import { createGatewayFetch } from '../src/fetch.js'
import {
	CHALLENGE,
	createStubFetch,
	createStubWallet,
	decodeProof,
	json,
	ORIGIN,
	paymentRequired,
} from './stubs.js'

const URL_CHAT = `${ORIGIN}/v1/chat/completions`
const BODY = JSON.stringify({
	model: 'anthropic/claude-opus-4.8',
	messages: [{ role: 'user', content: 'hi' }],
	max_tokens: 400,
})

function build(
	responses: Array<() => Response>,
	options: { failPaymentWith?: string; tokens?: string[] } = {},
) {
	const stub = createStubWallet({ failPaymentWith: options.failPaymentWith })
	const net = createStubFetch(responses)
	const tokens = options.tokens ?? ['tok-1']
	let walletConnects = 0
	const gatewayFetch = createGatewayFetch({
		token: async () => tokens.shift() ?? 'tok-last',
		wallet: async () => {
			walletConnects += 1
			return stub.wallet
		},
		fetch: net.fetch,
	})
	return {
		gatewayFetch,
		stub,
		net,
		walletConnects: () => walletConnects,
	}
}

function post(body: string, headers: Record<string, string> = {}) {
	return {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer sdk-placeholder',
			'x-api-key': 'sdk-placeholder',
			...headers,
		},
		body,
	}
}

describe('gateway fetch', () => {
	test('sends the current token and the exact-deposit header and never opens the wallet on success', async () => {
		const h = build([json(200, { id: 'chatcmpl-1' })])
		const res = await h.gatewayFetch(URL_CHAT, post(BODY))
		expect(res.status).toBe(200)
		expect(h.net.requests).toHaveLength(1)
		const sent = h.net.requests[0]
		expect(sent?.headers.get('authorization')).toBe('Bearer tok-1')
		expect(sent?.headers.get('x-gateway-deposit')).toBe('exact')
		expect(sent?.headers.get('x-api-key')).toBeNull()
		expect(sent?.headers.get('content-type')).toBe('application/json')
		expect(sent?.body).toBe(BODY)
		expect(h.walletConnects()).toBe(0)
		expect(h.stub.calls.createAction).toHaveLength(0)
	})

	test('asks the token source on every request so a refreshed token is used', async () => {
		const h = build([json(200, {}), json(200, {})], {
			tokens: ['tok-old', 'tok-new'],
		})
		await h.gatewayFetch(URL_CHAT, post(BODY))
		await h.gatewayFetch(URL_CHAT, post(BODY))
		expect(h.net.requests.map((r) => r.headers.get('authorization'))).toEqual([
			'Bearer tok-old',
			'Bearer tok-new',
		])
	})

	test('pays a 402 from the wallet and retries the identical request once with X402-Proof', async () => {
		const h = build([paymentRequired(), json(200, { id: 'chatcmpl-2' })])
		const res = await h.gatewayFetch(URL_CHAT, post(BODY))
		expect(res.status).toBe(200)
		expect(await res.json()).toEqual({ id: 'chatcmpl-2' })

		expect(h.walletConnects()).toBe(1)
		expect(h.stub.calls.createAction).toHaveLength(1)
		expect(h.stub.calls.createAction[0]?.outputs[0]).toMatchObject({
			lockingScript: CHALLENGE.payee_locking_script_hex,
			satoshis: CHALLENGE.amount_sats,
		})

		expect(h.net.requests).toHaveLength(2)
		const [first, second] = h.net.requests
		expect(first?.headers.has('x402-proof')).toBe(false)
		expect(second?.url).toBe(first?.url)
		expect(second?.method).toBe('POST')
		expect(second?.body).toBe(BODY)
		expect(second?.headers.get('authorization')).toBe('Bearer tok-1')
		expect(second?.headers.get('x-gateway-deposit')).toBe('exact')
		const proof = decodeProof(second?.headers.get('x402-proof') ?? '')
		expect(proof.version).toBe('bsv-tx-v1')
		expect(proof.challenge_id).toBe(CHALLENGE.challenge_id)
		expect(proof.txid).toBe(h.stub.txid())
	})

	test('retries only once: a second 402 is an error, not a second payment', async () => {
		const h = build([paymentRequired(), paymentRequired(), json(200, {})])
		await expect(h.gatewayFetch(URL_CHAT, post(BODY))).rejects.toThrow(
			/still answered 402 after the payment for challenge/,
		)
		expect(h.stub.calls.createAction).toHaveLength(1)
		expect(h.net.requests).toHaveLength(2)
	})

	test('surfaces a wallet refusal with the amount and the paymail alternative', async () => {
		const h = build(
			[paymentRequired({ fund: { paymail: 'me@gateway.bitplan.dev' } })],
			{ failPaymentWith: 'Insufficient funds: 1200 sats available' },
		)
		let error: unknown
		try {
			await h.gatewayFetch(URL_CHAT, post(BODY))
		} catch (e) {
			error = e
		}
		expect(error).toBeInstanceOf(GatewayError)
		const message = (error as Error).message
		expect(message).toContain('2,000 sats')
		expect(message).toContain('Insufficient funds')
		expect(message).toContain('me@gateway.bitplan.dev')
		expect(message).not.toContain('tok-1')
		expect(h.net.requests).toHaveLength(1)
	})

	test('does not pay a 402 that carries no bsv-tx-v1 challenge', async () => {
		const h = build([json(402, { error: { message: 'nope' } })])
		await expect(h.gatewayFetch(URL_CHAT, post(BODY))).rejects.toThrow(
			/without a bsv-tx-v1 challenge/,
		)
		expect(h.stub.calls.createAction).toHaveLength(0)
	})

	test('passes other statuses through untouched', async () => {
		const h = build([json(401, { error: { type: 'unauthorized' } })])
		const res = await h.gatewayFetch(URL_CHAT, post(BODY))
		expect(res.status).toBe(401)
		expect(h.stub.calls.createAction).toHaveLength(0)
	})
})
