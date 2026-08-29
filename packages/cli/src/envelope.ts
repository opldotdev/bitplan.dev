/**
 * The bitplan on-chain envelope.
 *
 * Binary layout (see ENVELOPE.md — that file is the public spec):
 *
 *   'BPLN' (4 bytes ASCII) | version byte 0x01 | uint32-LE header length |
 *   UTF-8 JSON header | ciphertext
 *
 * The ciphertext is AES-256-GCM (WebCrypto, 128-bit tag appended) over a
 * UTF-8 JSON plaintext. The content key is 32 random bytes, never persisted:
 * it only survives as the wrapped copy in the header, encrypted by the user's
 * wallet under BRC-2 self-encryption. The CLI holds no keys of its own.
 */

import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import type { WalletInterface } from '@bsv/sdk'
import { BITPLAN_PROTOCOL } from './constants.js'
import { CliError } from './errors.js'

/** ASCII 'BPLN'. */
export const MAGIC = Uint8Array.from([0x42, 0x50, 0x4c, 0x4e])
export const ENVELOPE_VERSION = 0x01

/** Byte length of the AES-GCM initialization vector. */
export const IV_BYTES = 12
/** Byte length of the AES-256 content key. */
export const CONTENT_KEY_BYTES = 32

/** Largest header we will parse; a real header is a few hundred bytes. */
const MAX_HEADER_BYTES = 64 * 1024

export interface EnvelopeKeyWrap {
	/** Only mode defined in v1: wrapped by the author's own wallet. */
	mode: 'brc2-self'
	protocolID: [number, string]
	keyID: string
	/** base64 of the wallet.encrypt output over the raw content key. */
	ciphertext: string
}

export interface EnvelopeHeader {
	v: 1
	alg: 'aes-256-gcm'
	/** base64, 12 bytes. */
	iv: string
	key: EnvelopeKeyWrap
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
 * The content key is generated here, used once, wrapped by the wallet, and
 * dropped — it is never written to disk.
 */
export async function sealEnvelope(
	wallet: WalletInterface,
	plaintext: DraftPlaintext,
	keyID: string,
): Promise<Uint8Array> {
	const contentKey = webcrypto.getRandomValues(
		new Uint8Array(CONTENT_KEY_BYTES),
	)
	const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES))

	const body = new TextEncoder().encode(JSON.stringify(plaintext))
	const cryptoKey = await webcrypto.subtle.importKey(
		'raw',
		contentKey,
		{ name: 'AES-GCM' },
		false,
		['encrypt'],
	)
	const ciphertext = new Uint8Array(
		await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, body),
	)

	const wrapped = await wallet.encrypt({
		protocolID: BITPLAN_PROTOCOL,
		keyID,
		counterparty: 'self',
		plaintext: Array.from(contentKey),
	})
	contentKey.fill(0)

	const header: EnvelopeHeader = {
		v: 1,
		alg: 'aes-256-gcm',
		iv: toBase64(iv),
		key: {
			mode: 'brc2-self',
			protocolID: [BITPLAN_PROTOCOL[0], BITPLAN_PROTOCOL[1]],
			keyID,
			ciphertext: toBase64(Uint8Array.from(wrapped.ciphertext)),
		},
	}

	return frameEnvelope(header, ciphertext)
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
 * Rejects anything that is not a v1 bitplan envelope. Every rejection is a
 * CliError, because the only way a user meets one is by pointing the CLI at
 * something that is not a bitplan draft.
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
	if (h.alg !== 'aes-256-gcm') {
		throw new CliError(
			`Unsupported bitplan cipher "${String(h.alg)}"; this CLI understands aes-256-gcm.`,
		)
	}
	if (typeof h.iv !== 'string' || fromBase64(h.iv).length !== IV_BYTES) {
		throw new CliError(
			`Malformed bitplan envelope: iv must be ${IV_BYTES} base64-encoded bytes.`,
		)
	}
	const key = h.key
	if (typeof key !== 'object' || key === null) {
		throw new CliError('Malformed bitplan envelope: header has no key wrap.')
	}
	const k = key as Record<string, unknown>
	if (k.mode !== 'brc2-self') {
		throw new CliError(
			`Unsupported bitplan key wrap mode "${String(k.mode)}"; this CLI understands brc2-self.`,
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
	if (typeof k.ciphertext !== 'string' || k.ciphertext.length === 0) {
		throw new CliError('Malformed bitplan envelope: key.ciphertext is missing.')
	}

	return {
		v: 1,
		alg: 'aes-256-gcm',
		iv: h.iv,
		key: {
			mode: 'brc2-self',
			protocolID: [k.protocolID[0], k.protocolID[1]],
			keyID: k.keyID,
			ciphertext: k.ciphertext,
		},
	}
}

/**
 * Unwrap the content key through the wallet and decrypt the body.
 *
 * The header's own protocolID / keyID are used, not this CLI's constants, so
 * an envelope written by a future version with a different protocol still
 * decrypts as long as the wallet holds the key.
 */
export async function openEnvelope(
	wallet: WalletInterface,
	bytes: Uint8Array,
): Promise<{ header: EnvelopeHeader; plaintext: DraftPlaintext }> {
	const { header, ciphertext } = parseEnvelope(bytes)

	const level = header.key.protocolID[0]
	if (level !== 0 && level !== 1 && level !== 2) {
		throw new CliError(
			`Malformed bitplan envelope: key.protocolID security level ${level} is not 0, 1 or 2.`,
		)
	}

	const unwrapped = await wallet.decrypt({
		protocolID: [level, header.key.protocolID[1]],
		keyID: header.key.keyID,
		counterparty: 'self',
		ciphertext: Array.from(fromBase64(header.key.ciphertext)),
	})
	const contentKey = Uint8Array.from(unwrapped.plaintext)
	if (contentKey.length !== CONTENT_KEY_BYTES) {
		throw new CliError(
			`Wallet returned a ${contentKey.length}-byte content key; expected ${CONTENT_KEY_BYTES}.`,
		)
	}

	const cryptoKey = await webcrypto.subtle.importKey(
		'raw',
		contentKey,
		{ name: 'AES-GCM' },
		false,
		['decrypt'],
	)
	let body: Uint8Array
	try {
		body = new Uint8Array(
			await webcrypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: fromBase64(header.iv) },
				cryptoKey,
				ciphertext,
			),
		)
	} catch {
		throw new CliError(
			'Could not decrypt this draft: the ciphertext failed its authentication tag. The content or the key wrap has been altered.',
		)
	} finally {
		contentKey.fill(0)
	}

	let plaintext: unknown
	try {
		plaintext = JSON.parse(new TextDecoder().decode(body))
	} catch {
		throw new CliError(
			'Decrypted this draft but its plaintext is not valid JSON.',
		)
	}
	if (
		typeof plaintext !== 'object' ||
		plaintext === null ||
		typeof (plaintext as DraftPlaintext).html !== 'string'
	) {
		throw new CliError(
			'Decrypted this draft but its plaintext has no html document.',
		)
	}

	return { header, plaintext: plaintext as DraftPlaintext }
}
