import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { WalletInterface } from '@bsv/sdk'
import type { BitplanCoin, PublishResult } from '../src/ordinals.js'
import type { DraftRecord } from '../src/state.js'

const CHILD_RUN = process.env.BITPLAN_INSCRIBE_TEST_CHILD === '1'
const HOSTED = `h_${'A'.repeat(20)}`
const SECRET = 'ab'.repeat(32)
const GENESIS_OUTPOINT = `${'c'.repeat(64)}_0`
const VERSION_OUTPOINT = `${'d'.repeat(64)}_0`

if (!CHILD_RUN) {
	test('inscribe orchestration passes in an isolated module-mock process', () => {
		const result = Bun.spawnSync(['bun', 'test', import.meta.path], {
			cwd: path.resolve(import.meta.dir, '../../..'),
			env: {
				...process.env,
				BITPLAN_INSCRIBE_TEST_CHILD: '1',
			},
			stderr: 'pipe',
			stdout: 'pipe',
		})
		const output = `${result.stdout.toString()}${result.stderr.toString()}`
		expect(result.exitCode, output).toBe(0)
	})
} else {
	interface Calls {
		genesis: Uint8Array[]
		version: Array<{ coin: BitplanCoin; envelope: Uint8Array }>
		findCoin: string[]
		relays: Array<{ beef: Uint8Array; txid: string }>
		saves: Array<{ file: string; record: DraftRecord }>
	}

	const wallet = {} as WalletInterface
	const coin = {
		id: 'coin-1',
		origin: GENESIS_OUTPOINT,
		outpoint: GENESIS_OUTPOINT,
		output: {},
	} as BitplanCoin
	const genesisBeef = Uint8Array.of(4, 5, 6)
	const genesisResult: PublishResult = {
		txid: 'c'.repeat(64),
		beef: genesisBeef,
		origin: GENESIS_OUTPOINT,
		outpoint: GENESIS_OUTPOINT,
	}
	const versionResult: PublishResult = {
		txid: 'd'.repeat(64),
		origin: GENESIS_OUTPOINT,
		outpoint: VERSION_OUTPOINT,
	}

	let calls: Calls
	let known: DraftRecord | undefined
	let hostedOrigin: string | null
	let hostedVersions: number
	let tempDir: string
	let htmlFile: string

	mock.module('../src/state.js', () => ({
		findDraftByFile: () => known,
		findDraftByOrigin: () =>
			known ? { filePath: htmlFile, record: known } : undefined,
		saveDraftRecord: (file: string, record: DraftRecord) => {
			calls.saves.push({ file, record })
		},
		readConfig: () => ({}),
	}))

	mock.module('../src/wallet.js', () => ({
		connectWallet: async () => ({ wallet, url: 'http://wallet.test' }),
		identityKey: async () => 'identity-key',
		errorMessage: (error: unknown) =>
			error instanceof Error ? error.message : String(error),
	}))

	mock.module('../src/ordinals.js', () => ({
		findCoinByOrigin: async (_wallet: WalletInterface, origin: string) => {
			calls.findCoin.push(origin)
			return coin
		},
		publishGenesis: async (_wallet: WalletInterface, envelope: Uint8Array) => {
			calls.genesis.push(envelope)
			return genesisResult
		},
		publishVersion: async (
			_wallet: WalletInterface,
			publishedCoin: BitplanCoin,
			envelope: Uint8Array,
		) => {
			calls.version.push({ coin: publishedCoin, envelope })
			return versionResult
		},
	}))

	mock.module('../src/relay.js', () => ({
		relayBeef: async (beef: Uint8Array, txid: string) => {
			calls.relays.push({ beef, txid })
			return { state: 'accepted', txStatus: 'SEEN_ON_NETWORK' }
		},
	}))

	const { inscribeCommand } = await import('../src/commands/inscribe.js')

	beforeEach(() => {
		calls = {
			genesis: [],
			version: [],
			findCoin: [],
			relays: [],
			saves: [],
		}
		known = hostedRecord()
		hostedOrigin = null
		hostedVersions = 3
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-inscribe-test-'))
		htmlFile = path.join(tempDir, 'plan.html')
		fs.writeFileSync(htmlFile, '<!doctype html><title>Hosted</title>')
		spyOn(console, 'log').mockImplementation(() => {})
		spyOn(console, 'warn').mockImplementation(() => {})
		spyOn(globalThis, 'fetch').mockImplementation(
			fakeHostedFetch as typeof fetch,
		)
	})

	afterEach(() => {
		mock.restore()
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	describe('inscribeCommand', () => {
		test('latest-only writes one genesis', async () => {
			await inscribeCommand(HOSTED, { yes: true })

			expect(calls.genesis).toEqual([Uint8Array.of(3)])
			expect(calls.version).toEqual([])
			expect(calls.findCoin).toEqual([])
			expect(calls.relays).toHaveLength(1)
			expect(calls.saves[0]?.record).toMatchObject({
				origin: GENESIS_OUTPOINT,
				latestOutpoint: GENESIS_OUTPOINT,
				latestVersion: 1,
				keyID: 'hosted-key',
			})
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
			expect(console.log).toHaveBeenCalledWith(
				'The hosted link now redirects to the chain origin.',
			)
		})

		test('--all-versions writes genesis then later versions in order', async () => {
			await inscribeCommand(HOSTED, { allVersions: true, yes: true })

			expect(calls.genesis).toEqual([Uint8Array.of(1)])
			expect(calls.version.map((item) => [...item.envelope])).toEqual([
				[2],
				[3],
			])
			expect(calls.findCoin).toEqual([GENESIS_OUTPOINT, GENESIS_OUTPOINT])
			expect(calls.saves[0]?.record).toMatchObject({
				origin: GENESIS_OUTPOINT,
				latestOutpoint: VERSION_OUTPOINT,
				latestVersion: 3,
			})
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
		})

		test('already-inscribed refuses before publishing', async () => {
			hostedOrigin = `${'e'.repeat(64)}_0`

			await expect(inscribeCommand(HOSTED, { yes: true })).rejects.toThrow(
				`Already on the chain at ${hostedOrigin}.`,
			)
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('--json prints the inscribed result', async () => {
			await inscribeCommand(HOSTED, { json: true, yes: true })

			expect(console.log).toHaveBeenCalledWith(
				JSON.stringify(
					{
						inscribed: true,
						hostedId: HOSTED,
						origin: GENESIS_OUTPOINT,
						outpoint: GENESIS_OUTPOINT,
						versions: 1,
						viewer: `https://bitplan.dev/d/${GENESIS_OUTPOINT}`,
					},
					null,
					2,
				),
			)
		})
	})

	function hostedRecord(): DraftRecord {
		return {
			origin: HOSTED,
			keyID: 'hosted-key',
			latestOutpoint: HOSTED,
			latestVersion: 3,
			updatedAt: '2026-08-29T12:00:00.000Z',
			title: 'Hosted draft',
			hostedSecret: SECRET,
		}
	}

	async function fakeHostedFetch(
		input: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> {
		const url = input instanceof Request ? input.url : String(input)
		const method = (
			init?.method ?? (input instanceof Request ? input.method : 'GET')
		).toUpperCase()
		if (
			url === `https://bitplan.dev/api/hosted/${HOSTED}` &&
			method === 'GET'
		) {
			return new Response(
				JSON.stringify({
					id: HOSTED,
					versions: hostedVersions,
					bytes: [1, 1, 1],
					origin: hostedOrigin,
					createdAt: '2026-08-29T12:00:00.000Z',
					updatedAt: '2026-08-29T12:00:00.000Z',
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			)
		}
		if (
			url === `https://bitplan.dev/api/hosted/${HOSTED}` &&
			method === 'PATCH'
		) {
			return new Response(
				JSON.stringify({ id: HOSTED, origin: GENESIS_OUTPOINT }),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			)
		}
		const content = url.match(new RegExp(`/ordfs/content/${HOSTED}:(-?\\d+)$`))
		if (content) {
			const seq = Number(content[1])
			const versionBytes =
				seq === -1 ? Uint8Array.of(3) : Uint8Array.of(seq + 1)
			return new Response(versionBytes, {
				status: 200,
				headers: {
					'content-type': 'application/x-bitplan',
					'x-ord-seq': String(seq === -1 ? 2 : seq),
					'x-outpoint': HOSTED,
					'x-origin': HOSTED,
				},
			})
		}
		return new Response('not found', { status: 404 })
	}
}
