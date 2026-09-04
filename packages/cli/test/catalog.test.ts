import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import {
	assertCatalog,
	bestEffortCatalogInscribed,
	bestEffortCatalogSync,
	buildLocalEntries,
	CATALOG_CONTENT_KEY_ID,
	CATALOG_HMAC_KEY_ID,
	CATALOG_MAX_DESCRIPTION_CHARS,
	CATALOG_MAX_TITLE_CHARS,
	CATALOG_PROTOCOL,
	type Catalog,
	type CatalogEntry,
	type CatalogWallet,
	decryptCatalog,
	deriveCatalogLocator,
	deriveCatalogParts,
	encryptCatalog,
	isCatalogId,
	localEntryForRecord,
	markCatalogInscribed,
	mergeCatalogEntries,
	parseCatalogJson,
	serializeCatalog,
	syncCatalog,
	truncateCatalogString,
} from '../src/catalog.js'
import { CATALOG_CONTENT_TYPE } from '../src/constants.js'
import { resolveSiteUrl } from '../src/hosted.js'
import type { DraftsFile } from '../src/state.js'

/**
 * Fixed public derivation vector. The root capability bytes below are a
 * published test input — not a secret — so anyone can recompute the expected
 * catalog id and write bearer with node:crypto alone:
 *
 *   HMAC-SHA256(root, "bitplan catalog locator v1") -> catalog id bytes
 *   HMAC-SHA256(root, "bitplan catalog write v1")   -> write bearer bytes
 */
const VECTOR_ROOT_HEX =
	'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const VECTOR_ID = 'c_yISrnI2sPW-WsJxzEMlblaKd4E7d3N321gU5Vk_BpYY'
const VECTOR_BEARER = 'WTkMgXsUMbhtDGdFtNcocGtOOEkqNO6yeXlDOXNyGHw'

const HOSTED_A = `h_${'A'.repeat(20)}`
const HOSTED_B = `h_${'B'.repeat(20)}`
const HOSTED_C = `h_${'C'.repeat(20)}`
const CHAIN_ORIGIN = `${'c'.repeat(64)}_0`
const SITE = 'https://bitplan.dev'

afterEach(() => {
	spyOn(globalThis, 'fetch').mockRestore()
})

function vectorRoot(): Uint8Array {
	return Uint8Array.from(Buffer.from(VECTOR_ROOT_HEX, 'hex'))
}

interface WalletCalls {
	createHmac: Array<Record<string, unknown>>
	encrypt: Array<Record<string, unknown>>
	decrypt: Array<Record<string, unknown>>
}

/** Identity-transform wallet: ciphertext passes through, calls are recorded. */
function createFakeWallet(
	root: Uint8Array = vectorRoot(),
	refuseHmac = false,
): {
	wallet: CatalogWallet
	calls: WalletCalls
} {
	const calls: WalletCalls = { createHmac: [], encrypt: [], decrypt: [] }
	const wallet = {
		async createHmac(args: Record<string, unknown>) {
			calls.createHmac.push(args)
			if (refuseHmac) throw new Error('permission denied')
			return { hmac: Array.from(root) }
		},
		async encrypt(args: Record<string, unknown>) {
			calls.encrypt.push(args)
			return { ciphertext: args.plaintext as number[] }
		},
		async decrypt(args: Record<string, unknown>) {
			calls.decrypt.push(args)
			return { plaintext: args.ciphertext as number[] }
		},
	} as unknown as CatalogWallet
	return { wallet, calls }
}

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
	return {
		id: HOSTED_A,
		state: 'hosted',
		chainOrigin: null,
		title: 'Plan',
		description: 'A hosted plan',
		repoHost: 'github.com',
		repoOrg: 'acme',
		repoName: 'plans',
		version: 2,
		updatedAt: '2026-09-01T00:00:00.000Z',
		...overrides,
	}
}

function catalogBody(catalog: Catalog, version: number): Response {
	return new Response(Buffer.from(JSON.stringify(catalog), 'utf8'), {
		status: 200,
		headers: {
			'content-type': CATALOG_CONTENT_TYPE,
			'X-BitPlan-Catalog-Version': String(version),
			'X-BitPlan-Catalog-Updated-At': '2026-09-02T00:00:00.000Z',
		},
	})
}

function putResult(version: number, created: boolean): Response {
	return new Response(
		JSON.stringify({
			id: VECTOR_ID,
			version,
			updatedAt: '2026-09-02T00:00:00.000Z',
			created,
		}),
		{
			status: created ? 201 : 200,
			headers: { 'content-type': 'application/json' },
		},
	)
}

