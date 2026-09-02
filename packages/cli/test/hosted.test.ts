import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { HOSTED_API_URL } from '../src/constants.js'
import {
	appendHostedVersion,
	createHostedDraft,
	HOSTED_ID,
	hostedAuthHeader,
	hostedContentUrl,
	hostedViewerUrl,
	isHostedId,
	newHostedSecret,
} from '../src/hosted.js'
import { fetchLatest, originFromReference } from '../src/ordfs.js'

const HOSTED = `h_${'A'.repeat(20)}`
const SECRET = 'ab'.repeat(32)
const SITE = 'https://bitplan.dev'
const ENVELOPE = Uint8Array.of(1, 2, 3)
const CHAIN_ORIGIN = `${'c'.repeat(64)}_0`

afterEach(() => {
	spyOn(globalThis, 'fetch').mockRestore()
})

describe('isHostedId', () => {
	test('accepts h_ plus 20 url-safe characters', () => {
		expect(isHostedId(HOSTED)).toBe(true)
		expect(isHostedId('h_abcdefghijklmnopqrst')).toBe(true)
		expect(isHostedId('h_abc-xyz_0123456789AB')).toBe(true)
		expect(HOSTED_ID.test(HOSTED)).toBe(true)
	})

	test('rejects chain outpoints and malformed ids', () => {
		expect(isHostedId(`${'a'.repeat(64)}_0`)).toBe(false)
		expect(isHostedId(`h_${'A'.repeat(19)}`)).toBe(false)
		expect(isHostedId(`h_${'A'.repeat(21)}`)).toBe(false)
		expect(isHostedId('hosted-draft')).toBe(false)
		expect(isHostedId('')).toBe(false)
	})
})

describe('hosted secret and urls', () => {
	test('mints 32 random bytes as 64 hex', () => {
		const secret = newHostedSecret()
		expect(secret).toMatch(/^[0-9a-f]{64}$/)
		expect(newHostedSecret()).not.toBe(secret)
	})

	test('auth header is Bearer base64url of the 32-byte secret', () => {
		const header = hostedAuthHeader(SECRET)
		expect(header.startsWith('Bearer ')).toBe(true)
		const token = header.slice('Bearer '.length)
		expect(Buffer.from(token, 'base64url').toString('hex')).toBe(SECRET)
	})

	test('viewer and content urls follow the hosted contract', () => {
		expect(hostedViewerUrl(HOSTED)).toBe(`https://bitplan.dev/d/${HOSTED}`)
		expect(hostedContentUrl(SITE, HOSTED, -1)).toBe(
			`${SITE}/ordfs/content/${HOSTED}:-1`,
		)
		expect(hostedContentUrl(`${SITE}/`, HOSTED, 0)).toBe(
			`${SITE}/ordfs/content/${HOSTED}:0`,
		)
	})
})

describe('hosted HTTP', () => {
	test('creates a draft with envelope bytes and the auth header', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					id: HOSTED,
					version: 1,
					viewer: hostedViewerUrl(HOSTED),
				}),
				{ status: 201, headers: { 'content-type': 'application/json' } },
			),
		)

		await expect(createHostedDraft(SITE, SECRET, ENVELOPE)).resolves.toEqual({
			id: HOSTED,
			version: 1,
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0] ?? []
		expect(url).toBe(HOSTED_API_URL)
		expect(init?.method).toBe('POST')
		expect(headerValue(init, 'content-type')).toBe('application/x-bitplan')
		expect(headerValue(init, 'authorization')).toBe(hostedAuthHeader(SECRET))
		expect(Buffer.from(init?.body as Uint8Array)).toEqual(Buffer.from(ENVELOPE))
	})

	test('appends a version with X-Bitplan-Base-Version', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					id: HOSTED,
					version: 2,
					viewer: hostedViewerUrl(HOSTED),
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			),
		)

		await expect(
			appendHostedVersion(SITE, HOSTED, SECRET, ENVELOPE, 1),
		).resolves.toEqual({ version: 2 })

		const [url, init] = fetchMock.mock.calls[0] ?? []
		expect(url).toBe(`${HOSTED_API_URL}/${HOSTED}`)
		expect(init?.method).toBe('POST')
		expect(headerValue(init, 'X-Bitplan-Base-Version')).toBe('1')
		expect(headerValue(init, 'authorization')).toBe(hostedAuthHeader(SECRET))
	})

	test('409 version-conflict tells the user to fetch, merge, and publish again', async () => {
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					error: 'version-conflict',
					current: 4,
					message: 'base version is stale',
				}),
				{ status: 409, headers: { 'content-type': 'application/json' } },
			),
		)

		await expect(
			appendHostedVersion(SITE, HOSTED, SECRET, ENVELOPE, 3),
		).rejects.toThrow(
			'Another publish updated this hosted draft (now version 4). Fetch it, merge, and publish again.',
		)
	})
})

describe('hosted fetchLatest', () => {
	test('maps a 410 to the chain origin', async () => {
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ origin: CHAIN_ORIGIN }), {
				status: 410,
				headers: { 'content-type': 'application/json' },
			}),
		)

		await expect(fetchLatest(HOSTED, { siteUrl: SITE })).rejects.toThrow(
			`This hosted draft is on the chain now at ${CHAIN_ORIGIN}. Use that origin.`,
		)
	})

	test('originFromReference accepts hosted ids and viewer urls', () => {
		expect(originFromReference(HOSTED)).toBe(HOSTED)
		expect(originFromReference(`https://bitplan.dev/d/${HOSTED}`)).toBe(HOSTED)
		expect(originFromReference(`https://bitplan.dev/d/${HOSTED}#k=abc`)).toBe(
			HOSTED,
		)
	})
})

function headerValue(
	init: RequestInit | undefined,
	name: string,
): string | null {
	const headers = init?.headers
	if (!headers) return null
	if (headers instanceof Headers) return headers.get(name)
	if (Array.isArray(headers)) {
		const match = headers.find(
			([key]) => key.toLowerCase() === name.toLowerCase(),
		)
		return match?.[1] ?? null
	}
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name.toLowerCase()) return String(value)
	}
	return null
}
