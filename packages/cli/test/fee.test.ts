import { describe, expect, test } from 'bun:test'
import {
	estimatePayloadCostAtNetworkFloor,
	estimatePayloadCostAtNetworkFloorForPayloads,
	estimatePayloadCostAtNetworkFloorForPayloadsOrNull,
	estimatePayloadCostAtNetworkFloorOrNull,
	fetchArcadeMiningFee,
} from '../src/fee.js'

const POLICY = {
	policy: { miningFee: { satoshis: 100, bytes: 1000 } },
}

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}

describe('Arcade mining fee policy', () => {
	test('fetches an injected policy without using live network access', async () => {
		const requests: Array<{ input: string; init?: RequestInit }> = []
		const policy = await fetchArcadeMiningFee({
			endpoint: 'https://arcade.test/policy',
			fetcher: async (input, init) => {
				requests.push({ input: String(input), init })
				return response(POLICY)
			},
		})

		expect(policy).toEqual({ satoshis: 100, bytes: 1000 })
		expect(requests[0]?.input).toBe('https://arcade.test/policy')
		expect(requests[0]?.init?.headers).toEqual({ accept: 'application/json' })
		expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal)
	})

	test('returns null for missing or invalid policy values', async () => {
		const invalidBodies: unknown[] = [
			{},
			{ policy: {} },
			{ policy: { miningFee: {} } },
			{ policy: { miningFee: { satoshis: -1, bytes: 1000 } } },
			{ policy: { miningFee: { satoshis: 1.5, bytes: 1000 } } },
			{ policy: { miningFee: { satoshis: 1, bytes: 0 } } },
			{ policy: { miningFee: { satoshis: 1, bytes: -100 } } },
			{ policy: { miningFee: { satoshis: 1, bytes: 1000.5 } } },
			{
				policy: {
					miningFee: { satoshis: Number.MAX_SAFE_INTEGER + 1, bytes: 1000 },
				},
			},
		]

		for (const body of invalidBodies) {
			const policy = await fetchArcadeMiningFee({
				fetcher: async () => response(body),
			})
			expect(policy).toBeNull()
		}
	})

	test('accepts a zero-satoshi rate', async () => {
		const policy = await fetchArcadeMiningFee({
			fetcher: async () =>
				response({
					policy: { miningFee: { satoshis: 0, bytes: 1000 } },
				}),
		})

		expect(policy).toEqual({ satoshis: 0, bytes: 1000 })
		expect(
			estimatePayloadCostAtNetworkFloor(
				12_345,
				policy as { satoshis: number; bytes: number },
			),
		).toBe(0)
	})

	test('returns null when the policy endpoint is unavailable', async () => {
		const policy = await fetchArcadeMiningFee({
			fetcher: async () => response({ error: 'down' }, 503),
		})

		expect(policy).toBeNull()
	})

	test('returns null when the bounded request times out', async () => {
		const policy = await fetchArcadeMiningFee({
			timeoutMs: 5,
			fetcher: () => new Promise<Response>(() => {}),
		})

		expect(policy).toBeNull()
	})

	test('returns null when the response body stalls', async () => {
		const policy = await fetchArcadeMiningFee({
			timeoutMs: 5,
			fetcher: async () =>
				({
					ok: true,
					json: async () => new Promise<unknown>(() => {}),
				}) as Response,
		})

		expect(policy).toBeNull()
	})
})

describe('payload network floor arithmetic', () => {
	test('uses the returned ratio and rounds up', () => {
		const fee = { satoshis: 7, bytes: 13 }

		expect(estimatePayloadCostAtNetworkFloor(13, fee)).toBe(7)
		expect(estimatePayloadCostAtNetworkFloor(14, fee)).toBe(8)
		expect(
			estimatePayloadCostAtNetworkFloor(1, { satoshis: 100, bytes: 1000 }),
		).toBe(1)
	})

	test('sums independently rounded costs for multiple envelopes', () => {
		const fee = { satoshis: 1, bytes: 10 }

		expect(estimatePayloadCostAtNetworkFloorForPayloads([1, 1], fee)).toBe(2)
	})

	test('returns null when a valid policy would overflow the display estimate', () => {
		expect(
			estimatePayloadCostAtNetworkFloorOrNull(100, {
				satoshis: Number.MAX_SAFE_INTEGER,
				bytes: 1,
			}),
		).toBeNull()
		expect(
			estimatePayloadCostAtNetworkFloorForPayloadsOrNull([100, 100], {
				satoshis: 1,
				bytes: 1,
			}),
		).toBe(200)
	})
})
