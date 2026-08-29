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
import type { DraftPlaintext } from '../src/envelope.js'
import type { BitplanCoin, PublishResult } from '../src/ordinals.js'
import type { DraftRecord } from '../src/state.js'

const CHILD_RUN = process.env.BITPLAN_UPLOAD_TEST_CHILD === '1'
const ORIGIN = `${'a'.repeat(64)}_0`
const VERSION_OUTPOINT = `${'b'.repeat(64)}_1`
const GENESIS_OUTPOINT = `${'c'.repeat(64)}_0`

if (!CHILD_RUN) {
	test('upload orchestration passes in an isolated module-mock process', () => {
		const result = Bun.spawnSync(['bun', 'test', import.meta.path], {
			cwd: path.resolve(import.meta.dir, '../../..'),
			env: {
				...process.env,
				BITPLAN_UPLOAD_TEST_CHILD: '1',
			},
			stderr: 'pipe',
			stdout: 'pipe',
		})
		const output = `${result.stdout.toString()}${result.stderr.toString()}`
		expect(result.exitCode, output).toBe(0)
	})
} else {
	interface SealCall {
		plaintext: DraftPlaintext
		keyID: string
	}

	interface Calls {
		connectWallet: Array<string | undefined>
		findCoin: string[]
		genesis: Uint8Array[]
		version: Array<{ coin: BitplanCoin; envelope: Uint8Array }>
		seals: SealCall[]
		saves: Array<{ file: string; record: DraftRecord }>
	}

	const wallet = {} as WalletInterface
	const coin = {
		id: 'coin-1',
		origin: ORIGIN,
		outpoint: VERSION_OUTPOINT,
		output: {},
	} as BitplanCoin
	const genesisResult: PublishResult = {
		txid: 'c'.repeat(64),
		origin: GENESIS_OUTPOINT,
		outpoint: GENESIS_OUTPOINT,
	}
	const versionResult: PublishResult = {
		txid: 'd'.repeat(64),
		origin: ORIGIN,
		outpoint: `${'d'.repeat(64)}_0`,
	}

	let calls: Calls
	let knownByFile: DraftRecord | undefined
	let knownByOrigin: DraftRecord | undefined
	let genesisError: Error | undefined
	let tempDir: string
	let htmlFile: string

	mock.module('../src/state.js', () => ({
		findDraftByFile: () => knownByFile,
		findDraftByOrigin: () =>
			knownByOrigin ? { file: htmlFile, record: knownByOrigin } : undefined,
		saveDraftRecord: (file: string, record: DraftRecord) => {
			calls.saves.push({ file, record })
		},
	}))

	mock.module('../src/wallet.js', () => ({
		connectWallet: async (url: string | undefined) => {
			calls.connectWallet.push(url)
			return { wallet, url: url ?? 'http://wallet.test' }
		},
	}))

	mock.module('../src/ordinals.js', () => ({
		findCoinByOrigin: async (_wallet: WalletInterface, origin: string) => {
			calls.findCoin.push(origin)
			return coin
		},
		publishGenesis: async (_wallet: WalletInterface, envelope: Uint8Array) => {
			calls.genesis.push(envelope)
			if (genesisError) throw genesisError
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

	mock.module('../src/envelope.js', () => ({
		newKeyId: () => 'new-draft-key',
		parseEnvelope: () => ({ header: { key: { keyID: 'adopted-key' } } }),
		sealEnvelope: async (
			_wallet: WalletInterface,
			plaintext: DraftPlaintext,
			keyID: string,
		) => {
			calls.seals.push({ plaintext, keyID })
			return Uint8Array.of(1, 2, 3)
		},
	}))

	mock.module('../src/htmlPolicy.js', () => ({
		validateHtml: () => ({
			ok: true,
			errors: [],
			warnings: [],
			title: 'Upload orchestration',
		}),
	}))

	mock.module('../src/git.js', () => ({
		collectGitMetadata: () => ({
			repoOrg: null,
			repoName: null,
			repoHost: null,
			gitBranch: null,
			gitCommitSha: null,
			gitCommitSubject: null,
			gitDirty: null,
		}),
	}))

	mock.module('../src/secretScan.js', () => ({
		scanForSecrets: () => [],
	}))

	mock.module('../src/ordfs.js', () => ({
		fetchLatest: async () => {
			throw new Error('unexpected ORDFS request')
		},
	}))

	const { uploadCommand } = await import('../src/commands/upload.js')

	beforeEach(() => {
		calls = {
			connectWallet: [],
			findCoin: [],
			genesis: [],
			version: [],
			seals: [],
			saves: [],
		}
		knownByFile = undefined
		knownByOrigin = undefined
		genesisError = undefined
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-upload-test-'))
		htmlFile = path.join(tempDir, 'plan.html')
		fs.writeFileSync(
			htmlFile,
			'<!doctype html><html><title>Upload orchestration</title></html>',
		)
		spyOn(console, 'log').mockImplementation(() => {})
		spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		mock.restore()
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	describe('uploadCommand orchestration', () => {
		test('--new publishes genesis even when the file has local draft history', async () => {
			knownByFile = existingRecord()

			await uploadCommand(htmlFile, {
				new: true,
				yes: true,
				description: 'A fresh draft',
			})

			expect(calls.findCoin).toEqual([])
			expect(calls.genesis).toHaveLength(1)
			expect(calls.version).toEqual([])
			expect(calls.seals[0]?.keyID).toBe('new-draft-key')
			expect(calls.seals[0]?.plaintext.meta.description).toBe('A fresh draft')
			expect(calls.saves).toHaveLength(1)
			expect(calls.saves[0]?.record).toMatchObject({
				origin: GENESIS_OUTPOINT,
				latestOutpoint: GENESIS_OUTPOINT,
				latestVersion: 1,
				keyID: 'new-draft-key',
				description: 'A fresh draft',
			})
		})

		test('an existing draft publishes a version and preserves its description', async () => {
			knownByFile = existingRecord()

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.findCoin).toEqual([ORIGIN])
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([
				{ coin, envelope: Uint8Array.of(1, 2, 3) },
			])
			expect(calls.seals[0]?.keyID).toBe('existing-key')
			expect(calls.seals[0]?.plaintext.meta.description).toBe(
				'Keep this description',
			)
			expect(calls.saves[0]?.record).toMatchObject({
				origin: ORIGIN,
				latestOutpoint: versionResult.outpoint,
				latestVersion: 4,
				keyID: 'existing-key',
				description: 'Keep this description',
			})
		})

		test('rejects conflicting and malformed draft selectors before wallet I/O', async () => {
			await expect(
				uploadCommand(htmlFile, { draft: ORIGIN, new: true, yes: true }),
			).rejects.toThrow('--new and --draft cannot be used together')
			await expect(
				uploadCommand(htmlFile, { draft: 'not-an-outpoint', yes: true }),
			).rejects.toThrow('--draft must be an outpoint')

			expect(calls.connectWallet).toEqual([])
			expect(calls.seals).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('a non-interactive publish requires --yes before sealing or publishing', async () => {
			expect(process.stdin.isTTY).not.toBe(true)

			await expect(uploadCommand(htmlFile, { new: true })).rejects.toThrow(
				'Re-run with --yes',
			)

			expect(calls.connectWallet).toHaveLength(1)
			expect(calls.seals).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('a publish failure never records a draft as successfully uploaded', async () => {
			genesisError = new Error('wallet rejected publish')

			await expect(
				uploadCommand(htmlFile, { new: true, yes: true }),
			).rejects.toThrow('wallet rejected publish')

			expect(calls.seals).toHaveLength(1)
			expect(calls.genesis).toHaveLength(1)
			expect(calls.saves).toEqual([])
		})
	})

	function existingRecord(): DraftRecord {
		return {
			origin: ORIGIN,
			keyID: 'existing-key',
			latestOutpoint: VERSION_OUTPOINT,
			latestVersion: 3,
			updatedAt: '2026-08-29T12:00:00.000Z',
			title: 'Existing draft',
			description: 'Keep this description',
		}
	}
}
