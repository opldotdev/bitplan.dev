import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { createWallet } from '../src/wallet.js'

afterEach(() => {
	spyOn(globalThis, 'fetch').mockRestore()
})

describe('wallet URL security', () => {
	test('accepts remote TLS and explicit loopback HTTP', () => {
		for (const url of [
			'https://wallet.example',
			'http://localhost:3321',
			'http://127.0.0.1:3321',
			'http://127.1:3321',
			'http://[::1]:3321',
		]) {
			expect(() => createWallet(url)).not.toThrow()
		}
	})

	test('rejects malformed, non-HTTP, and remote cleartext URLs', () => {
		for (const url of [
			'not-a-url',
			'file:///tmp/wallet',
			'http://wallet.example:3321',
			'http://localhost.example:3321',
			'http://127.0.0.2:3321',
		]) {
			expect(() => createWallet(url)).toThrow()
		}
	})
})

describe('wallet HTTP response bounds', () => {
	test('attaches a finite timeout to wallet RPC', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ version: '1.2.3' }), {
				headers: { 'content-type': 'application/json' },
			}),
		)
		await expect(
			createWallet('https://wallet.example').getVersion({}),
		).resolves.toEqual({ version: '1.2.3' })
		expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
		expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('error')
	})

	test('allows payload-sized BEEF-bearing responses', async () => {
		const beef = new Array(1024 * 1024 + 1).fill(255)
		const listBody = JSON.stringify({ BEEF: beef, outputs: [] })
		expect(new TextEncoder().encode(listBody).byteLength).toBeGreaterThan(
			4 * 1024 * 1024,
		)
		spyOn(globalThis, 'fetch').mockImplementation((async (
			input: string | URL | Request,
		) => {
			const method = new URL(input.toString()).pathname.split('/').at(-1)
			if (method === 'listOutputs') return new Response(listBody)
			return new Response('{}', {
				headers: { 'content-length': String(40 * 1024 * 1024) },
			})
		}) as unknown as typeof fetch)
		const wallet = createWallet('https://wallet.example') as unknown as {
			substrate: {
				createAction: (args: object) => Promise<unknown>
				listOutputs: (args: object) => Promise<{ BEEF: ArrayLike<number> }>
				signAction: (args: object) => Promise<unknown>
			}
		}
		const result = await wallet.substrate.listOutputs({
			include: 'entire transactions',
		})
		expect(result.BEEF.length).toBe(beef.length)
		await expect(wallet.substrate.createAction({})).resolves.toEqual({})
		await expect(wallet.substrate.signAction({})).resolves.toEqual({})
	})

	test('keeps ordinary and TXID-only wallet responses at the low cap', async () => {
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('{}', {
				headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
			}),
		)
		const wallet = createWallet('https://wallet.example') as unknown as {
			substrate: {
				listOutputs: (args: object) => Promise<unknown>
				signAction: (args: object) => Promise<unknown>
			}
		}
		await expect(wallet.substrate.listOutputs({})).rejects.toThrow(
			'Wallet response exceeds',
		)
		await expect(
			wallet.substrate.signAction({ options: { returnTXIDOnly: true } }),
		).rejects.toThrow('Wallet response exceeds')
	})

	test('rejects an oversized wallet RPC response', async () => {
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('x', {
				headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
			}),
		)
		await expect(
			createWallet('https://wallet.example').getVersion({}),
		).rejects.toThrow('Wallet response exceeds')
	})
})
