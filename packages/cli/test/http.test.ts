import { describe, expect, test } from 'bun:test'
import { fetchBoundedResponse, readBoundedResponseBody } from '../src/http.js'

describe('readBoundedResponseBody', () => {
	test('reads a chunked response through the exact limit', async () => {
		const response = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(Uint8Array.of(1, 2))
					controller.enqueue(Uint8Array.of(3, 4))
					controller.close()
				},
			}),
		)
		expect(await readBoundedResponseBody(response, 4, 'Test response')).toEqual(
			Uint8Array.of(1, 2, 3, 4),
		)
	})

	test('rejects declared and streamed bodies over the limit', async () => {
		await expect(
			readBoundedResponseBody(
				new Response(Uint8Array.of(1), {
					headers: { 'content-length': '5' },
				}),
				4,
				'Test response',
			),
		).rejects.toThrow('exceeds the 4-byte limit')

		let cancelled = false
		const response = new Response(
			new ReadableStream<Uint8Array>({
				cancel() {
					cancelled = true
				},
				start(controller) {
					controller.enqueue(Uint8Array.of(1, 2, 3))
					controller.enqueue(Uint8Array.of(4, 5))
				},
			}),
		)
		await expect(
			readBoundedResponseBody(response, 4, 'Test response'),
		).rejects.toThrow('exceeds the 4-byte limit')
		expect(cancelled).toBe(true)
	})
})

describe('fetchBoundedResponse', () => {
	test('attaches a deadline and returns a replayable bounded response', async () => {
		let signal: AbortSignal | null | undefined
		const fetchImpl = (async (_input, init) => {
			signal = init?.signal
			return new Response('{"ok":true}', {
				headers: { 'content-type': 'application/json' },
				status: 201,
			})
		}) as typeof fetch
		const response = await fetchBoundedResponse(
			'https://example.com',
			undefined,
			{ label: 'Third-party response', maxBytes: 64, timeoutMs: 1000 },
			fetchImpl,
		)
		expect(signal).toBeInstanceOf(AbortSignal)
		expect(response.status).toBe(201)
		expect(await response.json()).toEqual({ ok: true })
	})

	test('rejects an oversized third-party response before parsing it', async () => {
		const fetchImpl = async () =>
			new Response('x', {
				headers: { 'content-length': '65' },
			})
		await expect(
			fetchBoundedResponse(
				'https://example.com',
				undefined,
				{ label: 'Third-party response', maxBytes: 64, timeoutMs: 1000 },
				fetchImpl,
			),
		).rejects.toThrow('Third-party response exceeds the 64-byte limit')
	})
})
