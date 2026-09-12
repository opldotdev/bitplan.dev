import { describe, expect, test } from 'bun:test'
import { readBoundedResponseBody } from '../src/http.js'

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
