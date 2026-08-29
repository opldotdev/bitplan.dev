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
	0x01,
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
