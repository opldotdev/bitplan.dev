/**
 * The bitplan on-chain envelope.
 *
 * Binary layout (see ENVELOPE.md):
 *
 *   'BPLN' | 0x01 | uint32-LE header length | UTF-8 JSON header | ciphertext
 *
 * The ciphertext is the BRC-2 output of `wallet.encrypt` over the UTF-8 JSON
 * plaintext. The CLI holds no keys; encryption and decryption are wallet calls.
 */

import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import type { WalletInterface } from '@bsv/sdk'
import { BITPLAN_PROTOCOL } from './constants.js'
import { CliError } from './errors.js'

/** ASCII 'BPLN'. */
export const MAGIC = Uint8Array.from([0x42, 0x50, 0x4c, 0x4e])
export const ENVELOPE_VERSION = 0x01

/** Largest header we will parse; a real header is a few hundred bytes. */
const MAX_HEADER_BYTES = 64 * 1024

export interface EnvelopeKey {
	/** BRC-2 self-encryption through the author's wallet. */
	mode: 'brc2-self'
	protocolID: [number, string]
	keyID: string
}

export interface EnvelopeHeader {
	v: 1
	key: EnvelopeKey
}

export interface DraftMeta {
	title: string | null
	description: string | null
	repoOrg: string | null
	repoName: string | null
	repoHost: string | null
	gitBranch: string | null
	gitCommitSha: string | null
	gitCommitSubject: string | null
	gitDirty: boolean | null
	cliVersion: string
	fileSha256: string
	createdAt: string
}

/** The JSON that lives inside the ciphertext. */
export interface DraftPlaintext {
	meta: DraftMeta
	html: string
}

export interface ParsedEnvelope {
	header: EnvelopeHeader
	ciphertext: Uint8Array
}

/** Mint a fresh keyID for a draft. Reused for every version of that draft. */
export function newKeyId(): string {
	return webcrypto.randomUUID()
}

export function toBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64')
}

export function fromBase64(value: string): Uint8Array {
	return new Uint8Array(Buffer.from(value, 'base64'))
}

/**
 * Encrypt a plaintext document into a complete envelope.
 *
 * The body is `wallet.encrypt` of the JSON. protocolID and keyID ride in the
 * cleartext header so a reader can call `wallet.decrypt` without local state.
 */
