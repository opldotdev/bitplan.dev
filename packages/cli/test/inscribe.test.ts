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
	let failPatch: boolean
	let storeOnFailedPatch: boolean
	let failSave: boolean
	let patchCalls: string[]
	let tempDir: string
	let htmlFile: string

	mock.module('../src/state.js', () => ({
		findDraftByFile: () => known,
		findDraftByOrigin: (origin: string) =>
			known && known.origin === origin
				? { filePath: htmlFile, record: known }
				: undefined,
		findDraftByHostedOrigin: (hostedId: string) =>
			known && known.hostedOrigin === hostedId
				? { filePath: htmlFile, record: known }
				: undefined,
		saveDraftRecord: (file: string, record: DraftRecord) => {
			if (failSave) throw new Error('disk full')
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
		failPatch = false
		storeOnFailedPatch = false
		failSave = false
		patchCalls = []
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

		test('redirect failure retains the secret and gives a bunx recovery command', async () => {
			failPatch = true

			await inscribeCommand(HOSTED, { yes: true })

			expect(calls.genesis).toHaveLength(1)
			expect(calls.saves).toHaveLength(1)
			expect(calls.saves[0]?.record).toMatchObject({
				origin: GENESIS_OUTPOINT,
				hostedOrigin: HOSTED,
				hostedSecret: SECRET,
			})
			const warnings = (
				console.warn as unknown as { mock: { calls: Array<[string]> } }
			).mock.calls.map(([message]) => String(message))
			expect(warnings.join('\n')).toContain(GENESIS_OUTPOINT)
			expect(warnings.join('\n')).toMatch(/bunx bitplan inscribe/)
			expect(warnings.join('\n')).not.toMatch(/edit.*state|by hand/i)
		})

		test('rerun repairs a null remote redirect with zero publish calls', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = null

			await inscribeCommand(HOSTED, { yes: true })

			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.relays).toEqual([])
			expect(patchCalls).toHaveLength(1)
			expect(calls.saves).toHaveLength(1)
			expect(calls.saves[0]?.record.origin).toBe(GENESIS_OUTPOINT)
			expect(calls.saves[0]?.record.hostedOrigin).toBe(HOSTED)
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
			const printed = (
				console.log as unknown as { mock: { calls: Array<[string]> } }
			).mock.calls.map(([message]) => String(message))
			expect(printed.join('\n')).toMatch(/repaired/i)
			expect(printed.join('\n')).toMatch(/no new inscription/i)
		})

		test('rerun via local file repairs the redirect', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = null

			await inscribeCommand(htmlFile, { yes: true })

			expect(calls.genesis).toEqual([])
			expect(patchCalls).toHaveLength(1)
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
		})

		test('rerun via viewer URL repairs the redirect', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = null

			await inscribeCommand(`https://bitplan.dev/d/${HOSTED}`, { yes: true })

			expect(calls.genesis).toEqual([])
			expect(patchCalls).toHaveLength(1)
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
		})

		test('rerun confirms an already-applied remote redirect', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = GENESIS_OUTPOINT

			await inscribeCommand(HOSTED, { yes: true })

			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.relays).toEqual([])
			expect(patchCalls).toEqual([])
			expect(calls.saves).toHaveLength(1)
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
			expect(calls.saves[0]?.record.hostedOrigin).toBe(HOSTED)
		})

		test('a failed PATCH that still stored the origin recovers via reread', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = null
			failPatch = true
			storeOnFailedPatch = true

			await inscribeCommand(HOSTED, { yes: true })

			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.relays).toEqual([])
			expect(patchCalls).toHaveLength(1)
			expect(calls.saves).toHaveLength(1)
			expect(calls.saves[0]?.record.origin).toBe(GENESIS_OUTPOINT)
			expect(calls.saves[0]?.record.hostedOrigin).toBe(HOSTED)
			expect(calls.saves[0]?.record.hostedSecret).toBeUndefined()
			const printed = (
				console.log as unknown as { mock: { calls: Array<[string]> } }
			).mock.calls.map(([message]) => String(message))
			expect(printed.join('\n')).toMatch(/repaired/i)
			expect(printed.join('\n')).toMatch(/no new inscription/i)
		})

		test('recovery cleanup-save failure keeps retry safe without exposing the secret', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = GENESIS_OUTPOINT
			failSave = true

			const error = await inscribeCommand(HOSTED, { yes: true }).catch(
				(value: unknown) => value,
			)
			expect(error).toBeInstanceOf(Error)
			const message = String((error as Error).message)
			expect(message).toMatch(/local cleanup failed/i)
			expect(message).toContain(GENESIS_OUTPOINT)
			expect(message).toMatch(/bunx bitplan inscribe/)
			expect(message).toContain(HOSTED)
			expect(message).toMatch(/no new inscription/i)
			expect(message).not.toContain(SECRET)
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.relays).toEqual([])
			expect(patchCalls).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('a conflicting remote origin fails safely and retains the secret', async () => {
			known = inscribedPendingRecord()
			const other = `${'e'.repeat(64)}_0`
			hostedOrigin = other

			await expect(inscribeCommand(HOSTED, { yes: true })).rejects.toThrow(
				/does not match|conflict|refusing/i,
			)
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.relays).toEqual([])
			expect(patchCalls).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('--json recovery output is pure JSON on stdout', async () => {
			known = inscribedPendingRecord()
			hostedOrigin = null

			await inscribeCommand(HOSTED, { json: true, yes: true })

			expect(console.log).toHaveBeenCalledTimes(1)
			const printed = String(
				(
					console.log as unknown as {
						mock: { calls: Array<[string]> }
					}
				).mock.calls[0]?.[0],
			)
			const payload = JSON.parse(printed) as Record<string, unknown>
			expect(payload).toMatchObject({
				repaired: true,
				hostedId: HOSTED,
				origin: GENESIS_OUTPOINT,
			})
			expect(printed).not.toContain(SECRET)
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

	function inscribedPendingRecord(): DraftRecord {
		return {
			origin: GENESIS_OUTPOINT,
			keyID: 'hosted-key',
			latestOutpoint: GENESIS_OUTPOINT,
			latestVersion: 1,
			updatedAt: '2026-08-29T12:00:00.000Z',
			title: 'Hosted draft',
			hostedSecret: SECRET,
			hostedOrigin: HOSTED,
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
			patchCalls.push(String(init?.body ?? ''))
			if (failPatch) {
				if (storeOnFailedPatch) hostedOrigin = GENESIS_OUTPOINT
				return new Response('redirect down', { status: 500 })
			}
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