interface FetchCall {
	url: string
	method: string
	headers: Record<string, string>
	body: Uint8Array | null
}

function mockFetch(script: Response[]): {
	calls: FetchCall[]
} {
	const calls: FetchCall[] = []
	const responses = [...script]
	spyOn(globalThis, 'fetch').mockImplementation((async (
		input: string | URL | Request,
		init?: RequestInit,
	) => {
		const url = input instanceof Request ? input.url : String(input)
		const method = (
			init?.method ?? (input instanceof Request ? input.method : 'GET')
		).toUpperCase()
		const headers: Record<string, string> = {}
		const rawHeaders = init?.headers
		if (rawHeaders instanceof Headers) {
			for (const [key, value] of rawHeaders) headers[key.toLowerCase()] = value
		} else if (Array.isArray(rawHeaders)) {
			for (const [key, value] of rawHeaders) headers[key.toLowerCase()] = value
		} else if (rawHeaders) {
			for (const [key, value] of Object.entries(rawHeaders)) {
				headers[key.toLowerCase()] = String(value)
			}
		}
		let body: Uint8Array | null = null
		if (init?.body instanceof Uint8Array) body = init.body
		else if (init?.body instanceof ArrayBuffer) body = new Uint8Array(init.body)
		else if (typeof init?.body === 'string') {
			body = new Uint8Array(Buffer.from(init.body, 'utf8'))
		} else if (Buffer.isBuffer(init?.body)) {
			body = new Uint8Array(init.body)
		}
		calls.push({ url, method, headers, body })
		const next = responses.shift()
		if (!next) throw new Error('fetch script exhausted')
		return next
	}) as typeof fetch)
	return { calls }
}

function hostedRecord(overrides: Record<string, unknown> = {}): DraftsFile {
	return {
		files: {
			'/tmp/plan.html': {
				origin: HOSTED_A,
				keyID: 'draft-key',
				latestOutpoint: HOSTED_A,
				latestVersion: 2,
				updatedAt: '2026-09-01T00:00:00.000Z',
				title: 'Local plan',
				description: 'Local description',
				repoHost: 'github.com',
				repoOrg: 'acme',
				repoName: 'plans',
				hostedSecret: 'ab'.repeat(32),
				...overrides,
			},
		},
	}
}

describe('frozen derivation', () => {
	test('fixed public vector pins the locator and bearer bytes', () => {
		const locator = deriveCatalogParts(vectorRoot())
		expect(locator.id).toBe(VECTOR_ID)
		expect(locator.bearer).toBe(VECTOR_BEARER)
		expect(isCatalogId(locator.id)).toBe(true)
		expect(locator.bearer).toMatch(/^[A-Za-z0-9_-]{43}$/)
	})

	test('derivation through the wallet uses exactly the frozen inputs', async () => {
		const { wallet, calls } = createFakeWallet()
		const locator = await deriveCatalogLocator(wallet)

		expect(locator.id).toBe(VECTOR_ID)
		expect(locator.bearer).toBe(VECTOR_BEARER)
		expect(calls.createHmac).toHaveLength(1)
		const args = calls.createHmac[0] as {
			protocolID: unknown
			keyID: string
			counterparty: string
			data: number[]
		}
		expect(args.protocolID).toEqual([2, 'bitplan catalog'])
		expect(args.protocolID).toEqual([...CATALOG_PROTOCOL])
		expect(args.keyID).toBe(CATALOG_HMAC_KEY_ID)
		expect(args.counterparty).toBe('self')
		expect(Buffer.from(args.data).toString('utf8')).toBe(
			'bitplan catalog capability v1',
		)
	})

	test('a different wallet identity derives a different catalog id', async () => {
		const other = Uint8Array.from(
			Array.from({ length: 32 }, (_, index) => 31 - index),
		)
		const { wallet } = createFakeWallet(other)
		const locator = await deriveCatalogLocator(wallet)
		expect(locator.id).not.toBe(VECTOR_ID)
		expect(isCatalogId(locator.id)).toBe(true)
	})

	test('catalog ids are c_ plus 43 url-safe characters', () => {
		expect(isCatalogId(VECTOR_ID)).toBe(true)
		expect(isCatalogId('c_short')).toBe(false)
		expect(isCatalogId(`h_${'A'.repeat(20)}`)).toBe(false)
		expect(isCatalogId('')).toBe(false)
	})

	test('a wallet refusal aborts derivation', async () => {
		const { wallet } = createFakeWallet(vectorRoot(), true)
		await expect(deriveCatalogLocator(wallet)).rejects.toThrow(
			/The wallet refused catalog derivation/,
		)
	})
})

