import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { LockingScript, Transaction } from '@bsv/sdk'
import { DEFAULT_RELAY_URL } from '../src/constants.js'
import { relayBeef } from '../src/relay.js'

function publishedTransaction() {
	const tx = new Transaction(
		1,
		[],
		[{ satoshis: 0, lockingScript: LockingScript.fromASM('OP_RETURN') }],
		0,
	)
	return { beef: tx.toAtomicBEEFUint8Array(), txid: tx.id('hex') }
}

afterEach(() => mock.restore())

describe('relayBeef', () => {
	test('validates and posts Atomic BEEF to the 1Sat relay', async () => {
		const { beef, txid } = publishedTransaction()
		const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ txid, txStatus: 'SEEN_ON_NETWORK' }), {
				status: 200,
			}),
		)

		await expect(relayBeef(beef, txid)).resolves.toEqual({
			state: 'accepted',
			txStatus: 'SEEN_ON_NETWORK',
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0] ?? []
		expect(url).toBe(DEFAULT_RELAY_URL)
		expect(init?.method).toBe('POST')
		expect(init?.headers).toEqual({
			'content-type': 'application/octet-stream',
		})
		expect(Buffer.from(init?.body as Uint8Array)).toEqual(Buffer.from(beef))
	})

	test('reports a 202 response as still pending', async () => {
		const { beef, txid } = publishedTransaction()
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ txid, txStatus: 'RECEIVED' }), {
				status: 202,
			}),
		)

		await expect(relayBeef(beef, txid)).resolves.toEqual({
			state: 'pending',
			txStatus: 'RECEIVED',
		})
	})

	test('does not submit BEEF whose subject txid does not match', async () => {
		const { beef } = publishedTransaction()
		const fetchMock = spyOn(globalThis, 'fetch')

		await expect(relayBeef(beef, 'f'.repeat(64))).rejects.toThrow(
			"wallet's Atomic BEEF contains txid",
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	test('does not report a rejected transaction as accepted', async () => {
		const { beef, txid } = publishedTransaction()
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ txid, txStatus: 'REJECTED' }), {
				status: 200,
			}),
		)

		await expect(relayBeef(beef, txid)).rejects.toThrow(
			'1Sat relay reported REJECTED',
		)
	})

	test('rejects a non-contract success response', async () => {
		const { beef, txid } = publishedTransaction()
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ status: 'RECEIVED' }), { status: 200 }),
		)

		await expect(relayBeef(beef, txid)).rejects.toThrow(
			'did not include a txid',
		)
	})
})
