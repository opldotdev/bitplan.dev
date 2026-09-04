import { expect, test } from 'bun:test'
import path from 'node:path'
import type { WalletInterface } from '@bsv/sdk'
import type { DraftPlaintext } from '../src/envelope.js'
import type { BitplanCoin, PublishResult } from '../src/ordinals.js'
import type { ConfigFile, DraftRecord } from '../src/state.js'

const CHILD_RUN = process.env.BITPLAN_CATALOG_ORDERING_CHILD === '1'

if (!CHILD_RUN) {
	test('catalog ordering passes in an isolated module-mock process', () => {
		const result = Bun.spawnSync(['bun', 'test', import.meta.path], {
			cwd: path.resolve(import.meta.dir, '../../..'),
			env: {
				...process.env,
				BITPLAN_CATALOG_ORDERING_CHILD: '1',
			},
			stderr: 'pipe',
			stdout: 'pipe',
		})
		const output = `${result.stdout.toString()}${result.stderr.toString()}`
		expect(result.exitCode, output).toBe(0)
	})
} else {
	const {
		afterEach,
		beforeEach,
		describe: describeChild,
		expect: expectChild,
		mock,
		spyOn,
		test: testChild,
	} = await import('bun:test')
	const fs = (await import('node:fs')).default
	const os = (await import('node:os')).default
	const nodePath = (await import('node:path')).default
	const { Buffer } = await import('node:buffer')

	const HOSTED = `h_${'A'.repeat(20)}`
	const HOSTED_SECRET = 'ab'.repeat(32)
	const GENESIS_OUTPOINT = `${'c'.repeat(64)}_0`
	const OWNER_IDENTITY_KEY =
		'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
	const ORIGIN = `${'a'.repeat(64)}_0`
	const VERSION_OUTPOINT = `${'b'.repeat(64)}_1`
	const _CATALOG_CONTENT_TYPE = 'application/x-bitplan-catalog'

	const order: string[] = []
	let knownByFile: DraftRecord | undefined
	let draftsForSync: Record<string, DraftRecord> = {}
	let config: ConfigFile = {}
	let tempDir: string
	let htmlFile: string
	let failRedirect = false
	let failSave = false
	let savedRecord: DraftRecord | undefined

	const catalogRoot = Uint8Array.from(
		Array.from({ length: 32 }, (_, index) => index + 1),
	)
	const fakeWallet = {
		async getPublicKey() {
			return { publicKey: OWNER_IDENTITY_KEY }
		},
		async createHmac() {
			return { hmac: Array.from(catalogRoot) }
		},
		async encrypt(args: { plaintext: number[] }) {
			return { ciphertext: args.plaintext }
		},
		async decrypt(args: { ciphertext: number[] }) {
			return { plaintext: args.ciphertext }
		},
	} as unknown as WalletInterface

	const coin = {
		id: 'coin-1',
		origin: ORIGIN,
		outpoint: VERSION_OUTPOINT,
		output: {},
	} as BitplanCoin
	const genesisResult: PublishResult = {
		txid: 'c'.repeat(64),
		beef: Uint8Array.of(4, 5, 6),
		origin: GENESIS_OUTPOINT,
		outpoint: GENESIS_OUTPOINT,
	}

	mock.module('../src/state.js', () => ({
		findDraftByFile: () => knownByFile,
		findDraftByOrigin: (origin: string) =>
			knownByFile && knownByFile.origin === origin
				? { filePath: htmlFile, record: knownByFile }
				: undefined,
		findDraftByHostedOrigin: (hostedOrigin: string) =>
			knownByFile && knownByFile.hostedOrigin === hostedOrigin
				? { filePath: htmlFile, record: knownByFile }
				: undefined,
		saveDraftRecord: (_file: string, record: DraftRecord) => {
			if (failSave) throw new Error('disk full')
			order.push('save')
			savedRecord = record
		},
		readDrafts: () => ({ files: { ...draftsForSync } }),
		readConfig: () => config,
	}))

	mock.module('../src/wallet.js', () => ({
		connectWallet: async () => ({
			wallet: fakeWallet,
			url: 'http://wallet.test',
		}),
		identityKey: async () => OWNER_IDENTITY_KEY,
		errorMessage: (error: unknown) =>
			error instanceof Error ? error.message : String(error),
	}))

	mock.module('../src/ordinals.js', () => ({
		findCoinByOrigin: async () => coin,
		publishGenesis: async () => genesisResult,
		publishVersion: async (
			_wallet: WalletInterface,
			_publishedCoin: BitplanCoin,
		) => ({
			txid: 'd'.repeat(64),
			origin: GENESIS_OUTPOINT,
			outpoint: VERSION_OUTPOINT,
		}),
	}))

	mock.module('../src/envelope.js', () => ({
		MAX_SHARED_RECIPIENTS: 128,
		newKeyId: () => 'new-draft-key',
		normalizeIdentityKey: (value: string) => value.trim().toLowerCase(),
		openEnvelope: async () => ({
			header: {
				v: 2,
				key: { keyID: 'k', senderIdentityKey: OWNER_IDENTITY_KEY },
			},
			plaintext: { meta: { description: null } },
		}),
		sharedWith: () => [],
		sealEnvelope: async (
			_wallet: WalletInterface,
			_plaintext: DraftPlaintext,
		) => Uint8Array.of(1, 2, 3),
	}))

	mock.module('../src/htmlPolicy.js', () => ({
		validateHtml: () => ({
			ok: true,
			errors: [],
			warnings: [],
			title: 'Catalog ordering',
		}),
	}))

	mock.module('../src/git.js', () => ({
		collectGitMetadata: () => ({
			repoOrg: 'acme',
			repoName: 'plans',
			repoHost: 'github.com',
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
		fetchLatest: async () => ({
			bytes: Uint8Array.of(9, 9, 9),
			contentType: 'application/x-bitplan',
			origin: HOSTED,
			outpoint: HOSTED,
			sequence: 0,
		}),
		originFromReference: (reference: string) => reference,
	}))

	mock.module('../src/hosted.js', () => ({
		isHostedId: (value: string) => /^h_[A-Za-z0-9_-]{20}$/.test(value),
		newHostedSecret: () => HOSTED_SECRET,
		hostedViewerUrl: (id: string) => `https://bitplan.dev/d/${id}`,
		resolveSiteUrl: (override?: string) => override ?? 'https://bitplan.dev',
		assertHttpsSiteUrl: () => {},
		createHostedDraft: async () => {
			order.push('publish')
			return { id: HOSTED, version: 1 }
		},
		appendHostedVersion: async () => {
			order.push('publish')
			return { version: 4 }
		},
		readHostedRecord: async () => ({ versions: 1, origin: null }),
		markHostedInscribed: async () => {
			if (failRedirect) throw new Error('redirect down')
			order.push('redirect')
		},
	}))

	mock.module('../src/relay.js', () => ({
		relayBeef: async () => ({ state: 'accepted', txStatus: 'SEEN_ON_NETWORK' }),
	}))

	const { uploadCommand } = await import('../src/commands/upload.js')
	const { inscribeCommand } = await import('../src/commands/inscribe.js')
	const { catalogSyncCommand } = await import('../src/commands/catalog.js')

	function catalogFetch(script: Response[]): void {
		spyOn(globalThis, 'fetch').mockImplementation((async (
			input: string | URL | Request,
			init?: RequestInit,
		) => {
			const url = input instanceof Request ? input.url : String(input)
			const method = (
				init?.method ?? (input instanceof Request ? input.method : 'GET')
			).toUpperCase()
			if (url === 'https://arcade.1sat.app/policy' && method === 'GET') {
				return new Response(
					JSON.stringify({
						policy: { miningFee: { satoshis: 100, bytes: 1000 } },
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } },
				)
			}
			if (url.includes('/api/catalog/') && method === 'PUT') {
				order.push('sync')
			}
			const next = script.shift()
			if (!next) throw new Error(`unexpected fetch ${method} ${url}`)
			return next
		}) as typeof fetch)
	}

	function notFound(): Response {
		return new Response('missing', { status: 404 })
	}

	function putOk(version: number, created: boolean): Response {
		return new Response(
			JSON.stringify({
				id: 'catalog',
				version,
				updatedAt: '2026-09-03T00:00:00.000Z',
				created,
			}),
			{ status: created ? 201 : 200 },
		)
	}

	function hostedRecord(): DraftRecord {
		return {
			origin: HOSTED,
			keyID: 'hosted-key',
			latestOutpoint: HOSTED,
			latestVersion: 3,
			updatedAt: '2026-09-01T00:00:00.000Z',
			title: 'Hosted draft',
			description: 'Hosted description',
			repoHost: 'github.com',
			repoOrg: 'acme',
			repoName: 'plans',
			hostedSecret: HOSTED_SECRET,
		}
	}

	beforeEach(() => {
		order.length = 0
		knownByFile = undefined
		draftsForSync = {}
		config = {}
		failRedirect = false
		failSave = false
		savedRecord = undefined
		tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'bitplan-catalog-ord-'))
		htmlFile = nodePath.join(tempDir, 'plan.html')
		fs.writeFileSync(
			htmlFile,
			'<!doctype html><html><title>Catalog ordering</title></html>',
		)
		spyOn(console, 'log').mockImplementation(() => {})
		spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		mock.restore()
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	describeChild('best-effort command ordering', () => {
		testChild('hosted upload: publish -> save -> catalog sync', async () => {
			knownByFile = hostedRecord()
			draftsForSync = { [htmlFile]: hostedRecord() }
			catalogFetch([notFound(), putOk(1, true)])

			await uploadCommand(htmlFile, { yes: true })

			expectChild(order).toEqual(['publish', 'save', 'sync'])
		})

		testChild(
			'hosted upload still succeeds when catalog sync fails',
			async () => {
				knownByFile = hostedRecord()
				draftsForSync = { [htmlFile]: hostedRecord() }
				catalogFetch([new Response('down', { status: 503 })])

				await uploadCommand(htmlFile, { yes: true })

				expectChild(order).toEqual(['publish', 'save'])
				expectChild(console.warn).toHaveBeenCalledWith(
					expectChild.stringContaining('bunx bitplan catalog sync'),
				)
			},
		)

		testChild('inscribe: redirect -> save -> catalog transition', async () => {
			knownByFile = hostedRecord()
			catalogFetch([notFound(), putOk(1, true)])

			await inscribeCommand(HOSTED, { yes: true })

			expectChild(order).toEqual(['redirect', 'save', 'sync'])
			const putCall = (
				globalThis.fetch as unknown as {
					mock: { calls: Array<[string, RequestInit?]> }
				}
			).mock.calls.find(
				([input, init]) =>
					String(input).includes('/api/catalog/') &&
					(init?.method ?? 'GET').toUpperCase() === 'PUT',
			)
			expectChild(putCall).toBeDefined()
			const body = putCall?.[1]?.body as Uint8Array
			const catalog = JSON.parse(Buffer.from(body).toString('utf8')) as {
				entries: Array<Record<string, unknown>>
			}
			expectChild(catalog.entries).toHaveLength(1)
			expectChild(catalog.entries[0]).toMatchObject({
				id: HOSTED,
				state: 'inscribed',
				chainOrigin: GENESIS_OUTPOINT,
			})
		})

		testChild(
			'inscribe still succeeds when the catalog transition fails',
			async () => {
				knownByFile = hostedRecord()
				catalogFetch([new Response('down', { status: 503 })])

				await inscribeCommand(HOSTED, { yes: true })

				expectChild(order).toEqual(['redirect', 'save'])
				expectChild(console.warn).toHaveBeenCalledWith(
					expectChild.stringContaining('bunx bitplan catalog sync'),
				)
			},
		)

		testChild(
			'catalog sync command prints JSON with the synced version',
			async () => {
				draftsForSync = { [htmlFile]: hostedRecord() }
				catalogFetch([notFound(), putOk(1, true)])

				await catalogSyncCommand({
					json: true,
					siteUrl: 'https://bitplan.dev',
				})

				expectChild(console.log).toHaveBeenCalledTimes(1)
				const printed = String(
					(
						console.log as unknown as {
							mock: { calls: Array<[string]> }
						}
					).mock.calls[0]?.[0],
				)
				const payload = JSON.parse(printed) as {
					synced: boolean
					version: number
					created: boolean
				}
				expectChild(payload).toMatchObject({
					synced: true,
					version: 1,
					created: true,
				})
			},
		)

		testChild(
			'inscribe redirect failure still saves, catalogs, and reports the origin',
			async () => {
				knownByFile = hostedRecord()
				failRedirect = true
				catalogFetch([notFound(), putOk(1, true)])

				await inscribeCommand(HOSTED, { yes: true })

				expectChild(order).toEqual(['save', 'sync'])
				expectChild(savedRecord?.origin).toBe(GENESIS_OUTPOINT)
				expectChild(savedRecord?.hostedOrigin).toBe(HOSTED)
				expectChild(savedRecord?.hostedSecret).toBe(HOSTED_SECRET)
				const warnings = (
					console.warn as unknown as { mock: { calls: Array<[string]> } }
				).mock.calls.map(([message]) => String(message))
				expectChild(warnings.join('\n')).toMatch(/do not reinscribe/i)
				expectChild(warnings.join('\n')).toContain(GENESIS_OUTPOINT)
				expectChild(warnings.join('\n')).toMatch(/bunx bitplan inscribe/)
				const printed = (
					console.log as unknown as { mock: { calls: Array<[string]> } }
				).mock.calls.map(([message]) => String(message))
				expectChild(printed.join('\n')).toContain(GENESIS_OUTPOINT)
			},
		)

		testChild(
			'inscribe save failure still catalogs and reports the origin as JSON',
			async () => {
				knownByFile = hostedRecord()
				failSave = true
				catalogFetch([notFound(), putOk(1, true)])

				await inscribeCommand(HOSTED, { yes: true, json: true })

				expectChild(order).toEqual(['redirect', 'sync'])
				const warnings = (
					console.warn as unknown as { mock: { calls: Array<[string]> } }
				).mock.calls.map(([message]) => String(message))
				expectChild(warnings.join('\n')).toMatch(/do not reinscribe/i)
				expectChild(warnings.join('\n')).toContain(GENESIS_OUTPOINT)
				expectChild(warnings.join('\n')).not.toContain(
					'bunx bitplan catalog sync',
				)
				expectChild(warnings.join('\n')).toMatch(/hosted link.*redirect/i)
				expectChild(warnings.join('\n')).toMatch(/disk.*permissions/i)
				// JSON stdout stays pure: exactly one JSON log with the origin.
				expectChild(console.log).toHaveBeenCalledTimes(1)
				const printed = String(
					(
						console.log as unknown as {
							mock: { calls: Array<[string]> }
						}
					).mock.calls[0]?.[0],
				)
				const payload = JSON.parse(printed) as { origin: string }
				expectChild(payload.origin).toBe(GENESIS_OUTPOINT)
				expectChild(printed).not.toMatch(/do not reinscribe/i)
			},
		)

		testChild(
			'hosted upload with a failed local save skips the catalog sync',
			async () => {
				knownByFile = hostedRecord()
				draftsForSync = { [htmlFile]: hostedRecord() }
				failSave = true
				// Any catalog PUT would push 'sync'; the script fails fast if
				// the command wrongly attempts a catalog write.
				catalogFetch([])

				await uploadCommand(htmlFile, { yes: true })

				expectChild(order).toEqual(['publish'])
				const warnings = (
					console.warn as unknown as { mock: { calls: Array<[string]> } }
				).mock.calls.map(([message]) => String(message))
				expectChild(warnings.join('\n')).toMatch(/catalog sync was skipped/)
			},
		)
	})
}