describe('strict catalog schema', () => {
	test('a valid catalog parses', () => {
		const parsed = parseCatalogJson(
			JSON.stringify({ schema: 1, entries: [entry()] }),
		)
		expect(parsed.entries).toHaveLength(1)
	})

	test('unknown top-level and entry keys are rejected', () => {
		expect(() =>
			parseCatalogJson(JSON.stringify({ schema: 1, entries: [], extra: true })),
		).toThrow(/unknown key/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({ schema: 1, entries: [{ ...entry(), secret: 'x' }] }),
			),
		).toThrow(/unknown key/)
	})

	test('duplicate hosted ids are rejected', () => {
		expect(() =>
			parseCatalogJson(
				JSON.stringify({ schema: 1, entries: [entry(), entry()] }),
			),
		).toThrow(/duplicate/)
	})

	test('state and chainOrigin rules are exact', () => {
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), state: 'draft' }],
				}),
			),
		).toThrow(/state/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), chainOrigin: CHAIN_ORIGIN }],
				}),
			),
		).toThrow(/null chainOrigin/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), state: 'inscribed', chainOrigin: null }],
				}),
			),
		).toThrow(/chainOrigin/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [
						{ ...entry(), state: 'inscribed', chainOrigin: 'not-an-outpoint' },
					],
				}),
			),
		).toThrow(/chainOrigin/)
		const inscribed = parseCatalogJson(
			JSON.stringify({
				schema: 1,
				entries: [
					{ ...entry(), state: 'inscribed', chainOrigin: CHAIN_ORIGIN },
				],
			}),
		)
		expect(inscribed.entries[0]?.state).toBe('inscribed')
	})

	test('string limits, version, and timestamp rules hold', () => {
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), title: 'x'.repeat(513) }],
				}),
			),
		).toThrow(/title/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), description: 'x'.repeat(1001) }],
				}),
			),
		).toThrow(/description/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), repoHost: 'x'.repeat(254) }],
				}),
			),
		).toThrow(/repoHost/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), repoOrg: 'x'.repeat(256) }],
				}),
			),
		).toThrow(/repoOrg/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), repoName: 'x'.repeat(256) }],
				}),
			),
		).toThrow(/repoName/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({ schema: 1, entries: [{ ...entry(), version: 0 }] }),
			),
		).toThrow(/version/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), updatedAt: 'not-a-date' }],
				}),
			),
		).toThrow(/updatedAt/)
	})

	test('at most 1000 entries and 512 KiB of plaintext', () => {
		const many = Array.from({ length: 1001 }, (_, index) =>
			entry({ id: `h_${String(index).padStart(20, '0')}` }),
		)
		expect(() =>
			parseCatalogJson(JSON.stringify({ schema: 1, entries: many })),
		).toThrow(/at most 1000/)
		// Each field stays within its own limit, but the plaintext as a whole
		// exceeds 512 KiB.
		const bulky = Array.from({ length: 600 }, (_, index) =>
			entry({
				id: `h_${String(index).padStart(20, '0')}`,
				description: 'x'.repeat(1000),
			}),
		)
		expect(() =>
			parseCatalogJson(JSON.stringify({ schema: 1, entries: bulky })),
		).toThrow(/exceeds/)
	})

	test('serialization sorts entries by hosted id deterministically', () => {
		const first = entry({ id: HOSTED_B })
		const second = entry({ id: HOSTED_A })
		const text = serializeCatalog({ schema: 1, entries: [first, second] })
		const parsed = JSON.parse(text) as Catalog
		expect(parsed.entries.map((item) => item.id)).toEqual([HOSTED_A, HOSTED_B])
		expect(serializeCatalog({ schema: 1, entries: [second, first] })).toBe(text)
	})

	test('assertCatalog rejects a non-object and wrong schema', () => {
		expect(() => assertCatalog(null)).toThrow(/expected an object/)
		expect(() => assertCatalog({ schema: 2, entries: [] })).toThrow(/schema/)
	})
})

