import { describe, expect, test } from 'bun:test'
import {
	PrivateKey,
	Script,
	type WalletInterface,
	type WalletOutput,
} from '@bsv/sdk'
import { CONTENT_TYPE, MAP_METADATA, TYPE_TAG } from '../src/constants.js'
import { MAGIC } from '../src/envelope.js'
import {
	type BitplanCoin,
	buildVersionTransfer,
	findCoinByOrigin,
	publishVersion,
} from '../src/ordinals.js'

const SOURCE_TXID = 'a'.repeat(64)
const SOURCE_OUTPOINT = `${SOURCE_TXID}.0`
const ORIGIN = `${SOURCE_TXID}_0`
const COIN_ID = 'bitplan-coin-1'
const FAKE_BEEF = [1, 2, 3]
const SELF_PUB = PrivateKey.fromRandom().toPublicKey().toString()

/** A tiny BPLN frame, enough to prove the envelope is what got inscribed. */
const ENVELOPE = Uint8Array.from([
	...MAGIC,
	0x02,
	0x04,
	0x00,
	0x00,
	0x00,
	0x7b,
	0x7d,
	0x00,
	0x01,
	0x02,
	0x03,
])

function makeCoin(): { coin: BitplanCoin; output: WalletOutput } {
	const output: WalletOutput = {
		outpoint: SOURCE_OUTPOINT,
		satoshis: 1,
		spendable: true,
		tags: [TYPE_TAG, `id:${COIN_ID}`, `origin:${ORIGIN}`],
		customInstructions: JSON.stringify({
			protocolID: [0, '1sat'],
			keyID: SOURCE_OUTPOINT,
		}),
	}
	return {
		output,
		coin: {
			id: COIN_ID,
			outpoint: ORIGIN,
			origin: ORIGIN,
			output,
		},
	}
}

function pushedBuffers(script: Script): Buffer[] {
	return script.chunks.flatMap((chunk) =>
		chunk.data && chunk.data.length > 0 ? [Buffer.from(chunk.data)] : [],
	)
}

function hasPush(script: Script, bytes: Uint8Array | string): boolean {
	const needle = Buffer.from(bytes)
	return pushedBuffers(script).some((buf) => buf.equals(needle))
}

function makeWallet(output: WalletOutput): WalletInterface {
	return {
		listOutputs: async () => ({
			outputs: [output],
			BEEF: FAKE_BEEF,
			totalOutputs: 1,
		}),
		getPublicKey: async () => ({ publicKey: SELF_PUB }),
	} as unknown as WalletInterface
}

describe('buildVersionTransfer', () => {
	test('locking script carries the envelope, content type, and MAP', async () => {
		const { coin, output } = makeCoin()
		const result = await buildVersionTransfer(
			makeWallet(output),
			coin,
			ENVELOPE,
		)
		if ('error' in result) {
			throw new Error(result.error)
		}

		const lockingScript = result.outputs?.[0]?.lockingScript
		expect(typeof lockingScript).toBe('string')
		const script = Script.fromHex(lockingScript as string)
		expect(hasPush(script, ENVELOPE)).toBe(true)
		expect(hasPush(script, CONTENT_TYPE)).toBe(true)
		const binary = Buffer.from(script.toBinary())
		for (const [key, value] of Object.entries(MAP_METADATA)) {
			expect(binary.includes(Buffer.from(key))).toBe(true)
			expect(binary.includes(Buffer.from(value))).toBe(true)
		}

		const tags = result.outputs?.[0]?.tags ?? []
		expect(tags).toContain(TYPE_TAG)
		expect(
			tags.some((tag) => tag === `origin:${ORIGIN}` || tag === 'origin'),
		).toBe(true)
	})
})

