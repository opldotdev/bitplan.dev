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

	test('allows payload-sized create and sign responses', async () => {
		spyOn(globalThis, 'fetch').mockImplementation(
			(async () =>
				new Response('{}', {
					headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
				})) as unknown as typeof fetch,
		)
		const wallet = createWallet('https://wallet.example') as unknown as {
			substrate: {
				createAction: (args: object) => Promise<unknown>
				signAction: (args: object) => Promise<unknown>
			}
		}
		await expect(wallet.substrate.createAction({})).resolves.toEqual({})
		await expect(wallet.substrate.signAction({})).resolves.toEqual({})
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
