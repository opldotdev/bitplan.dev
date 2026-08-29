import { describe, expect, test } from 'bun:test'
import { BITPLAN_PROTOCOL } from '../src/constants.js'
import {
	type DraftPlaintext,
	ENVELOPE_VERSION,
	frameEnvelope,
	MAGIC,
	newKeyId,
	openEnvelope,
	parseEnvelope,
	sealEnvelope,
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

function validHeader() {
	return {
		v: 1 as const,
		key: {
			mode: 'brc2-self' as const,
			protocolID: [2, 'bitplan'] as [number, string],
			keyID: 'key-1',
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

	test('encrypts the document through the wallet, not a homemade content key', async () => {
		const { wallet, calls } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		const { ciphertext } = parseEnvelope(envelope)
		const body = Array.from(new TextEncoder().encode(JSON.stringify(PLAINTEXT)))

		expect(Array.from(ciphertext)).toEqual(xorPad(body))
		expect(ciphertext.length).toBe(body.length)

		const wrapCall = calls.encrypt[0]
		expect(wrapCall?.counterparty).toBe('self')
		expect(wrapCall?.protocolID).toEqual(BITPLAN_PROTOCOL)
		expect(wrapCall?.keyID).toBe('key-1')
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
		expect(header.key.mode).toBe('brc2-self')
		expect(header.key.protocolID).toEqual([2, 'bitplan'])
		expect(header.key.keyID).toBe('key-1')
		expect(ciphertext.length).toBeGreaterThan(0)
	})

	test('a tampered ciphertext does not round-trip as the document', async () => {
		const { wallet } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		const last = envelope.length - 1
		envelope[last] = (envelope[last] ?? 0) ^ 0xff

		await expect(openEnvelope(wallet, envelope)).rejects.toThrow(
			/not valid JSON|no html document/,
		)
	})

	test('reads the protocolID out of the header, not the CLI constants', async () => {
		const { wallet, calls } = createMockWallet()
		const envelope = await sealEnvelope(wallet, PLAINTEXT, 'key-1')
		await openEnvelope(wallet, envelope)
		expect(calls.decrypt[0]?.protocolID).toEqual([2, 'bitplan'])
	})
})

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

	test('rejects an unknown key mode', () => {
		const header = validHeader()
		const envelope = frameEnvelope(
			{ ...header, key: { ...header.key, mode: 'plaintext' } } as never,
			new Uint8Array([1, 2, 3]),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/key mode/)
	})

	test('rejects a header with no keyID', () => {
		const header = validHeader()
		const envelope = frameEnvelope(
			{ ...header, key: { ...header.key, keyID: '' } },
			new Uint8Array([1, 2, 3]),
		)
		expect(() => parseEnvelope(envelope)).toThrow(/keyID is missing/)
	})
})
