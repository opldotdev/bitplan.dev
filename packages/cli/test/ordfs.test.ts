import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { fetchLatest } from '../src/ordfs.js'

const ORIGIN = `${'a'.repeat(64)}_0`

afterEach(() => {
	spyOn(globalThis, 'fetch').mockRestore()
})

describe('ORDFS response bounds', () => {
	test('rejects a declared oversized body before buffering', async () => {
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(Uint8Array.of(1), {
				headers: { 'content-length': '999999999' },
			}),
		)

		await expect(fetchLatest(ORIGIN)).rejects.toThrow('ORDFS content exceeds')
		expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
	})

	test('times out a stalled request', async () => {
		spyOn(globalThis, 'fetch').mockImplementation(
			((_input, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(init.signal?.reason)
					})
				})) as typeof fetch,
		)

		await expect(fetchLatest(ORIGIN, { timeoutMs: 1 })).rejects.toThrow(
			'Could not reach ORDFS',
		)
	})
})
