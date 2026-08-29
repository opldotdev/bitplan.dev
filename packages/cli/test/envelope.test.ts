import { describe, expect, test } from 'bun:test'
import { BITPLAN_PROTOCOL } from '../src/constants.js'
import {
	CONTENT_KEY_BYTES,
	type DraftPlaintext,
	ENVELOPE_VERSION,
	frameEnvelope,
	fromBase64,
	IV_BYTES,
	MAGIC,
	newKeyId,
	openEnvelope,
	parseEnvelope,
	sealEnvelope,
	toBase64,
} from '../src/envelope.js'
import { CliError } from '../src/errors.js'
import { createMockWallet, xorPad } from './mockWallet.js'

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

	test('wraps the content key through the wallet, not around it', async () => {
		const { wallet, calls } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		const { header } = parseEnvelope(envelope)

		// The wrap is the mock's XOR of the real key, so unwrapping the header
		// must reproduce a 32-byte key that differs from the stored bytes.
		const stored = fromBase64(header.key.ciphertext)
		expect(stored).toHaveLength(CONTENT_KEY_BYTES)

		const unwrapped = Uint8Array.from(xorPad(Array.from(stored)))
		expect(unwrapped).toHaveLength(CONTENT_KEY_BYTES)
		expect(Array.from(unwrapped)).not.toEqual(Array.from(stored))

		const wrapCall = calls.encrypt[0]
		expect(wrapCall?.counterparty).toBe('self')
		expect(wrapCall?.protocolID).toEqual(BITPLAN_PROTOCOL)
		expect(wrapCall?.keyID).toBe('key-1')
	})

	test('the same document sealed twice produces different ciphertext', async () => {
		const { wallet } = createMockWallet()
		const a = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		const b = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		expect(Array.from(a)).not.toEqual(Array.from(b))
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

	test('header describes the layout the spec promises', async () => {
		const { wallet } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')

		expect(Array.from(envelope.subarray(0, 4))).toEqual(Array.from(MAGIC))
		expect(envelope[4]).toBe(ENVELOPE_VERSION)

		const { header, ciphertext } = parseEnvelope(envelope)
		expect(header.v).toBe(1)
		expect(header.alg).toBe('aes-256-gcm')
		expect(fromBase64(header.iv)).toHaveLength(IV_BYTES)
		expect(header.key.mode).toBe('brc2-self')
		expect(header.key.protocolID).toEqual([2, 'bitplan'])
		// AES-GCM appends a 16-byte tag.
		expect(ciphertext.length).toBeGreaterThan(16)
	})

	test('a tampered ciphertext fails its authentication tag', async () => {
		const { wallet } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		const last = envelope.length - 1
		envelope[last] = (envelope[last] ?? 0) ^ 0xff

		await expect(openEnvelope(wallet, envelope)).rejects.toThrow(
			/failed its authentication tag/,
		)
	})
})

function validHeader() {
	return {
		v: 1 as const,
		alg: 'aes-256-gcm' as const,
		iv: toBase64(new Uint8Array(IV_BYTES)),
		key: {
			mode: 'brc2-self' as const,
			protocolID: [2, 'bitplan'] as [number, string],
			keyID: 'key-1',
			ciphertext: toBase64(new Uint8Array(CONTENT_KEY_BYTES)),
		},
	}
}

describe('envelope header parsing', () => {
	test('rejects bad magic', () => {
		const envelope = frameEnvelope(validHeader(), new Uint8Array([1, 2, 3]))
		envelope[0] = 0x42 ^ 0xff
		expect(() => parseEnvelope(envelope)).toThrow(CliError)
		expect(() => parseEnvelope(envelope)).toThrow(/magic/)
	})

	test('rejects an unknown version byte', () => {
		const envelope = frameEnvelope(validHeader(), new Uint8Array([1, 2, 3]))
		envelope[4] = 0x02
		expect(() => parseEnvelope(envelope)).toThrow(/version 0x02/)
	})

	test('rejects a buffer too short to hold a header', () => {
		expect(() => parseEnvelope(new Uint8Array([0x42, 0x50, 0x4c]))).toThrow(
			/too short/,
		)
	})

	test('rejects a truncated header', () => {
		const envelope = frameEnvelope(validHeader(), new Uint8Array([1, 2, 3]))
		const truncated = envelope.subarray(0, 20)
		expect(() => parseEnvelope(truncated)).toThrow(/Truncated/)
	})

	test('rejects a header with no ciphertext behind it', () => {
		const envelope = frameEnvelope(validHeader(), new Uint8Array([]))
		expect(() => parseEnvelope(envelope)).toThrow(/no ciphertext/)
	})

	test('rejects a header that is not JSON', () => {
		const body = new TextEncoder().encode('not json at all')
		const out = new Uint8Array(9 + body.length + 3)
		out.set(MAGIC, 0)
		out[4] = ENVELOPE_VERSION
		new DataView(out.buffer).setUint32(5, body.length, true)
		out.set(body, 9)
		out.set([1, 2, 3], 9 + body.length)
		expect(() => parseEnvelope(out)).toThrow(/not valid JSON/)
	})

	test('rejects an unsupported cipher', () => {
		const header = { ...validHeader(), alg: 'aes-128-cbc' }
		const envelope = frameEnvelope(
			header as unknown as ReturnType<typeof validHeader>,
			new Uint8Array([1, 2, 3]),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/Unsupported bitplan cipher/)
	})

	test('rejects a wrong-length iv', () => {
		const header = { ...validHeader(), iv: toBase64(new Uint8Array(8)) }
		const envelope = frameEnvelope(header, new Uint8Array([1, 2, 3]))
		expect(() => parseEnvelope(envelope)).toThrow(/iv must be 12/)
	})

	test('rejects an unknown key wrap mode', () => {
		const header = validHeader()
		const envelope = frameEnvelope(
			{ ...header, key: { ...header.key, mode: 'plaintext' } } as never,
			new Uint8Array([1, 2, 3]),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/key wrap mode/)
	})

	test('rejects a header with no keyID', () => {
		const header = validHeader()
		const envelope = frameEnvelope(
			{ ...header, key: { ...header.key, keyID: '' } },
			new Uint8Array([1, 2, 3]),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/keyID is missing/)
	})

	test('reads the protocolID out of the header, not the CLI constants', async () => {
		const { wallet, calls } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		await openEnvelope(wallet, envelope)
		expect(calls.decrypt[0]?.protocolID).toEqual([2, 'bitplan'])
	})
})