export async function sealEnvelope(
	wallet: WalletInterface,
	plaintext: DraftPlaintext,
	keyID: string,
): Promise<Uint8Array> {
	const body = new TextEncoder().encode(JSON.stringify(plaintext))
	let encrypted: Awaited<ReturnType<typeof wallet.encrypt>>
	try {
		encrypted = await wallet.encrypt({
			protocolID: BITPLAN_PROTOCOL,
			keyID,
			counterparty: 'self',
			plaintext: Array.from(body),
		})
	} catch (error) {
		throw new CliError(
			`The wallet refused to encrypt this draft (protocol bitplan, keyID ${keyID}): ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	const header: EnvelopeHeader = {
		v: 1,
		key: {
			mode: 'brc2-self',
			protocolID: [BITPLAN_PROTOCOL[0], BITPLAN_PROTOCOL[1]],
			keyID,
		},
	}

	return frameEnvelope(header, Uint8Array.from(encrypted.ciphertext))
}

/** Assemble magic + version + header length + header + ciphertext. */
export function frameEnvelope(
	header: EnvelopeHeader,
	ciphertext: Uint8Array,
): Uint8Array {
	const headerBytes = new TextEncoder().encode(JSON.stringify(header))
	const out = new Uint8Array(
		MAGIC.length + 1 + 4 + headerBytes.length + ciphertext.length,
	)
	let offset = 0
	out.set(MAGIC, offset)
	offset += MAGIC.length
	out[offset] = ENVELOPE_VERSION
	offset += 1
	new DataView(out.buffer, out.byteOffset + offset, 4).setUint32(
		0,
		headerBytes.length,
		true,
	)
	offset += 4
	out.set(headerBytes, offset)
	offset += headerBytes.length
	out.set(ciphertext, offset)
	return out
}

/**
 * Split a serialized envelope into its header and ciphertext.
 *
 * Rejects anything that is not a v1 bitplan envelope.
 */
export function parseEnvelope(bytes: Uint8Array): ParsedEnvelope {
	const prefix = MAGIC.length + 1 + 4
	if (bytes.length < prefix) {
		throw new CliError(
			`Not a bitplan envelope: ${bytes.length} bytes is too short to hold a header.`,
		)
	}
	for (let i = 0; i < MAGIC.length; i++) {
		if (bytes[i] !== MAGIC[i]) {
			throw new CliError(
				"Not a bitplan envelope: missing 'BPLN' magic at the start of the content.",
			)
		}
	}
	const version = bytes[MAGIC.length]
	if (version !== ENVELOPE_VERSION) {
		throw new CliError(
			`Unsupported bitplan envelope version 0x${(version ?? 0).toString(16).padStart(2, '0')}; this CLI understands 0x01.`,
		)
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const headerLength = view.getUint32(MAGIC.length + 1, true)
	if (headerLength === 0) {
		throw new CliError('Malformed bitplan envelope: header length is zero.')
	}
	if (headerLength > MAX_HEADER_BYTES) {
		throw new CliError(
			`Malformed bitplan envelope: header claims ${headerLength} bytes (max ${MAX_HEADER_BYTES}).`,
		)
	}
	if (bytes.length < prefix + headerLength) {
		throw new CliError(
			`Truncated bitplan envelope: header claims ${headerLength} bytes but only ${bytes.length - prefix} remain.`,
		)
	}

	const headerJson = new TextDecoder().decode(
		bytes.subarray(prefix, prefix + headerLength),
	)
	let parsed: unknown
	try {
		parsed = JSON.parse(headerJson)
	} catch {
		throw new CliError('Malformed bitplan envelope: header is not valid JSON.')
	}

	const header = assertHeader(parsed)
	const ciphertext = bytes.subarray(prefix + headerLength)
	if (ciphertext.length === 0) {
		throw new CliError('Truncated bitplan envelope: no ciphertext present.')
	}

	return { header, ciphertext }
}

function assertHeader(value: unknown): EnvelopeHeader {
	if (typeof value !== 'object' || value === null) {
		throw new CliError('Malformed bitplan envelope: header is not an object.')
	}
	const h = value as Record<string, unknown>
	if (h.v !== 1) {
		throw new CliError(
			`Unsupported bitplan header version ${String(h.v)}; this CLI understands 1.`,
		)
	}
	const key = h.key
	if (typeof key !== 'object' || key === null) {
		throw new CliError('Malformed bitplan envelope: header has no key.')
	}
	const k = key as Record<string, unknown>
	if (k.mode !== 'brc2-self') {
		throw new CliError(
			`Unsupported bitplan key mode "${String(k.mode)}"; this CLI understands brc2-self.`,
		)
	}
	if (
		!Array.isArray(k.protocolID) ||
		k.protocolID.length !== 2 ||
		typeof k.protocolID[0] !== 'number' ||
		typeof k.protocolID[1] !== 'string'
	) {
		throw new CliError(
			'Malformed bitplan envelope: key.protocolID must be [securityLevel, name].',
		)
	}
	if (typeof k.keyID !== 'string' || k.keyID.length === 0) {
		throw new CliError('Malformed bitplan envelope: key.keyID is missing.')
	}

	return {
		v: 1,
		key: {
			mode: 'brc2-self',
			protocolID: [k.protocolID[0], k.protocolID[1]],
			keyID: k.keyID,
		},
	}
}

function assertProtocolLevel(level: number): 0 | 1 | 2 {
	if (level !== 0 && level !== 1 && level !== 2) {
		throw new CliError(
			`Malformed bitplan envelope: key.protocolID security level ${level} is not 0, 1 or 2.`,
		)
	}
	return level
}

function assertPlaintext(value: unknown): DraftPlaintext {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof (value as DraftPlaintext).html !== 'string'
	) {
		throw new CliError(
			'Decrypted this draft but its plaintext has no html document.',
		)
	}
	return value as DraftPlaintext
}

/**
 * Decrypt the body through the wallet.
 *
 * The header's own protocolID / keyID are used, not this CLI's constants, so
 * an envelope written under a different protocol still opens if the wallet
 * holds the key.
 */
export async function openEnvelope(
	wallet: WalletInterface,
	bytes: Uint8Array,
): Promise<{ header: EnvelopeHeader; plaintext: DraftPlaintext }> {
	const { header, ciphertext } = parseEnvelope(bytes)
	const level = assertProtocolLevel(header.key.protocolID[0])

	let decrypted: Awaited<ReturnType<typeof wallet.decrypt>>
	try {
		decrypted = await wallet.decrypt({
			protocolID: [level, header.key.protocolID[1]],
			keyID: header.key.keyID,
			counterparty: 'self',
			ciphertext: Array.from(ciphertext),
		})
	} catch (error) {
		throw new CliError(
			`The wallet refused to decrypt this draft (protocol ${header.key.protocolID[1]}, keyID ${header.key.keyID}): ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(decrypted.plaintext)))
	} catch {
		throw new CliError(
			'Decrypted this draft but its plaintext is not valid JSON.',
		)
	}

	return { header, plaintext: assertPlaintext(parsed) }
}
