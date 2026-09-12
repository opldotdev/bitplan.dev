import { describe, expect, test } from 'bun:test'
import {
	type CreateActionArgs,
	PrivateKey,
	ProtoWallet,
	Script,
	type WalletInterface,
} from '@bsv/sdk'
import { openEnvelope as openWebEnvelope } from '../../../apps/web/src/lib/envelope'
import {
	type DraftPlaintext,
	frameEnvelope,
	parseEnvelope,
	sealEnvelope,
} from '../src/envelope.js'
import { publishBatch } from '../src/ordinals.js'

const PLAINTEXT: DraftPlaintext = {
	html: '<!doctype html><title>Cross-reader fixture</title>',
	meta: {
		cliVersion: 'test',
		createdAt: '2026-08-29T00:00:00.000Z',
		description: null,
		fileSha256: '00',
		gitBranch: null,
		gitCommitSha: null,
		gitCommitSubject: null,
		gitDirty: null,
		repoHost: null,
		repoName: null,
		repoOrg: null,
		title: 'Cross-reader fixture',
	},
}

describe('CLI and website envelope compatibility', () => {
	test('both batch outputs still decrypt through the unchanged website reader', async () => {
		const owner = new ProtoWallet(new PrivateKey(31))
		const reader = new ProtoWallet(new PrivateKey(32))
		const identity = (await reader.getPublicKey({ identityKey: true }))
			.publicKey
		const payloads = [
			PLAINTEXT,
			{ ...PLAINTEXT, html: '<title>Annotation fixture</title>' },
		]
		const envelopes = await Promise.all(
			payloads.map((payload, index) =>
				sealEnvelope(owner, payload, `batch-stream-${index}`, [identity]),
			),
		)
		let args: CreateActionArgs | undefined
		const wallet = {
			getPublicKey: owner.getPublicKey.bind(owner),
			createAction: async (value: CreateActionArgs) => {
				args = value
				return { txid: 'e'.repeat(64) }
			},
		} as unknown as WalletInterface
		await publishBatch(
			wallet,
			envelopes.map((envelope) => ({ envelope })),
		)
		for (const [index, output] of args!.outputs!.entries()) {
			const pushed = Script.fromHex(output.lockingScript).chunks.find(
				(chunk) =>
					chunk.data &&
					Buffer.from(chunk.data).equals(Buffer.from(envelopes[index]!)),
			)
			expect(pushed).toBeDefined()
			const opened = await openWebEnvelope(
				reader,
				Uint8Array.from(pushed!.data!),
			)
			expect(opened.plaintext).toEqual(payloads[index]!)
		}
	})

	test('the website opens private and shared envelopes produced by the CLI', async () => {
		const owner = new ProtoWallet(new PrivateKey(21))
		const recipient = new ProtoWallet(new PrivateKey(22))
		const recipientIdentity = (
			await recipient.getPublicKey({ identityKey: true })
		).publicKey

		const privateEnvelope = await sealEnvelope(
			owner,
			PLAINTEXT,
			'private-fixture',
		)
		const sharedEnvelope = await sealEnvelope(
			owner,
			PLAINTEXT,
			'shared-fixture',
			[recipientIdentity],
		)

		expect((await openWebEnvelope(owner, privateEnvelope)).plaintext).toEqual(
			PLAINTEXT,
		)
		expect(
			(await openWebEnvelope(recipient, sharedEnvelope)).plaintext,
		).toEqual(PLAINTEXT)

		const parsed = parseEnvelope(sharedEnvelope)
		if (parsed.header.v !== 2) throw new Error('expected shared header')
		const tamperedHeader = structuredClone(parsed.header)
		const recipientSlot = tamperedHeader.key.slots[1]
		if (!recipientSlot) throw new Error('expected recipient slot')
		recipientSlot.identityKey = new PrivateKey(23).toPublicKey().toString()
		await expect(
			openWebEnvelope(owner, frameEnvelope(tamperedHeader, parsed.ciphertext)),
		).rejects.toThrow(/header does not match/)
	})
})