describe('publishVersion', () => {
	test('reinscribes through the local pipeline and does not send p-labels', async () => {
		const { coin, output } = makeCoin()
		const txid = 'b'.repeat(64)
		let createActionCalls = 0
		let seenLabels: string[] | undefined
		const wallet = {
			listOutputs: async () => ({
				outputs: [output],
				BEEF: FAKE_BEEF,
				totalOutputs: 1,
			}),
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
			createAction: async (args: { labels?: string[] }) => {
				createActionCalls += 1
				seenLabels = args.labels
				return { txid }
			},
			signAction: async () => ({ txid }),
		} as unknown as WalletInterface

		const result = await publishVersion(wallet, coin, ENVELOPE)
		expect(result.txid).toBe(txid)
		expect(result.origin).toBe(ORIGIN)
		expect(result.outpoint).toBe(`${txid}_0`)
		expect(createActionCalls).toBe(1)
		expect(
			seenLabels === undefined ||
				seenLabels.every((label) => !label.startsWith('p ')),
		).toBe(true)
	})
})

describe('paginated wallet search', () => {
	function fillerOutput(index: number): WalletOutput {
		const txid = index.toString(16).padStart(64, '0')
		return {
			outpoint: `${txid}.0`,
			satoshis: 1,
			spendable: true,
			tags: [TYPE_TAG, `id:filler-${index}`, `origin:${txid}_0`],
		}
	}

	function targetOutput(params: {
		txid: string
		vout: number
		coinId: string
		origin: string
	}): WalletOutput {
		return {
			outpoint: `${params.txid}.${params.vout}`,
			satoshis: 1,
			spendable: true,
			tags: [TYPE_TAG, `id:${params.coinId}`, `origin:${params.origin}`],
		}
	}

	function paginatedWallet(all: WalletOutput[], maxPageSize = 1000) {
		const calls: Array<{ limit?: number; offset?: number }> = []
		const wallet = {
			listOutputs: async (args: { limit?: number; offset?: number }) => {
				calls.push({ limit: args.limit, offset: args.offset })
				const limit = Math.min(args.limit ?? 10, maxPageSize)
				const offset = args.offset ?? 0
				return {
					outputs: all.slice(offset, offset + limit),
					BEEF: FAKE_BEEF,
					totalOutputs: all.length,
				}
			},
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
		} as unknown as WalletInterface
		return { wallet, calls }
	}

	test('findCoinByOrigin finds an origin past the first 1,000 outputs', async () => {
		const wantedOrigin = `${'c'.repeat(64)}_0`
		const all: WalletOutput[] = Array.from({ length: 1000 }, (_, index) =>
			fillerOutput(index + 1),
		)
		all.push(
			targetOutput({
				txid: 'c'.repeat(64),
				vout: 0,
				coinId: 'target-coin',
				origin: wantedOrigin,
			}),
		)
		// A wallet may serve fewer rows than requested while reporting more via
		// totalOutputs. The search must follow the reported total.
		const { wallet, calls } = paginatedWallet(all, 600)

		const coin = await findCoinByOrigin(wallet, wantedOrigin)

		expect(coin.origin).toBe(wantedOrigin)
		expect(coin.id).toBe('target-coin')
		expect(calls[0]).toEqual({ limit: 1000, offset: 0 })
		expect(calls[1]).toEqual({ limit: 1000, offset: 600 })
		for (const call of calls) {
			expect(call.limit ?? 0).toBeLessThanOrEqual(1000)
		}
	})

	test('findCoinByOrigin reports not-held after exhausting every page', async () => {
		const all = Array.from({ length: 5 }, (_, index) => fillerOutput(index + 1))
		const { wallet, calls } = paginatedWallet(all)

		await expect(
			findCoinByOrigin(wallet, `${'d'.repeat(64)}_0`),
		).rejects.toThrow(/does not hold a bitplan draft/)
		expect(calls).toHaveLength(1)
		expect(calls[0]).toEqual({ limit: 1000, offset: 0 })
	})

	test('publishVersion locates a post-publish coin on a later page', async () => {
		const { coin } = makeCoin()
		const txid = 'b'.repeat(64)
		const all: WalletOutput[] = Array.from({ length: 1000 }, (_, index) =>
			fillerOutput(index + 1),
		)
		all.push(
			targetOutput({ txid, vout: 2, coinId: 'fresh-coin', origin: ORIGIN }),
		)
		const pageCalls: Array<{ limit?: number; offset?: number }> = []
		const wallet = {
			listOutputs: async (args: {
				limit?: number
				offset?: number
				tags?: string[]
			}) => {
				// The transfer builder loads the spent coin by its `id:` tag;
				// serve it directly so the build succeeds and only the
				// post-publish search exercises pagination.
				if ((args.tags ?? []).some((tag) => tag.startsWith('id:'))) {
					return {
						outputs: [coin.output],
						BEEF: FAKE_BEEF,
						totalOutputs: 1,
					}
				}
				pageCalls.push({ limit: args.limit, offset: args.offset })
				const limit = args.limit ?? 10
				const offset = args.offset ?? 0
				return {
					outputs: all.slice(offset, offset + limit),
					BEEF: FAKE_BEEF,
					totalOutputs: all.length,
				}
			},
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
			createAction: async () => ({ txid }),
			signAction: async () => ({ txid }),
		} as unknown as WalletInterface

		const result = await publishVersion(wallet, coin, ENVELOPE)

		expect(result.outpoint).toBe(`${txid}_2`)
		expect(pageCalls[0]).toEqual({ limit: 1000, offset: 0 })
		expect(pageCalls[1]).toEqual({ limit: 1000, offset: 1000 })
		for (const call of pageCalls) {
			expect(call.limit ?? 0).toBeLessThanOrEqual(1000)
		}
	})

	test('post-publish lookup falls back when the basket has not caught up', async () => {
		const { coin } = makeCoin()
		const txid = 'b'.repeat(64)
		const wallet = {
			listOutputs: async () => ({
				outputs: [coin.output],
				BEEF: FAKE_BEEF,
				totalOutputs: 1,
			}),
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
			createAction: async () => ({ txid }),
			signAction: async () => ({ txid }),
		} as unknown as WalletInterface

		const result = await publishVersion(wallet, coin, ENVELOPE)

		expect(result.outpoint).toBe(`${txid}_0`)
	})

	test('post-publish lookup falls back when wallet lookup throws', async () => {
		const { coin } = makeCoin()
		const txid = 'b'.repeat(64)
		const wallet = {
			listOutputs: async (args: { tags?: string[] }) => {
				// Let the transfer builder load the spent coin; only the
				// post-publish search itself throws, exercising the fallback.
				if ((args.tags ?? []).some((tag) => tag.startsWith('id:'))) {
					return {
						outputs: [coin.output],
						BEEF: FAKE_BEEF,
						totalOutputs: 1,
					}
				}
				throw new Error('wallet offline')
			},
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
			createAction: async () => ({ txid }),
			signAction: async () => ({ txid }),
		} as unknown as WalletInterface

		const result = await publishVersion(wallet, coin, ENVELOPE)

		expect(result.outpoint).toBe(`${txid}_0`)
	})

	test('an inconsistent wallet cannot spin pagination forever', async () => {
		const repeated = Array.from({ length: 1000 }, (_, index) =>
			fillerOutput(index + 1),
		)
		const calls: Array<{ limit?: number; offset?: number }> = []
		const wallet = {
			// Ignores offset and reports more outputs than it serves: without a
			// stall guard this would page forever.
			listOutputs: async (args: { limit?: number; offset?: number }) => {
				calls.push({ limit: args.limit, offset: args.offset })
				return {
					outputs: repeated,
					BEEF: FAKE_BEEF,
					totalOutputs: 5000,
				}
			},
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
		} as unknown as WalletInterface

		await expect(
			findCoinByOrigin(wallet, `${'d'.repeat(64)}_0`),
		).rejects.toThrow(/does not hold a bitplan draft/)
		expect(calls.length).toBeLessThan(10)
	})
})