describe('wallet encrypt/decrypt path', () => {
	test('round-trips through the frozen content key and self', async () => {
		const { wallet, calls } = createFakeWallet()
		const catalog: Catalog = { schema: 1, entries: [entry()] }

		const ciphertext = await encryptCatalog(wallet, catalog)
		expect(calls.encrypt).toHaveLength(1)
		const encryptArgs = calls.encrypt[0] as {
			protocolID: unknown
			keyID: string
			counterparty: string
			plaintext: number[]
		}
		expect(encryptArgs.protocolID).toEqual([2, 'bitplan catalog'])
		expect(encryptArgs.keyID).toBe(CATALOG_CONTENT_KEY_ID)
		expect(encryptArgs.counterparty).toBe('self')
		expect(Buffer.from(encryptArgs.plaintext).toString('utf8')).toContain(
			HOSTED_A,
		)

		const decrypted = await decryptCatalog(wallet, ciphertext)
		expect(decrypted).toEqual({ schema: 1, entries: [entry()] })
		const decryptArgs = calls.decrypt[0] as {
			protocolID: unknown
			keyID: string
			counterparty: string
		}
		expect(decryptArgs.protocolID).toEqual([2, 'bitplan catalog'])
		expect(decryptArgs.keyID).toBe(CATALOG_CONTENT_KEY_ID)
		expect(decryptArgs.counterparty).toBe('self')
	})
})

describe('local entries', () => {
	test('hosted records map without secrets; chain records are skipped', () => {
		const drafts = hostedRecord()
		const chainRecord = {
			origin: CHAIN_ORIGIN,
			keyID: 'chain-key',
			latestOutpoint: CHAIN_ORIGIN,
			latestVersion: 1,
			updatedAt: '2026-09-01T00:00:00.000Z',
		}
		drafts.files['/tmp/chain.html'] = chainRecord
		const entries = buildLocalEntries(drafts)
		expect(entries).toHaveLength(1)
		const mapped = entries[0] as CatalogEntry
		expect(mapped.id).toBe(HOSTED_A)
		expect(mapped.state).toBe('hosted')
		expect(mapped.title).toBe('Local plan')
		expect(mapped.repoOrg).toBe('acme')
		expect(JSON.stringify(mapped)).not.toContain('hostedSecret')
		expect(JSON.stringify(mapped)).not.toContain('draft-key')
		expect(localEntryForRecord(chainRecord)).toBeNull()
	})

	test('newest local record wins a duplicated hosted id', () => {
		const drafts = hostedRecord()
		drafts.files['/tmp/other.html'] = {
			origin: HOSTED_A,
			keyID: 'other-key',
			latestOutpoint: HOSTED_A,
			latestVersion: 3,
			updatedAt: '2026-09-05T00:00:00.000Z',
			title: 'Newer',
		}
		const entries = buildLocalEntries(drafts)
		expect(entries).toHaveLength(1)
		expect(entries[0]?.title).toBe('Newer')
		expect(entries[0]?.version).toBe(3)
	})

	test('merging keeps remote-only entries and prefers local matches', () => {
		const merged = mergeCatalogEntries(
			[entry({ id: HOSTED_A, title: 'Remote' }), entry({ id: HOSTED_B })],
			[entry({ id: HOSTED_A, title: 'Local' }), entry({ id: HOSTED_C })],
		)
		expect(merged.map((item) => item.id)).toEqual([
			HOSTED_A,
			HOSTED_B,
			HOSTED_C,
		])
		expect(merged.find((item) => item.id === HOSTED_A)?.title).toBe('Local')
	})
})

