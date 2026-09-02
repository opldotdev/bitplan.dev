import { describe, expect, test } from 'bun:test'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import {
	type DraftPlaintext,
	ENVELOPE_WIRE_VERSION,
	frameEnvelope,
	MAGIC,
	MAX_SHARED_RECIPIENTS,
	newKeyId,
	normalizeIdentityKey,
	openEnvelope,
	parseEnvelope,
	SHARED_ENVELOPE_VERSION,
	sealEnvelope,
	sharedWith,
} from '../src/envelope.js'
import { CliError } from '../src/errors.js'
import { createMockWallet } from './mockWallet.js'

const PLAINTEXT: DraftPlaintext = {
	meta: {
		title: 'Migration plan',
		description: 'phase one',
		repoOrg: 'b-open-io',
		repoName: 'bitplan.dev',
		repoHost: 'github.com',
		gitBranch: 'master',
		gitCommitSha: 'a'.repeat(40),
		gitCommitSubject: 'feat: something',
		gitDirty: false,
		cliVersion: '0.0.1',
		fileSha256: 'b'.repeat(64),
		createdAt: '2026-01-01T00:00:00.000Z',
	},
	html: '<!doctype html><title>Migration plan</title><p>hello</p>',
}

const OWNER_IDENTITY = new PrivateKey(1).toPublicKey().toString()
const RECIPIENT_IDENTITY = new PrivateKey(2).toPublicKey().toString()

function validSharedHeader() {
	return {
		v: 2 as const,
		key: {
			mode: 'brc2-multi' as const,
			protocolID: [2, 'bitplan'] as [number, string],
			keyID: 'key-1',
			payloadLength: 48,
			senderIdentityKey: OWNER_IDENTITY,
			slots: [{ identityKey: OWNER_IDENTITY, offset: 48, length: 80 }],
		},
	}
}

