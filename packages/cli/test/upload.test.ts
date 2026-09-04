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
import { linkIdentityKey, linkUrl } from '../src/link.js'
import type { BitplanCoin, PublishResult } from '../src/ordinals.js'
import type { ConfigFile, DraftRecord } from '../src/state.js'

const CHILD_RUN = process.env.BITPLAN_UPLOAD_TEST_CHILD === '1'
const ORIGIN = `${'a'.repeat(64)}_0`
const VERSION_OUTPOINT = `${'b'.repeat(64)}_1`
const GENESIS_OUTPOINT = `${'c'.repeat(64)}_0`
const OWNER_IDENTITY_KEY =
	'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const PREVIOUS_OWNER_IDENTITY_KEY =
	'02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'

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
		sharedWith: string[]
	}

	const HOSTED = `h_${'A'.repeat(20)}`
	const HOSTED_SECRET = 'ab'.repeat(32)

	interface Calls {
		connectWallet: Array<string | undefined>
		findCoin: string[]
		genesis: Uint8Array[]
		version: Array<{ coin: BitplanCoin; envelope: Uint8Array }>
		relays: Array<{ beef: Uint8Array; txid: string }>
		seals: SealCall[]
		saves: Array<{ file: string; record: DraftRecord }>
		hostedCreates: Array<{
			siteUrl: string
			secretHex: string
			envelope: Uint8Array
		}>
		hostedAppends: Array<{
			siteUrl: string
			id: string
			secretHex: string
			envelope: Uint8Array
			baseVersion: number | null
		}>
	}

	const wallet = {} as WalletInterface
	const coin = {
		id: 'coin-1',
		origin: ORIGIN,
		outpoint: VERSION_OUTPOINT,
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
		origin: ORIGIN,
		outpoint: `${'d'.repeat(64)}_0`,
	}

	let calls: Calls
	let knownByFile: DraftRecord | undefined
	let knownByOrigin: DraftRecord | undefined
	let genesisError: Error | undefined
	let identityKeyCalls = 0
	let envelopeSenderIdentityKey = OWNER_IDENTITY_KEY
	let relayError: Error | undefined
	let stateSaveError: Error | undefined
	let policyFetchCalls: number
	let config: ConfigFile
	let ordfsContent:
		| {
				bytes: Uint8Array
				contentType: string
				origin: string | null
				outpoint: string | null
				sequence: number | null
		  }
		| undefined
	let tempDir: string
	let htmlFile: string

	mock.module('../src/state.js', () => ({
		findDraftByFile: () => knownByFile,
		findDraftByOrigin: () =>
			knownByOrigin ? { file: htmlFile, record: knownByOrigin } : undefined,
		saveDraftRecord: (file: string, record: DraftRecord) => {
			calls.saves.push({ file, record })
			if (stateSaveError) throw stateSaveError
		},
		readConfig: () => config,
	}))

	mock.module('../src/wallet.js', () => ({
		connectWallet: async (url: string | undefined) => {
			calls.connectWallet.push(url)
			return { wallet, url: url ?? 'http://wallet.test' }
		},
		identityKey: async () => {
			identityKeyCalls += 1
			return OWNER_IDENTITY_KEY
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
		MAX_SHARED_RECIPIENTS: 128,
		newKeyId: () => 'new-draft-key',
		normalizeIdentityKey: (value: string) => value.trim().toLowerCase(),
		parseEnvelope: () => ({
			header: { key: { keyID: 'adopted-key', sharedWith: [] } },
		}),
		openEnvelope: async () => ({
			header: {
				v: 2,
				key: {
					keyID: 'adopted-key',
					senderIdentityKey: envelopeSenderIdentityKey,
					sharedWith: ['adopted-reader'],
				},
			},
			plaintext: { meta: { description: 'Description from chain' } },
		}),
		sharedWith: (header: { key: { sharedWith?: string[] } }) =>
			header.key.sharedWith ?? [],
		sealEnvelope: async (
			_wallet: WalletInterface,
			plaintext: DraftPlaintext,
			keyID: string,
			sharedWith: string[] = [],
		) => {
			calls.seals.push({ plaintext, keyID, sharedWith })
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
			if (ordfsContent) return ordfsContent
			throw new Error('unexpected ORDFS request')
		},
	}))

	mock.module('../src/hosted.js', () => ({
		isHostedId: (value: string) => /^h_[A-Za-z0-9_-]{20}$/.test(value),
		newHostedSecret: () => HOSTED_SECRET,
		hostedViewerUrl: (id: string) => `https://bitplan.dev/d/${id}`,
		resolveSiteUrl: (override?: string) => override ?? 'https://bitplan.dev',
		assertHttpsSiteUrl: () => {},
		createHostedDraft: async (
			siteUrl: string,
			secretHex: string,
			envelope: Uint8Array,
		) => {
			calls.hostedCreates.push({ siteUrl, secretHex, envelope })
			return { id: HOSTED, version: 1 }
		},
		appendHostedVersion: async (
			siteUrl: string,
			id: string,
			secretHex: string,
			envelope: Uint8Array,
			baseVersion: number | null,
		) => {
			calls.hostedAppends.push({
				siteUrl,
				id,
				secretHex,
				envelope,
				baseVersion,
			})
			return { version: (baseVersion ?? 0) + 1 }
		},
	}))

	mock.module('../src/relay.js', () => ({
		relayBeef: async (beef: Uint8Array, txid: string) => {
			calls.relays.push({ beef, txid })
			if (relayError) throw relayError
			return { state: 'accepted', txStatus: 'SEEN_ON_NETWORK' }
		},
	}))

	const { estimateEnvelopeBytes, uploadCommand } = await import(
		'../src/commands/upload.js'
	)

	beforeEach(() => {
		calls = {
			connectWallet: [],
			findCoin: [],
			genesis: [],
			version: [],
			relays: [],
			seals: [],
			saves: [],
			hostedCreates: [],
			hostedAppends: [],
		}
		knownByFile = undefined
		knownByOrigin = undefined
		genesisError = undefined
		identityKeyCalls = 0
		envelopeSenderIdentityKey = OWNER_IDENTITY_KEY
		relayError = undefined
		stateSaveError = undefined
		policyFetchCalls = 0
		config = { shareWith: [] }
		ordfsContent = undefined
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-upload-test-'))
		htmlFile = path.join(tempDir, 'plan.html')
		fs.writeFileSync(
			htmlFile,
			'<!doctype html><html><title>Upload orchestration</title></html>',
		)
		spyOn(console, 'log').mockImplementation(() => {})
		spyOn(console, 'warn').mockImplementation(() => {})
		spyOn(globalThis, 'fetch').mockImplementation((async () => {
			policyFetchCalls += 1
			return new Response(
				JSON.stringify({
					policy: { miningFee: { satoshis: 100, bytes: 1000 } },
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			)
		}) as unknown as typeof fetch)
	})

	afterEach(() => {
		mock.restore()
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	describe('uploadCommand orchestration', () => {
		test('shares a new plan with configured default readers', async () => {
			config.shareWith = ['default-reader']

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual(['default-reader'])
		})

		test('shows the payload floor while keeping the wallet fee approval note', async () => {
			await uploadCommand(htmlFile, { new: true, yes: true })

			const printed = (
				console.log as unknown as { mock: { calls: Array<[string]> } }
			).mock.calls
				.map(([message]) => String(message))
				.join('\n')
			expect(printed).toContain('Network floor: ~')
			expect(printed).toContain(
				'Excludes transaction overhead; your wallet may charge more.',
			)
			expect(printed).toContain(
				'Fee:      Set by your wallet; review the amount in its approval prompt.',
			)
		})

		test('skips the policy request for hosted and quiet JSON uploads', async () => {
			await uploadCommand(htmlFile, { hosted: true, yes: true })
			await uploadCommand(htmlFile, { new: true, json: true, yes: true })

			expect(policyFetchCalls).toBe(0)
		})

		test('shared size estimates count the document once', () => {
			const plaintextBytes = 50_000
			const privateBytes = estimateEnvelopeBytes(plaintextBytes, 0)
			const sharedBytes = estimateEnvelopeBytes(plaintextBytes, 2)

			expect(sharedBytes).toBeGreaterThan(privateBytes)
			expect(sharedBytes).toBeLessThan(plaintextBytes * 2)
		})

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
			expect(calls.seals[0]?.sharedWith).toEqual([])
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

		test('adds shared readers and preserves them on later versions', async () => {
			const recipient =
				'02C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5'
			knownByFile = { ...existingRecord(), sharedWith: ['existing-reader'] }

			await uploadCommand(htmlFile, {
				shareWith: [recipient, recipient.toLowerCase()],
				yes: true,
			})

			expect(calls.seals[0]?.sharedWith).toEqual([
				'existing-reader',
				recipient.toLowerCase(),
			])
			expect(calls.saves[0]?.record.sharedWith).toEqual([
				'existing-reader',
				recipient.toLowerCase(),
			])
		})

		test('re-resolves a named team and replaces its prior member keys', async () => {
			const alice =
				'02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'
			const bob =
				'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
			config = {
				contacts: { alice, bob },
				teams: { dev: ['alice'] },
			}
			knownByFile = {
				...existingRecord(),
				sharedWith: [alice, bob],
				sharedWithRaw: [],
				shareWithRefs: ['dev'],
			}

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual([alice])
			expect(calls.saves[0]?.record).toMatchObject({
				sharedWith: [alice],
				sharedWithRaw: [],
				shareWithRefs: ['dev'],
			})
			expect(console.log).toHaveBeenCalledWith('Removed:  bob')
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining('older versions'),
			)
		})

		test('keeps legacy readers literal when no named provenance exists', async () => {
			const alice =
				'02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'
			const bob =
				'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
			config = {
				contacts: { alice, bob },
				teams: { dev: ['alice'] },
			}
			knownByFile = { ...existingRecord(), sharedWith: [alice, bob] }

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual([alice, bob])
			expect(calls.saves[0]?.record.sharedWithRaw).toEqual([alice, bob])
		})

		test('remembers named defaults on a new local draft', async () => {
			const alice =
				'02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9'
			config = {
				contacts: { alice },
				teams: { dev: ['alice'] },
				shareWithRefs: ['dev'],
			}

			await uploadCommand(htmlFile, { new: true, yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual([alice])
			expect(calls.saves[0]?.record.shareWithRefs).toEqual(['dev'])
			expect(calls.saves[0]?.record.sharedWithRaw).toEqual([])
		})

		test('--private removes readers from the new version', async () => {
			knownByFile = {
				...existingRecord(),
				sharedWith: ['existing-reader'],
				sharedWithRaw: [],
				shareWithRefs: ['dev'],
			}
			config = {
				contacts: { alice: OWNER_IDENTITY_KEY },
				teams: { dev: ['alice'] },
			}

			await uploadCommand(htmlFile, { private: true, yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual([])
			expect(calls.saves[0]?.record.sharedWith).toEqual([])
			expect(calls.saves[0]?.record.sharedWithRaw).toEqual([])
			expect(calls.saves[0]?.record.shareWithRefs).toBeUndefined()
		})

		test('adopts metadata and readers only from the wallet coin tip', async () => {
			knownByFile = {
				...existingRecord(),
				latestOutpoint: `${'e'.repeat(64)}_0`,
			}
			ordfsContent = {
				bytes: Uint8Array.of(1, 2, 3),
				contentType: 'application/x-bitplan',
				origin: ORIGIN,
				outpoint: VERSION_OUTPOINT,
				sequence: 3,
			}

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.keyID).toBe('adopted-key')
			expect(calls.seals[0]?.sharedWith).toEqual(['adopted-reader'])
			expect(calls.seals[0]?.plaintext.meta.description).toBe(
				'Description from chain',
			)
		})

		test('keeps the previous publisher as a reader after an ordinal handoff', async () => {
			envelopeSenderIdentityKey = PREVIOUS_OWNER_IDENTITY_KEY
			knownByFile = {
				...existingRecord(),
				latestOutpoint: `${'e'.repeat(64)}_0`,
			}
			ordfsContent = {
				bytes: Uint8Array.of(1, 2, 3),
				contentType: 'application/x-bitplan',
				origin: ORIGIN,
				outpoint: VERSION_OUTPOINT,
				sequence: 3,
			}

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual([
				'adopted-reader',
				PREVIOUS_OWNER_IDENTITY_KEY,
			])
			expect(calls.saves[0]?.record.sharedWithRaw).toEqual([
				'adopted-reader',
				PREVIOUS_OWNER_IDENTITY_KEY,
			])
		})

		test('does not reapply stale local team refs when adopting a newer tip', async () => {
			const alice =
				'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
			config = {
				contacts: { alice },
				teams: { dev: ['alice'] },
			}
			knownByFile = {
				...existingRecord(),
				latestOutpoint: `${'e'.repeat(64)}_0`,
				sharedWith: [alice],
				sharedWithRaw: [],
				shareWithRefs: ['dev'],
			}
			ordfsContent = {
				bytes: Uint8Array.of(1, 2, 3),
				contentType: 'application/x-bitplan',
				origin: ORIGIN,
				outpoint: VERSION_OUTPOINT,
				sequence: 3,
			}

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual(['adopted-reader'])
			expect(calls.saves[0]?.record.sharedWithRaw).toEqual(['adopted-reader'])
			expect(calls.saves[0]?.record.shareWithRefs).toBeUndefined()
		})

		test('refuses a stale ORDFS tip before inheriting its readers', async () => {
			knownByFile = {
				...existingRecord(),
				latestOutpoint: `${'e'.repeat(64)}_0`,
			}
			ordfsContent = {
				bytes: Uint8Array.of(1, 2, 3),
				contentType: 'application/x-bitplan',
				origin: ORIGIN,
				outpoint: `${'f'.repeat(64)}_0`,
				sequence: 2,
			}

			await expect(uploadCommand(htmlFile, { yes: true })).rejects.toThrow(
				'has not caught up',
			)
			expect(calls.seals).toEqual([])
			expect(calls.version).toEqual([])
		})

		test('does not create a redundant shared slot for the publishing wallet', async () => {
			await uploadCommand(htmlFile, {
				new: true,
				shareWith: [OWNER_IDENTITY_KEY],
				yes: true,
			})

			expect(calls.seals[0]?.sharedWith).toEqual([])
			expect(calls.saves[0]?.record.sharedWith).toEqual([])
		})

		test('rejects conflicting and malformed draft selectors before wallet I/O', async () => {
			await expect(
				uploadCommand(htmlFile, { draft: ORIGIN, new: true, yes: true }),
			).rejects.toThrow('--new and --draft cannot be used together')
			await expect(
				uploadCommand(htmlFile, { draft: 'not-an-outpoint', yes: true }),
			).rejects.toThrow('--draft must be an outpoint')
			await expect(
				uploadCommand(htmlFile, {
					private: true,
					shareWith: ['identity'],
					yes: true,
				}),
			).rejects.toThrow('--private and --share-with')

			expect(calls.connectWallet).toEqual([])
			expect(calls.seals).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('rejects an unknown named reader before wallet I/O', async () => {
			await expect(
				uploadCommand(htmlFile, { shareWith: ['missing-team'], yes: true }),
			).rejects.toThrow('Unknown contact or team')

			expect(calls.connectWallet).toEqual([])
			expect(calls.seals).toEqual([])
		})

		test('a non-interactive publish requires --yes before key prompts, sealing, or publishing', async () => {
			expect(process.stdin.isTTY).not.toBe(true)

			await expect(
				uploadCommand(htmlFile, {
					new: true,
					shareWith: [
						'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
					],
				}),
			).rejects.toThrow('Re-run with --yes')

			expect(calls.connectWallet).toHaveLength(1)
			expect(identityKeyCalls).toBe(0)
			expect(calls.seals).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.saves).toEqual([])
		})

		test('--json requires explicit confirmation before wallet I/O', async () => {
			await expect(
				uploadCommand(htmlFile, { new: true, json: true }),
			).rejects.toThrow('--json requires --yes')

			expect(calls.connectWallet).toEqual([])
		})

		test('--json prints one machine-readable publish result', async () => {
			await uploadCommand(htmlFile, { new: true, json: true, yes: true })

			expect(console.log).toHaveBeenCalledTimes(1)
			expect(console.log).toHaveBeenCalledWith(
				JSON.stringify(
					{
						published: true,
						kind: 'draft',
						origin: GENESIS_OUTPOINT,
						outpoint: GENESIS_OUTPOINT,
						version: 1,
						access: { mode: 'wallet-only', readers: [] },
						changes: { added: [], removed: [] },
						stateSaved: true,
						relay: { state: 'accepted', txStatus: 'SEEN_ON_NETWORK' },
						viewer: `https://bitplan.dev/d/${GENESIS_OUTPOINT}`,
						link: null,
					},
					null,
					2,
				),
			)
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

		test('reports a successful publish even when local state cannot be saved', async () => {
			stateSaveError = new Error('disk full')

			await uploadCommand(htmlFile, { new: true, yes: true })

			expect(calls.genesis).toHaveLength(1)
			expect(console.log).toHaveBeenCalledWith('Published a new draft.')
			expect(console.log).toHaveBeenCalledWith(`Outpoint: ${GENESIS_OUTPOINT}`)
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining('local state was not saved'),
			)
		})

		test('relays wallet BEEF by default without changing publish success semantics', async () => {
			await uploadCommand(htmlFile, { new: true, yes: true })

			expect(calls.relays).toEqual([
				{ beef: genesisBeef, txid: genesisResult.txid },
			])
			expect(console.log).toHaveBeenCalledWith(
				'Relay:    1Sat accepted (SEEN_ON_NETWORK)',
			)

			relayError = new Error('relay unavailable')
			await uploadCommand(htmlFile, { new: true, yes: true })
			expect(calls.saves).toHaveLength(2)
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringContaining('wallet published the draft'),
			)
		})

		test('relay: false skips the 1Sat notification', async () => {
			await uploadCommand(htmlFile, { new: true, relay: false, yes: true })

			expect(calls.relays).toEqual([])
		})

		test('--link and --private cannot be used together', async () => {
			await expect(
				uploadCommand(htmlFile, { link: true, private: true, yes: true }),
			).rejects.toThrow('--link and --private cannot be used together.')
			expect(calls.seals).toEqual([])
		})

		test('--link mints a reader slot and prints the URL', async () => {
			await uploadCommand(htmlFile, { new: true, link: true, yes: true })

			const linkKey = calls.saves[0]?.record.linkKey
			expect(linkKey).toMatch(/^[0-9a-f]{64}$/)
			expect(calls.seals[0]?.sharedWith).toEqual([
				linkIdentityKey(linkKey ?? ''),
			])
			expect(console.log).toHaveBeenCalledWith(
				'Access:   This wallet + reader link',
			)
			expect(console.log).toHaveBeenCalledWith(
				`Link:     ${linkUrl(`https://bitplan.dev/d/${GENESIS_OUTPOINT}`, linkKey ?? '')}`,
			)
			expect(console.log).toHaveBeenCalledWith(
				'          Anyone with this link can read this version and later versions that keep it.',
			)
			expect(console.log).toHaveBeenCalledWith(
				'          Publish with --private to stop.',
			)
		})

		test('keeps an existing reader link on later versions until --private', async () => {
			const linkKey = '11'.repeat(32)
			const identity = linkIdentityKey(linkKey)
			knownByFile = {
				...existingRecord(),
				linkKey,
				sharedWith: ['existing-reader', identity],
			}

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual(['existing-reader', identity])
			expect(calls.saves[0]?.record.linkKey).toBe(linkKey)
			expect(console.log).toHaveBeenCalledWith(
				'Access:   This wallet + 1 shared identity + reader link',
			)
			expect(console.log).toHaveBeenCalledWith(
				`Link:     ${linkUrl(`https://bitplan.dev/d/${ORIGIN}`, linkKey)}`,
			)
		})

		test('--private drops the reader link from the new version', async () => {
			const linkKey = '11'.repeat(32)
			const identity = linkIdentityKey(linkKey)
			knownByFile = {
				...existingRecord(),
				linkKey,
				sharedWith: ['existing-reader', identity],
			}

			await uploadCommand(htmlFile, { private: true, yes: true })

			expect(calls.seals[0]?.sharedWith).toEqual([])
			expect(calls.saves[0]?.record.linkKey).toBeUndefined()
			expect(console.log).toHaveBeenCalledWith(
				'Removed:  existing-reader, reader link',
			)
		})

		test('--link on an adopted draft with no local record mints a fresh link', async () => {
			ordfsContent = {
				bytes: Uint8Array.of(1, 2, 3),
				contentType: 'application/x-bitplan',
				origin: ORIGIN,
				outpoint: VERSION_OUTPOINT,
				sequence: 3,
			}

			await uploadCommand(htmlFile, { draft: ORIGIN, link: true, yes: true })

			expect(calls.saves[0]?.record.linkKey).toMatch(/^[0-9a-f]{64}$/)
			expect(console.log).toHaveBeenCalledWith(
				'Note: this draft had no local link secret; earlier links stop working on this version.',
			)
			expect(console.log).toHaveBeenCalledWith(
				expect.stringMatching(/^Link: {5}https:\/\/bitplan\.dev\/d\/.*#k=/),
			)
		})

		test('--hosted on a chain draft is refused', async () => {
			knownByFile = existingRecord()

			await expect(
				uploadCommand(htmlFile, { hosted: true, yes: true }),
			).rejects.toThrow(
				'This draft is already on the chain; publish it there or use --new --hosted for a separate hosted copy.',
			)
			expect(calls.connectWallet).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.hostedCreates).toEqual([])
		})

		test('--hosted publishes a new hosted draft without a chain transaction', async () => {
			await uploadCommand(htmlFile, { hosted: true, yes: true })

			expect(calls.findCoin).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.version).toEqual([])
			expect(calls.relays).toEqual([])
			expect(calls.hostedCreates).toEqual([
				{
					siteUrl: 'https://bitplan.dev',
					secretHex: HOSTED_SECRET,
					envelope: Uint8Array.of(1, 2, 3),
				},
			])
			expect(calls.saves[0]?.record).toMatchObject({
				origin: HOSTED,
				latestOutpoint: HOSTED,
				latestVersion: 1,
				hostedSecret: HOSTED_SECRET,
			})
			expect(console.log).toHaveBeenCalledWith('Published a hosted draft.')
			expect(console.log).toHaveBeenCalledWith(
				`Hosted:   ${HOSTED}  version 1  (not on chain)`,
			)
		})

		test('a hosted local record updates without --hosted', async () => {
			knownByFile = {
				...existingRecord(),
				origin: HOSTED,
				latestOutpoint: HOSTED,
				hostedSecret: HOSTED_SECRET,
			}

			await uploadCommand(htmlFile, { yes: true })

			expect(calls.findCoin).toEqual([])
			expect(calls.genesis).toEqual([])
			expect(calls.hostedCreates).toEqual([])
			expect(calls.hostedAppends).toEqual([
				{
					siteUrl: 'https://bitplan.dev',
					id: HOSTED,
					secretHex: HOSTED_SECRET,
					envelope: Uint8Array.of(1, 2, 3),
					baseVersion: 3,
				},
			])
			expect(calls.saves[0]?.record).toMatchObject({
				origin: HOSTED,
				latestOutpoint: HOSTED,
				latestVersion: 4,
				hostedSecret: HOSTED_SECRET,
			})
			expect(console.log).toHaveBeenCalledWith(
				'Published a new hosted version.',
			)
		})

		test('a hosted record without a local secret cannot be updated', async () => {
			knownByFile = {
				...existingRecord(),
				origin: HOSTED,
				latestOutpoint: HOSTED,
			}

			await expect(uploadCommand(htmlFile, { yes: true })).rejects.toThrow(
				'No secret for this hosted draft in the local drafts map; it cannot be updated from this machine.',
			)
			expect(calls.hostedAppends).toEqual([])
			expect(calls.seals).toEqual([])
		})

		test('--json includes the reader link URL next to viewer', async () => {
			await uploadCommand(htmlFile, {
				new: true,
				link: true,
				json: true,
				yes: true,
			})

			expect(console.log).toHaveBeenCalledTimes(1)
			const printed = String(
				(
					console.log as unknown as {
						mock: { calls: Array<[string]> }
					}
				).mock.calls[0]?.[0],
			)
			const payload = JSON.parse(printed) as {
				link: string
				viewer: string
				access: { mode: string; readers: string[] }
			}
			expect(payload.viewer).toBe(`https://bitplan.dev/d/${GENESIS_OUTPOINT}`)
			expect(payload.link.startsWith(`${payload.viewer}#k=`)).toBe(true)
			expect(payload.access.mode).toBe('shared')
			expect(payload.access.readers).toHaveLength(1)
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