describe('catalog sync', () => {
	test('only a confirmed 404 means empty: other failures abort with no PUT', async () => {
		const { wallet } = createFakeWallet()
		const { calls } = mockFetch([new Response('boom', { status: 500 })])
		await expect(
			syncCatalog(wallet, { siteUrl: SITE, localEntries: [] }),
		).rejects.toThrow(/Catalog API returned 500/)
		expect(calls).toHaveLength(1)
		expect(calls[0]?.method).toBe('GET')
	})

	test('an undecryptable remote catalog aborts without an empty overwrite', async () => {
		const { wallet } = createFakeWallet()
		const { calls } = mockFetch([
			new Response('not-encrypted-bytes', {
				status: 200,
				headers: {
					'content-type': CATALOG_CONTENT_TYPE,
					'X-BitPlan-Catalog-Version': '3',
				},
			}),
		])
		await expect(
			syncCatalog(wallet, { siteUrl: SITE, localEntries: [] }),
		).rejects.toThrow()
		expect(calls).toHaveLength(1)
	})

	test('a wallet refusal aborts before any network write', async () => {
		const { wallet } = createFakeWallet(vectorRoot(), true)
		const { calls } = mockFetch([])
		await expect(
			syncCatalog(wallet, { siteUrl: SITE, localEntries: [] }),
		).rejects.toThrow(/refused catalog derivation/)
		expect(calls).toHaveLength(0)
	})

	test('confirmed 404 creates with base version 0', async () => {
		const { wallet } = createFakeWallet()
		const local = buildLocalEntries(hostedRecord())
		const { calls } = mockFetch([
			new Response('missing', { status: 404 }),
			putResult(1, true),
		])
		const result = await syncCatalog(wallet, {
			siteUrl: SITE,
			localEntries: local,
		})
		expect(result).toMatchObject({
			id: VECTOR_ID,
			version: 1,
			created: true,
			entries: 1,
		})
		expect(calls).toHaveLength(2)
		const put = calls[1] as FetchCall
		expect(put.method).toBe('PUT')
		expect(put.url).toBe(`${SITE}/api/catalog/${VECTOR_ID}`)
		expect(put.headers['content-type']).toBe(CATALOG_CONTENT_TYPE)
		expect(put.headers.authorization).toBe(`Bearer ${VECTOR_BEARER}`)
		expect(put.headers['x-bitplan-base-version']).toBe('0')
		const body = JSON.parse(
			Buffer.from(put.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries.map((item) => item.id)).toEqual([HOSTED_A])
	})

	test('merges local over remote and PUTs the exact fetched base version', async () => {
		const { wallet } = createFakeWallet()
		const remote: Catalog = {
			schema: 1,
			entries: [
				entry({ id: HOSTED_A, title: 'Remote title' }),
				entry({ id: HOSTED_B, title: 'Remote only' }),
			],
		}
		const local = [
			entry({ id: HOSTED_A, title: 'Local title' }),
			entry({ id: HOSTED_C, title: 'Local only' }),
		]
		const { calls } = mockFetch([catalogBody(remote, 7), putResult(8, false)])
		const result = await syncCatalog(wallet, {
			siteUrl: SITE,
			localEntries: local,
		})
		expect(result).toMatchObject({ version: 8, created: false, entries: 3 })
		const put = calls[1] as FetchCall
		expect(put.headers['x-bitplan-base-version']).toBe('7')
		const body = JSON.parse(
			Buffer.from(put.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries.map((item) => item.id)).toEqual([
			HOSTED_A,
			HOSTED_B,
			HOSTED_C,
		])
		expect(body.entries.find((item) => item.id === HOSTED_A)?.title).toBe(
			'Local title',
		)
		expect(body.entries.find((item) => item.id === HOSTED_B)?.title).toBe(
			'Remote only',
		)
	})

	test('one 409 refetches, remerges, and retries once', async () => {
		const { wallet } = createFakeWallet()
		const first: Catalog = { schema: 1, entries: [entry({ id: HOSTED_A })] }
		const second: Catalog = {
			schema: 1,
			entries: [entry({ id: HOSTED_A }), entry({ id: HOSTED_B })],
		}
		const local = [entry({ id: HOSTED_C, title: 'Local only' })]
		const { calls } = mockFetch([
			catalogBody(first, 7),
			new Response(JSON.stringify({ current: 8 }), { status: 409 }),
			catalogBody(second, 8),
			putResult(9, false),
		])
		const result = await syncCatalog(wallet, {
			siteUrl: SITE,
			localEntries: local,
		})
		expect(result).toMatchObject({ version: 9, entries: 3 })
		expect(calls.map((call) => call.method)).toEqual([
			'GET',
			'PUT',
			'GET',
			'PUT',
		])
		expect(calls[1]?.headers['x-bitplan-base-version']).toBe('7')
		expect(calls[3]?.headers['x-bitplan-base-version']).toBe('8')
		const body = JSON.parse(
			Buffer.from(calls[3]?.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries.map((item) => item.id)).toEqual([
			HOSTED_A,
			HOSTED_B,
			HOSTED_C,
		])
	})

	test('a second conflict preserves local data and reports sync is still needed', async () => {
		const { wallet } = createFakeWallet()
		const remote: Catalog = { schema: 1, entries: [entry({ id: HOSTED_A })] }
		const local = buildLocalEntries(hostedRecord())
		const { calls } = mockFetch([
			catalogBody(remote, 7),
			new Response('conflict', { status: 409 }),
			catalogBody(remote, 8),
			new Response('conflict', { status: 409 }),
		])
		await expect(
			syncCatalog(wallet, { siteUrl: SITE, localEntries: local }),
		).rejects.toThrow(/local data is unchanged.*bunx bitplan catalog sync/)
		expect(calls.map((call) => call.method)).toEqual([
			'GET',
			'PUT',
			'GET',
			'PUT',
		])
		// Local drafts were never touched by the failed sync.
		expect(local.map((item) => item.id)).toEqual([HOSTED_A])
	})
})

describe('inscription transition', () => {
	test('keeps the hosted id and records the chain origin', async () => {
		const { wallet } = createFakeWallet()
		const remote: Catalog = { schema: 1, entries: [entry({ id: HOSTED_A })] }
		const { calls } = mockFetch([catalogBody(remote, 4), putResult(5, false)])
		const result = await markCatalogInscribed(wallet, {
			siteUrl: SITE,
			hostedId: HOSTED_A,
			chainOrigin: CHAIN_ORIGIN,
		})
		expect(result).toMatchObject({ version: 5, entries: 1 })
		const put = calls[1] as FetchCall
		expect(put.headers['x-bitplan-base-version']).toBe('4')
		const body = JSON.parse(
			Buffer.from(put.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries).toHaveLength(1)
		expect(body.entries[0]).toMatchObject({
			id: HOSTED_A,
			state: 'inscribed',
			chainOrigin: CHAIN_ORIGIN,
		})
	})

	test('creates an inscribed entry from the fallback when remote lacks it', async () => {
		const { wallet } = createFakeWallet()
		const { calls } = mockFetch([
			new Response('missing', { status: 404 }),
			putResult(1, true),
		])
		const result = await markCatalogInscribed(wallet, {
			siteUrl: SITE,
			hostedId: HOSTED_A,
			chainOrigin: CHAIN_ORIGIN,
			fallback: {
				title: 'Local plan',
				description: null,
				repoHost: null,
				repoOrg: null,
				repoName: null,
				version: 3,
				updatedAt: '2026-09-03T00:00:00.000Z',
			},
		})
		expect(result).toMatchObject({ version: 1, created: true })
		const put = calls[1] as FetchCall
		expect(put.headers['x-bitplan-base-version']).toBe('0')
		const body = JSON.parse(
			Buffer.from(put.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries[0]).toMatchObject({
			id: HOSTED_A,
			state: 'inscribed',
			chainOrigin: CHAIN_ORIGIN,
			title: 'Local plan',
			version: 3,
		})
	})

	test('a second transition conflict preserves data and points at sync', async () => {
		const { wallet } = createFakeWallet()
		const remote: Catalog = { schema: 1, entries: [entry({ id: HOSTED_A })] }
		const { calls } = mockFetch([
			catalogBody(remote, 4),
			new Response('conflict', { status: 409 }),
			catalogBody(remote, 5),
			new Response('conflict', { status: 409 }),
		])
		await expect(
			markCatalogInscribed(wallet, {
				siteUrl: SITE,
				hostedId: HOSTED_A,
				chainOrigin: CHAIN_ORIGIN,
			}),
		).rejects.toThrow(/local data is unchanged.*bunx bitplan catalog sync/)
		expect(calls.map((call) => call.method)).toEqual([
			'GET',
			'PUT',
			'GET',
			'PUT',
		])
	})
})

describe('best-effort catalog writes', () => {
	test('a failed sync warns with the recovery command instead of throwing', async () => {
		const { wallet } = createFakeWallet()
		mockFetch([new Response('down', { status: 503 })])
		const warnings: string[] = []
		spyOn(console, 'warn').mockImplementation((message?: unknown) => {
			warnings.push(String(message))
		})
		await bestEffortCatalogSync(wallet, SITE)
		expect(warnings.join('\n')).toContain('bunx bitplan catalog sync')
	})

	test('a failed inscription transition warns instead of throwing', async () => {
		const { wallet } = createFakeWallet()
		mockFetch([new Response('down', { status: 503 })])
		const warnings: string[] = []
		spyOn(console, 'warn').mockImplementation((message?: unknown) => {
			warnings.push(String(message))
		})
		await bestEffortCatalogInscribed(wallet, {
			siteUrl: SITE,
			hostedId: HOSTED_A,
			chainOrigin: CHAIN_ORIGIN,
		})
		expect(warnings.join('\n')).toContain('bunx bitplan catalog sync')
	})
})

describe('hostedOrigin repair', () => {
	test('an inscribed chain record reconstructs from hostedOrigin provenance', () => {
		const mapped = localEntryForRecord({
			origin: CHAIN_ORIGIN,
			hostedOrigin: HOSTED_A,
			keyID: 'chain-key',
			latestOutpoint: CHAIN_ORIGIN,
			latestVersion: 2,
			updatedAt: '2026-09-04T00:00:00.000Z',
			title: 'Inscribed plan',
		})
		expect(mapped).toMatchObject({
			id: HOSTED_A,
			state: 'inscribed',
			chainOrigin: CHAIN_ORIGIN,
		})
		// No secret leaks into the catalog projection.
		expect(JSON.stringify(mapped)).not.toContain('hostedSecret')
	})

	test('a chain record without hostedOrigin is still skipped', () => {
		expect(
			localEntryForRecord({
				origin: CHAIN_ORIGIN,
				keyID: 'chain-key',
				latestOutpoint: CHAIN_ORIGIN,
				latestVersion: 1,
				updatedAt: '2026-09-04T00:00:00.000Z',
			}),
		).toBeNull()
	})

	test('ordinary sync repairs a failed inscription transition', async () => {
		const { wallet } = createFakeWallet()
		// Remote still shows the entry as hosted; local state already
		// recorded the chain origin via hostedOrigin.
		const remote: Catalog = {
			schema: 1,
			entries: [entry({ id: HOSTED_A, state: 'hosted', chainOrigin: null })],
		}
		const local = buildLocalEntries({
			files: {
				'/tmp/plan.html': {
					origin: CHAIN_ORIGIN,
					hostedOrigin: HOSTED_A,
					keyID: 'chain-key',
					latestOutpoint: CHAIN_ORIGIN,
					latestVersion: 1,
					updatedAt: '2026-09-04T00:00:00.000Z',
					title: 'Repaired',
				},
			},
		})
		expect(local[0]).toMatchObject({
			id: HOSTED_A,
			state: 'inscribed',
			chainOrigin: CHAIN_ORIGIN,
		})
		const { calls } = mockFetch([catalogBody(remote, 5), putResult(6, false)])
		const result = await syncCatalog(wallet, {
			siteUrl: SITE,
			localEntries: local,
		})
		expect(result).toMatchObject({ version: 6, entries: 1 })
		const body = JSON.parse(
			Buffer.from(calls[1]?.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries[0]).toMatchObject({
			id: HOSTED_A,
			state: 'inscribed',
			chainOrigin: CHAIN_ORIGIN,
		})
	})

	test('a failed transition followed by ordinary sync recovers the entry', async () => {
		const { wallet } = createFakeWallet()
		const remote: Catalog = { schema: 1, entries: [entry({ id: HOSTED_A })] }
		mockFetch([new Response('down', { status: 503 })])
		const warnings: string[] = []
		spyOn(console, 'warn').mockImplementation((message?: unknown) => {
			warnings.push(String(message))
		})
		await bestEffortCatalogInscribed(wallet, {
			siteUrl: SITE,
			hostedId: HOSTED_A,
			chainOrigin: CHAIN_ORIGIN,
		})
		expect(warnings.join('\n')).toMatch(/do not reinscribe/i)

		// Ordinary sync from saved inscribed state repairs the remote entry.
		const local = buildLocalEntries({
			files: {
				'/tmp/plan.html': {
					origin: CHAIN_ORIGIN,
					hostedOrigin: HOSTED_A,
					keyID: 'k',
					latestOutpoint: CHAIN_ORIGIN,
					latestVersion: 1,
					updatedAt: '2026-09-04T00:00:00.000Z',
				},
			},
		})
		const { calls } = mockFetch([catalogBody(remote, 5), putResult(6, false)])
		await syncCatalog(wallet, { siteUrl: SITE, localEntries: local })
		const body = JSON.parse(
			Buffer.from(calls[1]?.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect(body.entries[0]).toMatchObject({
			id: HOSTED_A,
			state: 'inscribed',
			chainOrigin: CHAIN_ORIGIN,
		})
	})
})

describe('bounded catalog projections', () => {
	test('overlong local metadata truncates by code points without mutating the record', () => {
		const record = {
			origin: HOSTED_A,
			keyID: 'k',
			latestOutpoint: HOSTED_A,
			latestVersion: 1,
			updatedAt: '2026-09-04T00:00:00.000Z',
			title: 'x'.repeat(600),
			description: 'y'.repeat(1500),
			repoHost: 'h'.repeat(300),
			repoOrg: 'o'.repeat(300),
			repoName: 'n'.repeat(300),
		}
		const projected = localEntryForRecord(record)
		expect(projected?.title?.length).toBe(512)
		expect([...(projected?.title ?? '')].length).toBe(512)
		expect([...(projected?.description ?? '')].length).toBe(1000)
		expect([...(projected?.repoHost ?? '')].length).toBe(253)
		expect([...(projected?.repoOrg ?? '')].length).toBe(255)
		expect([...(projected?.repoName ?? '')].length).toBe(255)
		// Stored metadata is untouched.
		expect(record.title.length).toBe(600)
		// The bounded projection validates strictly.
		expect(() =>
			assertCatalog({ schema: 1, entries: [projected as CatalogEntry] }),
		).not.toThrow()
	})

	test('emoji counts as one code point in validation and truncation', () => {
		const emoji = '🎉'
		// 512 emoji pass; 513 fail — UTF-16 length would be double.
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), title: emoji.repeat(512) }],
				}),
			),
		).not.toThrow()
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), title: emoji.repeat(513) }],
				}),
			),
		).toThrow(/title/)
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), description: emoji.repeat(1000) }],
				}),
			),
		).not.toThrow()
		expect(() =>
			parseCatalogJson(
				JSON.stringify({
					schema: 1,
					entries: [{ ...entry(), description: emoji.repeat(1001) }],
				}),
			),
		).toThrow(/description/)

		const truncated = truncateCatalogString(
			emoji.repeat(600),
			CATALOG_MAX_TITLE_CHARS,
		)
		expect([...(truncated ?? '')].length).toBe(CATALOG_MAX_TITLE_CHARS)
		expect(truncated).toBe(emoji.repeat(CATALOG_MAX_TITLE_CHARS))
		const short = truncateCatalogString('ok', CATALOG_MAX_TITLE_CHARS)
		expect(short).toBe('ok')
		expect(truncateCatalogString(null, CATALOG_MAX_TITLE_CHARS)).toBeNull()
	})

	test('an overlong local draft still syncs as a valid bounded catalog', async () => {
		const { wallet } = createFakeWallet()
		const local = buildLocalEntries({
			files: {
				'/tmp/plan.html': {
					origin: HOSTED_A,
					keyID: 'k',
					latestOutpoint: HOSTED_A,
					latestVersion: 1,
					updatedAt: '2026-09-04T00:00:00.000Z',
					title: '🎉'.repeat(600),
					description: 'd'.repeat(2000),
				},
			},
		})
		const { calls } = mockFetch([
			new Response('missing', { status: 404 }),
			putResult(1, true),
		])
		const result = await syncCatalog(wallet, {
			siteUrl: SITE,
			localEntries: local,
		})
		expect(result.entries).toBe(1)
		const body = JSON.parse(
			Buffer.from(calls[1]?.body ?? new Uint8Array()).toString('utf8'),
		) as Catalog
		expect([...(body.entries[0]?.title ?? '')].length).toBeLessThanOrEqual(
			CATALOG_MAX_TITLE_CHARS,
		)
		expect(
			[...(body.entries[0]?.description ?? '')].length,
		).toBeLessThanOrEqual(CATALOG_MAX_DESCRIPTION_CHARS)
		expect(() => assertCatalog(body)).not.toThrow()
	})
})