describe('envelope round trip', () => {
	test('seals and opens through the wallet', async () => {
		const { wallet, calls } = createMockWallet()
		const keyID = newKeyId()

		const envelope = await sealEnvelope(wallet, PLAINTEXT, keyID)
		const opened = await openEnvelope(wallet, envelope)

		expect(opened.plaintext).toEqual(PLAINTEXT)
		expect(opened.header.key.keyID).toBe(keyID)
		expect(calls.encrypt).toHaveLength(1)
		expect(calls.decrypt).toHaveLength(1)
	})

	test('sealEnvelope with no recipients writes one publisher slot', async () => {
		const identityKey =
			'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
		const { wallet } = createMockWallet(identityKey)
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')

		expect(envelope[4]).toBe(ENVELOPE_WIRE_VERSION)
		const parsed = parseEnvelope(envelope)
		expect(parsed.header.v).toBe(2)
		expect(parsed.header.key.mode).toBe('brc2-multi')
		expect(parsed.header.key.slots).toHaveLength(1)
		expect(parsed.header.key.slots[0]?.identityKey).toBe(
			normalizeIdentityKey(identityKey),
		)
		expect(parsed.header.key.senderIdentityKey).toBe(
			normalizeIdentityKey(identityKey),
		)
		expect((await openEnvelope(wallet, envelope)).plaintext).toEqual(PLAINTEXT)
	})

	test('reuses the keyID given, so every version of a draft shares one', async () => {
		const { wallet } = createMockWallet()
		const first = parseEnvelope(
			await sealEnvelope(wallet, PLAINTEXT, 'draft-k'),
		)
		const second = parseEnvelope(
			await sealEnvelope(wallet, PLAINTEXT, 'draft-k'),
		)
		expect(first.header.key.keyID).toBe('draft-k')
		expect(second.header.key.keyID).toBe('draft-k')
	})

	test('a tampered ciphertext does not round-trip as the document', async () => {
		const { wallet } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		const last = envelope.length - 1
		envelope[last] = (envelope[last] ?? 0) ^ 0xff

		await expect(openEnvelope(wallet, envelope)).rejects.toThrow(
			/failed authenticated decryption|must be exactly 32 bytes/,
		)
	})

	test('uses the exact bitplan protocol for wallet decryption', async () => {
		const { wallet, calls } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		await openEnvelope(wallet, envelope)
		expect(calls.decrypt[0]?.protocolID).toEqual([2, 'bitplan'])
	})

	test('encrypts one payload and shares its key with real BRC-100 wallets', async () => {
		const owner = new ProtoWallet(new PrivateKey(1))
		const recipient = new ProtoWallet(new PrivateKey(2))
		const secondRecipient = new ProtoWallet(new PrivateKey(4))
		const outsider = new ProtoWallet(new PrivateKey(3))
		const recipientIdentity = (
			await recipient.getPublicKey({ identityKey: true })
		).publicKey
		const secondRecipientIdentity = (
			await secondRecipient.getPublicKey({ identityKey: true })
		).publicKey
		const largePlaintext = {
			...PLAINTEXT,
			html: `<title>Large shared plan</title><p>${'x'.repeat(50_000)}</p>`,
		}
		const plaintextBytes = new TextEncoder().encode(
			JSON.stringify(largePlaintext),
		).length

		const envelope = await sealEnvelope(owner, largePlaintext, 'shared-key', [
			recipientIdentity,
			recipientIdentity,
			secondRecipientIdentity,
		])
		const parsed = parseEnvelope(envelope)

		expect(envelope[4]).toBe(SHARED_ENVELOPE_VERSION)
		expect(parsed.header.v).toBe(2)
		expect(sharedWith(parsed.header)).toEqual([
			recipientIdentity,
			secondRecipientIdentity,
		])
		expect(parsed.header.key.mode).toBe('brc2-multi')
		expect(parsed.header.key.payloadLength).toBeGreaterThan(plaintextBytes + 48)
		expect(parsed.header.key.slots).toHaveLength(3)
		expect(parsed.header.key.slots.map((slot) => slot.length)).toEqual([
			80, 80, 80,
		])
		expect(parsed.ciphertext.length).toBe(
			parsed.header.key.payloadLength + 80 * 3,
		)
		expect(envelope.length).toBeLessThan(plaintextBytes + 2000)
		expect((await openEnvelope(owner, envelope)).plaintext).toEqual(
			largePlaintext,
		)
		expect((await openEnvelope(recipient, envelope)).plaintext).toEqual(
			largePlaintext,
		)
		expect((await openEnvelope(secondRecipient, envelope)).plaintext).toEqual(
			largePlaintext,
		)
		await expect(openEnvelope(outsider, envelope)).rejects.toThrow(
			/not authorized/,
		)
	})

	test('uses a resolved sender identity without another wallet lookup', async () => {
		const { wallet, calls } = createMockWallet(OWNER_IDENTITY)
		const envelope = await sealEnvelope(
			wallet,
			PLAINTEXT,
			'shared-key',
			[RECIPIENT_IDENTITY],
			OWNER_IDENTITY,
		)

		expect(parseEnvelope(envelope).header.v).toBe(2)
		expect(calls.getPublicKey).toBe(0)
		expect(calls.encrypt).toHaveLength(2)
	})

	test('binds the shared reader list to the authenticated payload', async () => {
		const owner = new ProtoWallet(new PrivateKey(1))
		const recipient = new ProtoWallet(new PrivateKey(2))
		const replacement = new PrivateKey(3).toPublicKey().toString()
		const recipientIdentity = (
			await recipient.getPublicKey({ identityKey: true })
		).publicKey
		const envelope = await sealEnvelope(owner, PLAINTEXT, 'shared-key', [
			recipientIdentity,
		])
		const parsed = parseEnvelope(envelope)
		const tamperedHeader = structuredClone(parsed.header)
		const recipientSlot = tamperedHeader.key.slots[1]
		if (!recipientSlot) throw new Error('expected recipient slot')
		recipientSlot.identityKey = replacement

		await expect(
			openEnvelope(owner, frameEnvelope(tamperedHeader, parsed.ciphertext)),
		).rejects.toThrow(/header does not match/)
	})

	test('uses fresh randomness for every shared envelope', async () => {
		const owner = new ProtoWallet(new PrivateKey(1))
		const recipient = new PrivateKey(2).toPublicKey().toString()
		const first = parseEnvelope(
			await sealEnvelope(owner, PLAINTEXT, 'shared-key', [recipient]),
		)
		const second = parseEnvelope(
			await sealEnvelope(owner, PLAINTEXT, 'shared-key', [recipient]),
		)
		expect(Array.from(first.ciphertext)).not.toEqual(
			Array.from(second.ciphertext),
		)
	})

	test('rejects more than 128 recipients before making wallet calls', async () => {
		const { wallet, calls } = createMockWallet()
		const recipients = Array.from(
			{ length: MAX_SHARED_RECIPIENTS + 1 },
			(_, i) => new PrivateKey(i + 2).toPublicKey().toString(),
		)

		await expect(
			sealEnvelope(wallet, PLAINTEXT, 'shared-key', recipients),
		).rejects.toThrow(/at most 128 recipient identities/)
		expect(calls.getPublicKey).toBe(0)
		expect(calls.encrypt).toHaveLength(0)
	})

	test('normalizes valid identity keys and rejects malformed ones', () => {
		const identity =
			'0279BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798'
		expect(normalizeIdentityKey(` ${identity} `)).toBe(identity.toLowerCase())
		expect(() => normalizeIdentityKey('not-a-key')).toThrow(
			/Invalid identity key/,
		)
		expect(() => normalizeIdentityKey(`02${'0'.repeat(64)}`)).toThrow(
			/not a secp256k1 point/,
		)
	})
})

