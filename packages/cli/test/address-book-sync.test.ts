import { describe, expect, test } from 'bun:test'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import {
	addressBookLocator,
	loadAddressBook,
	parseAddressBook,
	syncAddressBook,
} from '../src/address-book-sync.js'
import { deriveCatalogLocator } from '../src/catalog.js'

describe('private address book CLI/browser contract', () => {
	test('only the owner decrypts; transport contains ciphertext; draft catalog is separate', async () => {
		const owner = new ProtoWallet(new PrivateKey(1))
		const guest = new ProtoWallet(new PrivateKey(2))
		const publicKey = (await guest.getPublicKey({ identityKey: true }))
			.publicKey
		const book = {
			schema: 1 as const,
			contacts: { tina: publicKey },
			teams: { opl: ['tina'] },
		}
		let saved: Uint8Array | null = null
		let version = 0
		let bearer = ''
		const transport: typeof fetch = (async (
			_url: unknown,
			init?: RequestInit,
		) => {
			if (init?.method === 'PUT') {
				expect(new Headers(init.headers).get('x-bitplan-base-version')).toBe(
					String(version),
				)
				bearer = new Headers(init.headers).get('authorization') ?? ''
				saved = new Uint8Array(init.body as Uint8Array)
				version += 1
				return Response.json(
					{ id: String(_url).split('/').pop(), version },
					{ status: 201 },
				)
			}
			return saved
				? new Response(Uint8Array.from(saved).buffer, {
						headers: { 'x-bitplan-catalog-version': String(version) },
					})
				: new Response(null, { status: 404 })
		}) as typeof fetch
		await syncAddressBook(owner, 'https://bitplan.dev', book, transport)
		expect(new TextDecoder().decode(saved ?? undefined)).not.toContain('tina')
		expect(new TextDecoder().decode(saved ?? undefined)).not.toContain(
			publicKey,
		)
		expect(bearer).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/)
		expect(
			await loadAddressBook(owner, 'https://bitplan.dev', transport),
		).toEqual(book)
		await expect(
			loadAddressBook(guest, 'https://bitplan.dev', transport),
		).rejects.toThrow()
		expect((await addressBookLocator(owner)).id).not.toBe(
			(await deriveCatalogLocator(owner)).id,
		)
		await syncAddressBook(
			owner,
			'https://bitplan.dev',
			{ schema: 1, contacts: {}, teams: {} },
			transport,
		)
		expect(
			(await loadAddressBook(owner, 'https://bitplan.dev', transport))
				?.contacts,
		).toEqual({})
	})

	test('rejects secrets, invalid keys, dangling teams, unsafe destinations and conflicts', async () => {
		const bytes = (value: unknown) =>
			new TextEncoder().encode(JSON.stringify(value))
		const empty = { schema: 1 as const, contacts: {}, teams: {} }
		expect(() =>
			parseAddressBook(bytes({ ...empty, hostedSecret: 'not allowed' })),
		).toThrow()
		expect(() =>
			parseAddressBook(bytes({ ...empty, contacts: { bad: 'no' } })),
		).toThrow()
		expect(() =>
			parseAddressBook(bytes({ ...empty, teams: { opl: ['missing'] } })),
		).toThrow()
		const owner = new ProtoWallet(new PrivateKey(1))
		const conflict = (async (_url: unknown, init?: RequestInit) =>
			new Response(null, {
				status: init?.method === 'PUT' ? 409 : 404,
			})) as typeof fetch
		await expect(
			syncAddressBook(owner, 'http://example.com', empty, conflict),
		).rejects.toThrow()
		await expect(
			syncAddressBook(owner, 'https://bitplan.dev', empty, conflict),
		).rejects.toThrow('changed during sync')
		const failing = (async () =>
			new Response(null, { status: 503 })) as unknown as typeof fetch
		await expect(
			syncAddressBook(owner, 'https://bitplan.dev', empty, failing),
		).rejects.toThrow('Could not load')
	})
})
