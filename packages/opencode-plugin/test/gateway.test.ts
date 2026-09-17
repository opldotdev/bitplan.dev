import { describe, expect, test } from 'bun:test'
import { ProtoWallet, Utils } from '@bsv/sdk'
import {
	gatewayOrigin,
	parsePaymentRequired,
	parseToken,
	payChallenge,
	TOKEN_TTL_MS,
} from '../src/gateway.js'
import {
	CHALLENGE,
	createStubWallet,
	decodePayload,
	freshToken,
	ORIGIN,
	PAYMENT_REQUIRED,
	REQUIREMENTS,
} from './stubs.js'

describe('gateway token', () => {
	test('is the same brc100 token the CLI mints and the gateway verifies with the anyone key', async () => {
		const stub = createStubWallet()
		const token = await freshToken(stub)
		const parts = token.split('|')
		expect(parts).toHaveLength(5)
		expect(parts[0]).toBe(stub.identityKey.toLowerCase())
		expect(parts[1]).toBe('brc100')
		expect(parts[3]).toBe(`${ORIGIN}/v1`)

		const timestamp = parts[2] as string
		const verifier = new ProtoWallet('anyone')
		const { valid } = await verifier.verifySignature({
			data: Utils.toArray(`${ORIGIN}/v1|${timestamp}|`, 'utf8'),
			signature: Utils.toArray(parts[4] as string, 'base64'),
			protocolID: [1, 'bitcoin auth'],
			keyID: timestamp,
			counterparty: stub.identityKey,
		})
		expect(valid).toBe(true)
	})

	test('parseToken reads identity, issue time and the 24 h expiry', async () => {
		const stub = createStubWallet()
		const before = Date.now()
		const info = parseToken(await freshToken(stub))
		expect(info).not.toBeNull()
		expect(info?.identityKey).toBe(stub.identityKey.toLowerCase())
		expect(info?.requestPath).toBe(`${ORIGIN}/v1`)
		expect(info?.issuedAt).toBeGreaterThanOrEqual(before)
		expect((info?.expiresAt ?? 0) - (info?.issuedAt ?? 0)).toBe(TOKEN_TTL_MS)
	})

	test('parseToken rejects pasted values that are not gateway tokens', () => {
		expect(parseToken('sk-not-a-token')).toBeNull()
		expect(parseToken('a|brc77|2026-01-01T00:00:00.000Z|x|y')).toBeNull()
		expect(parseToken('a|brc100|not-a-date|x|y')).toBeNull()
	})
})

describe('gateway origin', () => {
	test('defaults to gateway.bitplan.dev and requires https off loopback', () => {
		expect(gatewayOrigin()).toBe('https://gateway.bitplan.dev')
		expect(gatewayOrigin('http://localhost:3000/v1')).toBe(
			'http://localhost:3000',
		)
		expect(() => gatewayOrigin('http://gateway.example')).toThrow(
			'Refusing cleartext',
		)
		expect(() => gatewayOrigin('nope')).toThrow('Invalid gateway URL')
	})
})

describe('402 challenge', () => {
	test('parsePaymentRequired accepts the x402 PaymentRequired and keeps the funding hint from the body', () => {
		const parsed = parsePaymentRequired(PAYMENT_REQUIRED, {
			error: { type: 'payment_required', message: 'm' },
			fund: { paymail: 'a@bitplan.dev', note: 'n' },
		})
		expect(parsed?.accepted).toEqual(REQUIREMENTS)
		expect(parsed?.resource?.url).toBe(PAYMENT_REQUIRED.resource.url)
		expect(parsed?.fund?.paymail).toBe('a@bitplan.dev')
		// the body alone works too
		expect(
			parsePaymentRequired({
				...PAYMENT_REQUIRED,
				fund: { paymail: 'b@bitplan.dev' },
			})?.fund?.paymail,
		).toBe('b@bitplan.dev')
	})

	test('parsePaymentRequired rejects other versions, schemes and malformed amounts', () => {
		expect(parsePaymentRequired(null)).toBeNull()
		expect(parsePaymentRequired({ error: {} })).toBeNull()
		expect(
			parsePaymentRequired({ ...PAYMENT_REQUIRED, x402Version: 1 }),
		).toBeNull()
		expect(
			parsePaymentRequired({
				...PAYMENT_REQUIRED,
				accepts: [{ ...REQUIREMENTS, scheme: 'upto' }],
			}),
		).toBeNull()
		expect(
			parsePaymentRequired({
				...PAYMENT_REQUIRED,
				accepts: [{ ...REQUIREMENTS, network: 'eip155:8453' }],
			}),
		).toBeNull()
		expect(
			parsePaymentRequired({
				...PAYMENT_REQUIRED,
				accepts: [{ ...REQUIREMENTS, amount: '0' }],
			}),
		).toBeNull()
		expect(
			parsePaymentRequired({
				...PAYMENT_REQUIRED,
				accepts: [{ ...REQUIREMENTS, amount: 5 }],
			}),
		).toBeNull()
	})

	test('payChallenge asks the wallet for exactly the payee output and returns a base64 PaymentPayload', async () => {
		const stub = createStubWallet()
		const required = parsePaymentRequired(PAYMENT_REQUIRED)
		if (!required) throw new Error('unparsed')
		const signature = await payChallenge(stub.wallet, required)
		expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/)
		expect(stub.calls.createAction).toHaveLength(1)
		expect(stub.calls.createAction[0]?.outputs).toEqual([
			{
				lockingScript: CHALLENGE.payee_locking_script_hex,
				satoshis: CHALLENGE.amount_sats,
				outputDescription: 'gateway.bitplan.dev credits',
			},
		])
		const decoded = decodePayload(signature)
		expect(decoded.x402Version).toBe(2)
		expect(decoded.accepted).toEqual(REQUIREMENTS)
		expect(
			Buffer.from(decoded.payload.transaction, 'base64').length,
		).toBeGreaterThan(10)
	})
})
