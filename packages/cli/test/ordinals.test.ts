import { describe, expect, test } from 'bun:test'
import {
	Beef,
	type CreateActionArgs,
	LockingScript,
	PrivateKey,
	Script,
	Transaction,
	type WalletInterface,
	type WalletOutput,
} from '@bsv/sdk'
import { CONTENT_TYPE, MAP_METADATA, TYPE_TAG } from '../src/constants.js'
import { MAGIC } from '../src/envelope.js'
import {
	type BitplanCoin,
	buildVersionTransfer,
	publishBatch,
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

describe('publishBatch', () => {
	test('creates two outputs with distinct receipts and unchanged envelope bytes in one action', async () => {
		let args: CreateActionArgs | undefined
		let calls = 0
		const txid = 'c'.repeat(64)
		const wallet = {
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
			createAction: async (value: CreateActionArgs) => {
				args = value
				calls++
				return { txid }
			},
		} as unknown as WalletInterface
		const second = Uint8Array.from([...ENVELOPE, 4])
		const results = await publishBatch(wallet, [
			{ envelope: ENVELOPE },
			{ envelope: second },
		])
		expect(calls).toBe(1)
		expect(args?.options?.randomizeOutputs).toBe(false)
		expect(results.map((r) => r.outpoint)).toEqual([`${txid}_0`, `${txid}_1`])
		expect(results.map((r) => r.origin)).toEqual(results.map((r) => r.outpoint))
		for (const [index, envelope] of [ENVELOPE, second].entries()) {
			const output = args!.outputs![index]!
			expect(output.satoshis).toBe(1)
			expect(hasPush(Script.fromHex(output.lockingScript), envelope)).toBe(true)
			expect(output.tags).toContain('origin')
			expect(JSON.parse(output.customInstructions!).keyID).toStartWith(
				'inscribe-',
			)
		}
		expect(args!.outputs![0]!.customInstructions).not.toBe(
			args!.outputs![1]!.customInstructions,
		)
	})

	test('merges separate input proofs, preserves both origins, and appends a new ordinal', async () => {
		const entries = [1, 2].map((index) => {
			const tx = new Transaction()
			tx.lockTime = index
			tx.addOutput({
				satoshis: 1,
				lockingScript: LockingScript.fromASM('OP_TRUE'),
			})
			const proof = new Beef()
			proof.mergeTransaction(tx)
			const { coin, output } = makeCoin()
			coin.id = `coin-${index}`
			coin.outpoint = coin.origin = `${tx.id('hex')}_0`
			output.outpoint = `${tx.id('hex')}.0`
			output.tags = [TYPE_TAG, `id:${coin.id}`, `origin:${coin.origin}`]
			return { coin, output, proof: proof.toBinary(), txid: tx.id('hex') }
		})
		let args: CreateActionArgs | undefined
		let calls = 0
		const txid = 'd'.repeat(64)
		const wallet = {
			listOutputs: async (request: { tags: string[] }) => {
				const entry = entries.find((e) =>
					request.tags.includes(`id:${e.coin.id}`),
				)!
				return { outputs: [entry.output], BEEF: entry.proof, totalOutputs: 1 }
			},
			getPublicKey: async () => ({ publicKey: SELF_PUB }),
			createAction: async (value: CreateActionArgs) => {
				args = value
				calls++
				return { txid }
			},
		} as unknown as WalletInterface
		const results = await publishBatch(wallet, [
			...entries.map(({ coin }) => ({ coin, envelope: ENVELOPE })),
			{ envelope: ENVELOPE },
		])
		expect(calls).toBe(1)
		expect(results.map((r) => r.origin)).toEqual([
			...entries.map((e) => e.coin.origin),
			`${txid}_2`,
		])
		expect(results.map((r) => r.outpoint)).toEqual([
			`${txid}_0`,
			`${txid}_1`,
			`${txid}_2`,
		])
		const merged = Beef.fromBinary(args!.inputBEEF!)
		for (const entry of entries)
			expect(merged.findTxid(entry.txid)).toBeDefined()
		expect(args!.inputs!.map((i) => i.outpoint)).toEqual(
			entries.map((e) => e.output.outpoint),
		)
	})

	test('rejects duplicate inputs and unsafe ordering before touching the wallet', async () => {
		const { coin } = makeCoin()
		const wallet = {} as WalletInterface
		await expect(publishBatch(wallet, [])).rejects.toThrow('at least one')
		await expect(
			publishBatch(wallet, [
				{ coin, envelope: ENVELOPE },
				{ coin, envelope: ENVELOPE },
			]),
		).rejects.toThrow('twice')
		await expect(
			publishBatch(wallet, [
				{ envelope: ENVELOPE },
				{ coin, envelope: ENVELOPE },
			]),
		).rejects.toThrow('precede')
		await expect(
			publishBatch(wallet, [{ envelope: new Uint8Array() }]),
		).rejects.toThrow('empty')
	})
})
