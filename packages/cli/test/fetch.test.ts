import { beforeEach, expect, mock, spyOn, test } from 'bun:test'
import path from 'node:path'
import type { WalletInterface } from '@bsv/sdk'

const CHILD_RUN = process.env.BITPLAN_FETCH_TEST_CHILD === '1'
const ORIGIN = `${'a'.repeat(64)}_0`
const OUTPOINT = `${'b'.repeat(64)}_1`

if (!CHILD_RUN) {
	test('fetch output passes in an isolated module-mock process', () => {
		const result = Bun.spawnSync(['bun', 'test', import.meta.path], {
			cwd: path.resolve(import.meta.dir, '../../..'),
			env: { ...process.env, BITPLAN_FETCH_TEST_CHILD: '1' },
			stderr: 'pipe',
			stdout: 'pipe',
		})
		const output = `${result.stdout.toString()}${result.stderr.toString()}`
		expect(result.exitCode, output).toBe(0)
	})
} else {
	const wallet = {} as WalletInterface
	const html = '<!doctype html><html><title>Fetched plan</title></html>'
	const meta = { title: 'Fetched plan', description: 'A useful plan' }

	mock.module('../src/ordfs.js', () => ({
		fetchLatest: async () => ({
			bytes: Uint8Array.of(1, 2, 3),
			contentType: 'application/x-bitplan',
			origin: ORIGIN,
			outpoint: OUTPOINT,
			sequence: 2,
		}),
		originFromReference: () => ORIGIN,
	}))

	mock.module('../src/wallet.js', () => ({
		connectWallet: async () => ({ wallet, url: 'http://wallet.test' }),
	}))

	mock.module('../src/envelope.js', () => ({
		openEnvelope: async () => ({
			header: {
				v: 2,
				key: {
					keyID: 'plan-key',
					senderIdentityKey: 'sender-key',
					sharedWith: ['reader-key'],
				},
			},
			plaintext: { meta, html },
		}),
		sharedWith: (header: { key: { sharedWith: string[] } }) =>
			header.key.sharedWith,
	}))

	const { fetchCommand } = await import('../src/commands/fetch.js')

	beforeEach(() => {
		spyOn(console, 'log').mockImplementation(() => {})
		spyOn(console, 'error').mockImplementation(() => {})
	})

	test('--json prints the HTML and metadata as one JSON value', async () => {
		await fetchCommand(ORIGIN, { json: true, meta: true })

		expect(console.error).not.toHaveBeenCalled()
		expect(console.log).toHaveBeenCalledTimes(1)
		expect(console.log).toHaveBeenCalledWith(
			JSON.stringify(
				{
					origin: ORIGIN,
					outpoint: OUTPOINT,
					version: 3,
					contentType: 'application/x-bitplan',
					envelopeVersion: 2,
					keyID: 'plan-key',
					access: {
						mode: 'shared',
						senderIdentityKey: 'sender-key',
						readers: ['reader-key'],
					},
					meta,
					html,
				},
				null,
				2,
			),
		)
	})
}