describe('catalog site URL transport', () => {
	test('resolveSiteUrl requires https except loopback http', () => {
		expect(resolveSiteUrl('https://example.com')).toBe('https://example.com')
		expect(resolveSiteUrl('https://example.com/')).toBe('https://example.com')
		expect(resolveSiteUrl('http://localhost:3000')).toBe(
			'http://localhost:3000',
		)
		expect(resolveSiteUrl('http://127.0.0.1:4000')).toBe(
			'http://127.0.0.1:4000',
		)
		expect(resolveSiteUrl('http://[::1]:5000')).toBe('http://[::1]:5000')
		expect(() => resolveSiteUrl('http://example.com')).toThrow(/https/i)
		expect(() => resolveSiteUrl('http://example.com/api')).toThrow(/https/i)
		expect(() => resolveSiteUrl('not-a-url')).toThrow()
	})

	test('sync never sends the bearer to cleartext remote http', async () => {
		const { wallet } = createFakeWallet()
		const { calls } = mockFetch([])
		await expect(
			syncCatalog(wallet, {
				siteUrl: 'http://example.com',
				localEntries: [],
			}),
		).rejects.toThrow(/https|cleartext/i)
		expect(calls).toHaveLength(0)
	})

	test('transition never sends the bearer to cleartext remote http', async () => {
		const { wallet } = createFakeWallet()
		const { calls } = mockFetch([])
		await expect(
			markCatalogInscribed(wallet, {
				siteUrl: 'http://example.com',
				hostedId: HOSTED_A,
				chainOrigin: CHAIN_ORIGIN,
			}),
		).rejects.toThrow(/https|cleartext/i)
		expect(calls).toHaveLength(0)
	})

	test('loopback http is allowed for development sync', async () => {
		const { wallet } = createFakeWallet()
		const { calls } = mockFetch([
			new Response('missing', { status: 404 }),
			putResult(1, true),
		])
		const result = await syncCatalog(wallet, {
			siteUrl: 'http://localhost:3000',
			localEntries: [],
		})
		expect(result.version).toBe(1)
		expect(calls).toHaveLength(2)
		expect(calls[0]?.url).toContain('http://localhost:3000/api/catalog/')
	})
})