describe('envelope header parsing', () => {
	test('rejects bad magic', () => {
		const envelope = frameEnvelope(validSharedHeader(), new Uint8Array(128))
		envelope[0] = 0x42 ^ 0xff
		expect(() => parseEnvelope(envelope)).toThrow(CliError)
		expect(() => parseEnvelope(envelope)).toThrow(/magic/)
	})

	test('rejects an unknown version byte', () => {
		const envelope = frameEnvelope(validSharedHeader(), new Uint8Array(128))
		envelope[4] = 0x03
		expect(() => parseEnvelope(envelope)).toThrow(/version 0x03/)
	})

	test('rejects a 0x01 frame', () => {
		const envelope = frameEnvelope(validSharedHeader(), new Uint8Array(128))
		envelope[4] = 0x01
		expect(() => parseEnvelope(envelope)).toThrow(
			'Unsupported bitplan envelope version 0x01; this CLI reads envelope version 0x02.',
		)
		try {
			parseEnvelope(envelope)
			throw new Error('expected parseEnvelope to throw')
		} catch (error) {
			expect(error).toBeInstanceOf(CliError)
			expect((error as Error).message).toBe(
				'Unsupported bitplan envelope version 0x01; this CLI reads envelope version 0x02.',
			)
		}
	})

	test('rejects a buffer too short to hold a header', () => {
		expect(() => parseEnvelope(new Uint8Array([0x42, 0x50, 0x4c]))).toThrow(
			/too short/,
		)
	})

	test('rejects a truncated header', () => {
		const envelope = frameEnvelope(validSharedHeader(), new Uint8Array(128))
		const truncated = envelope.subarray(0, 20)
		expect(() => parseEnvelope(truncated)).toThrow(/Truncated/)
	})

	test('rejects a header with no ciphertext behind it', () => {
		const envelope = frameEnvelope(validSharedHeader(), new Uint8Array([]))
		expect(() => parseEnvelope(envelope)).toThrow(/no ciphertext/)
	})

	test('rejects a header that is not JSON', () => {
		const body = new TextEncoder().encode('not json at all')
		const out = new Uint8Array(9 + body.length + 3)
		out.set(MAGIC, 0)
		out[4] = ENVELOPE_WIRE_VERSION
		new DataView(out.buffer).setUint32(5, body.length, true)
		out.set(body, 9)
		out.set([1, 2, 3], 9 + body.length)
		expect(() => parseEnvelope(out)).toThrow(/not valid JSON/)
	})

	test('rejects an unknown key mode', () => {
		const header = validSharedHeader()
		const envelope = frameEnvelope(
			{ ...header, key: { ...header.key, mode: 'plaintext' } } as never,
			new Uint8Array(128),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/key mode/)
	})

	test('rejects a header with no keyID', () => {
		const header = validSharedHeader()
		const envelope = frameEnvelope(
			{ ...header, key: { ...header.key, keyID: '' } },
			new Uint8Array(128),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/keyID is missing/)
	})

	test('requires the exact bitplan protocol in the header', () => {
		const header = validSharedHeader()
		header.key.protocolID = [1, 'bitplan']
		expect(() =>
			parseEnvelope(frameEnvelope(header, new Uint8Array(128))),
		).toThrow(/protocolID must be/)
	})

	test('rejects invalid shared payload boundaries and slot layouts', () => {
		const missingLength = validSharedHeader()
		delete (missingLength.key as { payloadLength?: number }).payloadLength
		expect(() =>
			parseEnvelope(frameEnvelope(missingLength as never, new Uint8Array(128))),
		).toThrow(/payloadLength is invalid/)

		const noWrappedKeys = validSharedHeader()
		noWrappedKeys.key.payloadLength = 128
		expect(() =>
			parseEnvelope(frameEnvelope(noWrappedKeys, new Uint8Array(128))),
		).toThrow(/does not leave room/)

		const tooShortPayload = validSharedHeader()
		tooShortPayload.key.payloadLength = 47
		tooShortPayload.key.slots[0] = {
			identityKey: OWNER_IDENTITY,
			offset: 47,
			length: 80,
		}
		expect(() =>
			parseEnvelope(frameEnvelope(tooShortPayload, new Uint8Array(127))),
		).toThrow(/payloadLength is invalid/)

		const wrongOffset = validSharedHeader()
		wrongOffset.key.slots[0] = {
			identityKey: OWNER_IDENTITY,
			offset: 49,
			length: 80,
		}
		expect(() =>
			parseEnvelope(frameEnvelope(wrongOffset, new Uint8Array(128))),
		).toThrow(/not contiguous/)

		const incomplete = validSharedHeader()
		incomplete.key.slots[0] = {
			identityKey: OWNER_IDENTITY,
			offset: 48,
			length: 79,
		}
		expect(() =>
			parseEnvelope(frameEnvelope(incomplete, new Uint8Array(128))),
		).toThrow(/do not cover/)
	})

	test('rejects duplicate and non-curve shared identities', () => {
		const duplicate = validSharedHeader()
		duplicate.key.slots.push({
			identityKey: OWNER_IDENTITY,
			offset: 128,
			length: 80,
		})
		expect(() =>
			parseEnvelope(frameEnvelope(duplicate, new Uint8Array(208))),
		).toThrow(/duplicate reader identity/)

		const invalidPoint = validSharedHeader()
		invalidPoint.key.senderIdentityKey = `02${'0'.repeat(64)}`
		expect(() =>
			parseEnvelope(frameEnvelope(invalidPoint, new Uint8Array(128))),
		).toThrow(/not a secp256k1 point/)
	})

	test('requires an unwrapped shared key to be exactly 32 bytes', async () => {
		const { wallet } = createMockWallet(OWNER_IDENTITY)
		const header = validSharedHeader()
		header.key.slots[0] = {
			identityKey: OWNER_IDENTITY,
			offset: 48,
			length: 31,
		}
		const envelope = frameEnvelope(header, new Uint8Array(48 + 31))

		await expect(openEnvelope(wallet, envelope)).rejects.toThrow(
			/must be exactly 32 bytes/,
		)
	})

	test('authenticates the shared payload ciphertext', async () => {
		const owner = new ProtoWallet(new PrivateKey(1))
		const envelope = await sealEnvelope(
			owner,
			PLAINTEXT,
			'shared-key',
			[RECIPIENT_IDENTITY],
			OWNER_IDENTITY,
		)
		const parsed = parseEnvelope(envelope)
		const headerBytes = new TextEncoder().encode(JSON.stringify(parsed.header))
		const payloadOffset = MAGIC.length + 1 + 4 + headerBytes.length
		envelope[payloadOffset] = (envelope[payloadOffset] ?? 0) ^ 0xff

		await expect(openEnvelope(owner, envelope)).rejects.toThrow(
			/failed authenticated decryption/,
		)
	})
})
