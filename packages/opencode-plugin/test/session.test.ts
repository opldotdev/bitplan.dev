import { describe, expect, test } from 'bun:test'
import type { Auth } from '@opencode-ai/sdk/v2'
import { TOKEN_TTL_MS } from '../src/gateway.js'
import {
	createTokenSource,
	needsRefresh,
	REFRESH_SKEW_MS,
	type StoredToken,
	tokenMetadata,
} from '../src/session.js'
import { agedToken, createStubWallet, freshToken } from './stubs.js'

const HOUR = 60 * 60 * 1000
const ID = '02'.padEnd(66, 'a')

describe('needsRefresh', () => {
	test('is false for a fresh token and true inside the refresh window', () => {
		expect(needsRefresh(agedToken(ID, 0))).toBe(false)
		expect(needsRefresh(agedToken(ID, 12 * HOUR))).toBe(false)
		expect(
			needsRefresh(agedToken(ID, TOKEN_TTL_MS - REFRESH_SKEW_MS - 60_000)),
		).toBe(false)
		expect(
			needsRefresh(agedToken(ID, TOKEN_TTL_MS - REFRESH_SKEW_MS + 1_000)),
		).toBe(true)
		expect(needsRefresh(agedToken(ID, TOKEN_TTL_MS + HOUR))).toBe(true)
	})

	test('treats anything that is not a gateway token as due', () => {
		expect(needsRefresh('pasted-garbage')).toBe(true)
	})
})

function harness(initial: string, mintCount = { n: 0 }) {
	const stub = createStubWallet()
	let stored: Auth | undefined = { type: 'api', key: initial }
	const saved: StoredToken[] = []
	const logs: Array<{ level: string; message: string }> = []
	const source = createTokenSource({
		getAuth: async () => stored,
		saveAuth: async (info) => {
			saved.push(info)
			stored = info
		},
		mint: async () => {
			mintCount.n += 1
			const token = await freshToken(stub)
			return { token, identityKey: stub.identityKey }
		},
		log: (level, message) => logs.push({ level, message }),
	})
	return {
		source,
		saved,
		logs,
		stub,
		setStored: (a: Auth | undefined) => (stored = a),
	}
}

describe('createTokenSource', () => {
	test('hands out the stored token without touching the wallet while it is fresh', async () => {
		const count = { n: 0 }
		const fresh = agedToken(ID, HOUR)
		const h = harness(fresh, count)
		expect(await h.source.current()).toBe(fresh)
		expect(count.n).toBe(0)
		expect(h.saved).toHaveLength(0)
	})

	test('mints once, stores the replacement with its expiry, and serves it to concurrent callers', async () => {
		const count = { n: 0 }
		const h = harness(agedToken(ID, TOKEN_TTL_MS - 5 * 60_000), count)
		const [a, b, c] = await Promise.all([
			h.source.current(),
			h.source.current(),
			h.source.current(),
		])
		expect(count.n).toBe(1)
		expect(a).toBe(b)
		expect(b).toBe(c)
		expect(a.split('|')[0]).toBe(h.stub.identityKey.toLowerCase())
		expect(h.saved).toHaveLength(1)
		expect(h.saved[0]?.type).toBe('api')
		expect(h.saved[0]?.key).toBe(a)
		expect(h.saved[0]?.metadata?.source).toBe('wallet')
		expect(h.saved[0]?.metadata?.identity_key).toBe(h.stub.identityKey)
		expect(Date.parse(h.saved[0]?.metadata?.expires_at ?? '')).toBeGreaterThan(
			Date.now() + 23 * HOUR,
		)
		// The next call reads the stored fresh token and does not mint again.
		expect(await h.source.current()).toBe(a)
		expect(count.n).toBe(1)
	})

	test('keeps using a token that is still valid when the wallet is unavailable', async () => {
		const stillValid = agedToken(ID, TOKEN_TTL_MS - 5 * 60_000)
		const logs: string[] = []
		const source = createTokenSource({
			getAuth: async () => ({ type: 'api', key: stillValid }),
			saveAuth: async () => {
				throw new Error('should not save')
			},
			mint: async () => {
				throw new Error('No BRC-100 wallet answered at http://127.0.0.1:3321.')
			},
			log: (level, message) => logs.push(`${level}: ${message}`),
		})
		expect(await source.current()).toBe(stillValid)
		expect(logs.some((l) => l.startsWith('warn:'))).toBe(true)
	})

	test('fails clearly once the token has expired and the wallet cannot sign', async () => {
		const expired = agedToken(ID, TOKEN_TTL_MS + HOUR)
		const source = createTokenSource({
			getAuth: async () => ({ type: 'api', key: expired }),
			saveAuth: async () => undefined,
			mint: async () => {
				throw new Error('No BRC-100 wallet answered at http://127.0.0.1:3321.')
			},
		})
		await expect(source.current()).rejects.toThrow(
			/expired and the wallet could not sign a new one: No BRC-100 wallet answered/,
		)
	})

	test('fails when the provider is not connected', async () => {
		const source = createTokenSource({
			getAuth: async () => undefined,
			saveAuth: async () => undefined,
			mint: async () => {
				throw new Error('unreachable')
			},
		})
		await expect(source.current()).rejects.toThrow('not connected')
	})
})

describe('tokenMetadata', () => {
	test('records only public facts as strings', async () => {
		const stub = createStubWallet()
		const token = await freshToken(stub)
		const metadata = tokenMetadata(
			{ token, identityKey: stub.identityKey },
			'wallet',
		)
		expect(Object.keys(metadata).sort()).toEqual([
			'expires_at',
			'identity_key',
			'source',
		])
		expect(Object.values(metadata).every((v) => typeof v === 'string')).toBe(
			true,
		)
		expect(JSON.stringify(metadata)).not.toContain(token.split('|')[4])
	})
})
