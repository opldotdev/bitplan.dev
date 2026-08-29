/**
 * The bitplan on-chain envelope.
 *
 * Binary layout (see ENVELOPE.md):
 *
 *   'BPLN' | version | uint32-LE header length | UTF-8 JSON header | body
 *
 * v1 has one self-encrypted BRC-2 ciphertext. v2 encrypts the document once
 * with an SDK SymmetricKey, then concatenates one wallet-wrapped copy of that
 * key per authorized identity after the payload ciphertext.
 */

import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { PublicKey, SymmetricKey, type WalletInterface } from '@bsv/sdk'
import { BITPLAN_PROTOCOL } from './constants.js'
import { CliError } from './errors.js'

/** ASCII 'BPLN'. */
export const MAGIC = Uint8Array.from([0x42, 0x50, 0x4c, 0x4e])
export const ENVELOPE_VERSION = 0x01
export const SHARED_ENVELOPE_VERSION = 0x02

/** Largest header we will parse; a real header is a few hundred bytes. */
const MAX_HEADER_BYTES = 64 * 1024
export const MAX_SHARED_RECIPIENTS = 128
const CONTENT_KEY_BYTES = 32
const SYMMETRIC_CIPHERTEXT_OVERHEAD = 48

export interface PrivateEnvelopeKey {
	/** BRC-2 self-encryption through the author's wallet. */
	mode: 'brc2-self'
	protocolID: [number, string]
	keyID: string
}

export interface PrivateEnvelopeHeader {
	v: 1
	key: PrivateEnvelopeKey
}

export interface SharedEnvelopeSlot {
	/** Identity public key authorized to decrypt this slot. */
	identityKey: string
	offset: number
	length: number
}

export interface SharedEnvelopeKey {
	mode: 'brc2-multi'
	protocolID: [number, string]
	keyID: string
	/** Bytes occupied by the document ciphertext at the start of the body. */
	payloadLength: number
	/** Publisher identity. Recipients use this as wallet.decrypt counterparty. */
	senderIdentityKey: string
	/** First slot is the sender's self slot; remaining slots are recipients. */
	slots: SharedEnvelopeSlot[]
}

export interface SharedEnvelopeHeader {
	v: 2
	key: SharedEnvelopeKey
}

export type EnvelopeHeader = PrivateEnvelopeHeader | SharedEnvelopeHeader

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

type EnvelopeWallet = Pick<
	WalletInterface,
	'decrypt' | 'encrypt' | 'getPublicKey'
>

/** Mint a fresh keyID for a draft. Reused for every version of that draft. */
export function newKeyId(): string {
	return webcrypto.randomUUID()
}

/** Validate and canonicalize a compressed secp256k1 identity public key. */
export function normalizeIdentityKey(value: string): string {
	const trimmed = value.trim().toLowerCase()
	if (!/^(02|03)[0-9a-f]{64}$/.test(trimmed)) {
		throw new CliError(
			`Invalid identity key "${value}": expected a 33-byte compressed public key (66 hex characters beginning 02 or 03).`,
		)
	}
	try {
		return PublicKey.fromString(trimmed).toString()
	} catch {
		throw new CliError(
			`Invalid identity key "${value}": not a secp256k1 point.`,
		)
	}
}

/** Recipient identities in a shared header, excluding the sender's self slot. */
export function sharedWith(header: EnvelopeHeader): string[] {
	if (header.v === 1) return []
	return header.key.slots
		.map((slot) => slot.identityKey)
		.filter((identityKey) => identityKey !== header.key.senderIdentityKey)
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
 * Private bodies are `wallet.encrypt` of the JSON. Shared bodies contain one
 * SDK-encrypted JSON payload followed by wallet-wrapped copies of its key.
 * protocolID and keyID ride in the cleartext header so a reader can ask its
 * wallet to decrypt without local state.
 */
export async function sealEnvelope(
	wallet: EnvelopeWallet,
	plaintext: DraftPlaintext,
	keyID: string,
	recipientIdentityKeys: readonly string[] = [],
	resolvedSenderIdentityKey?: string,
): Promise<Uint8Array> {
	const body = new TextEncoder().encode(JSON.stringify(plaintext))
	const recipients = [
		...new Set(recipientIdentityKeys.map(normalizeIdentityKey)),
	]
	if (recipients.length > MAX_SHARED_RECIPIENTS) {
		throw new CliError(
			`A shared draft supports at most ${MAX_SHARED_RECIPIENTS} recipient identities; got ${recipients.length}.`,
		)
	}
	if (recipients.length > 0) {
		return sealSharedEnvelope(
			wallet,
			body,
			keyID,
			recipients,
			resolvedSenderIdentityKey,
		)
	}

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

async function sealSharedEnvelope(
	wallet: EnvelopeWallet,
	body: Uint8Array,
	keyID: string,
	recipientIdentityKeys: readonly string[],
	resolvedSenderIdentityKey: string | undefined,
): Promise<Uint8Array> {
	let senderIdentityKey: string
	if (resolvedSenderIdentityKey === undefined) {
		try {
			const result = await wallet.getPublicKey({ identityKey: true })
			senderIdentityKey = normalizeIdentityKey(result.publicKey)
		} catch (error) {
			throw new CliError(
				`The wallet could not provide its identity key for sharing: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	} else {
		senderIdentityKey = normalizeIdentityKey(resolvedSenderIdentityKey)
	}

	const readers = [
		senderIdentityKey,
		...recipientIdentityKeys.filter(
			(identityKey) => identityKey !== senderIdentityKey,
		),
	]
	const contentKey = SymmetricKey.fromRandom()
	const contentKeyBytes = contentKey.toArray('be', CONTENT_KEY_BYTES)
	const payload = Uint8Array.from(
		contentKey.encrypt(Array.from(body)) as number[],
	)
	const chunks: Uint8Array[] = [payload]
	const slots: SharedEnvelopeSlot[] = []
	let offset = payload.length

	for (const identityKey of readers) {
		let encrypted: Awaited<ReturnType<typeof wallet.encrypt>>
		try {
			encrypted = await wallet.encrypt({
				protocolID: BITPLAN_PROTOCOL,
				keyID,
				counterparty: identityKey === senderIdentityKey ? 'self' : identityKey,
				plaintext: contentKeyBytes,
			})
		} catch (error) {
			throw new CliError(
				`The wallet refused to encrypt this draft for ${identityKey}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
		const ciphertext = Uint8Array.from(encrypted.ciphertext)
		chunks.push(ciphertext)
		slots.push({ identityKey, offset, length: ciphertext.length })
		offset += ciphertext.length
	}

	const header: SharedEnvelopeHeader = {
		v: 2,
		key: {
			mode: 'brc2-multi',
			protocolID: [BITPLAN_PROTOCOL[0], BITPLAN_PROTOCOL[1]],
			keyID,
			payloadLength: payload.length,
			senderIdentityKey,
			slots,
		},
	}
	return frameEnvelope(header, concatenate(chunks, offset))
}

function concatenate(
	chunks: readonly Uint8Array[],
	length: number,
): Uint8Array {
	const result = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		result.set(chunk, offset)
		offset += chunk.length
	}
	return result
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
	out[offset] = header.v
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
 * Reads private v1 and shared v2 bitplan envelopes.
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
	if (version !== ENVELOPE_VERSION && version !== SHARED_ENVELOPE_VERSION) {
		throw new CliError(
			`Unsupported bitplan envelope version 0x${(version ?? 0).toString(16).padStart(2, '0')}; this CLI understands 0x01 and 0x02.`,
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
	if (header.v !== version) {
		throw new CliError(
			`Malformed bitplan envelope: binary version 0x${version.toString(16).padStart(2, '0')} does not match header version ${header.v}.`,
		)
	}
	const ciphertext = bytes.subarray(prefix + headerLength)
	if (ciphertext.length === 0) {
		throw new CliError('Truncated bitplan envelope: no ciphertext present.')
	}

	if (header.v === 2) assertSharedLayout(header, ciphertext.length)
	return { header, ciphertext }
}

function assertHeader(value: unknown): EnvelopeHeader {
	if (typeof value !== 'object' || value === null) {
		throw new CliError('Malformed bitplan envelope: header is not an object.')
	}
	const h = value as Record<string, unknown>
	if (h.v !== 1 && h.v !== 2) {
		throw new CliError(
			`Unsupported bitplan header version ${String(h.v)}; this CLI understands 1 and 2.`,
		)
	}
	const key = h.key
	if (typeof key !== 'object' || key === null) {
		throw new CliError('Malformed bitplan envelope: header has no key.')
	}
	const k = key as Record<string, unknown>
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
	if (
		k.protocolID[0] !== BITPLAN_PROTOCOL[0] ||
		k.protocolID[1] !== BITPLAN_PROTOCOL[1]
	) {
		throw new CliError(
			`Malformed bitplan envelope: key.protocolID must be [${BITPLAN_PROTOCOL[0]}, "${BITPLAN_PROTOCOL[1]}"].`,
		)
	}
	if (typeof k.keyID !== 'string' || k.keyID.length === 0) {
		throw new CliError('Malformed bitplan envelope: key.keyID is missing.')
	}

	const protocolID: [number, string] = [k.protocolID[0], k.protocolID[1]]
	if (h.v === 1) {
		if (k.mode !== 'brc2-self') {
			throw new CliError(
				`Unsupported bitplan key mode "${String(k.mode)}" for header v1.`,
			)
		}
		return { v: 1, key: { mode: 'brc2-self', protocolID, keyID: k.keyID } }
	}

	if (k.mode !== 'brc2-multi') {
		throw new CliError(
			`Unsupported bitplan key mode "${String(k.mode)}" for header v2.`,
		)
	}
	if (
		!Number.isSafeInteger(k.payloadLength) ||
		Number(k.payloadLength) < SYMMETRIC_CIPHERTEXT_OVERHEAD
	) {
		throw new CliError(
			'Malformed bitplan envelope: key.payloadLength is invalid.',
		)
	}
	const senderIdentityKey = assertIdentityKey(
		k.senderIdentityKey,
		'key.senderIdentityKey',
	)
	if (!Array.isArray(k.slots) || k.slots.length === 0) {
		throw new CliError('Malformed bitplan envelope: key.slots is empty.')
	}
	if (k.slots.length > MAX_SHARED_RECIPIENTS + 1) {
		throw new CliError(
			`Malformed bitplan envelope: key.slots exceeds ${MAX_SHARED_RECIPIENTS + 1} readers.`,
		)
	}
	const seen = new Set<string>()
	const slots = k.slots.map((value, index): SharedEnvelopeSlot => {
		if (typeof value !== 'object' || value === null) {
			throw new CliError(
				`Malformed bitplan envelope: key.slots[${index}] is not an object.`,
			)
		}
		const slot = value as Record<string, unknown>
		const identityKey = assertIdentityKey(
			slot.identityKey,
			`key.slots[${index}].identityKey`,
		)
		if (seen.has(identityKey)) {
			throw new CliError(
				`Malformed bitplan envelope: duplicate reader identity ${identityKey}.`,
			)
		}
		seen.add(identityKey)
		if (!Number.isSafeInteger(slot.offset) || Number(slot.offset) < 0) {
			throw new CliError(
				`Malformed bitplan envelope: key.slots[${index}].offset is invalid.`,
			)
		}
		if (!Number.isSafeInteger(slot.length) || Number(slot.length) <= 0) {
			throw new CliError(
				`Malformed bitplan envelope: key.slots[${index}].length is invalid.`,
			)
		}
		return {
			identityKey,
			offset: Number(slot.offset),
			length: Number(slot.length),
		}
	})
	if (slots[0]?.identityKey !== senderIdentityKey) {
		throw new CliError(
			'Malformed bitplan envelope: the first shared slot must belong to the sender.',
		)
	}
	return {
		v: 2,
		key: {
			mode: 'brc2-multi',
			protocolID,
			keyID: k.keyID,
			payloadLength: Number(k.payloadLength),
			senderIdentityKey,
			slots,
		},
	}
}

function assertIdentityKey(value: unknown, field: string): string {
	if (typeof value !== 'string' || !/^(02|03)[0-9a-f]{64}$/i.test(value)) {
		throw new CliError(
			`Malformed bitplan envelope: ${field} is not a compressed identity key.`,
		)
	}
	try {
		return PublicKey.fromString(value.toLowerCase()).toString()
	} catch {
		throw new CliError(
			`Malformed bitplan envelope: ${field} is not a secp256k1 point.`,
		)
	}
}

function assertSharedLayout(
	header: SharedEnvelopeHeader,
	bodyLength: number,
): void {
	if (header.key.payloadLength >= bodyLength) {
		throw new CliError(
			'Malformed bitplan envelope: key.payloadLength does not leave room for wrapped keys.',
		)
	}
	let expectedOffset = header.key.payloadLength
	for (const slot of header.key.slots) {
		if (slot.offset !== expectedOffset) {
			throw new CliError(
				'Malformed bitplan envelope: shared ciphertext slots are not contiguous.',
			)
		}
		expectedOffset += slot.length
	}
	if (expectedOffset !== bodyLength) {
		throw new CliError(
			'Malformed bitplan envelope: shared ciphertext slots do not cover the body.',
		)
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
 * The header's keyID selects the per-draft wallet relationship. The protocol
 * is validated as BitPlan's exact BRC-43 protocol before any wallet call.
 */
export async function openEnvelope(
	wallet: EnvelopeWallet,
	bytes: Uint8Array,
): Promise<{ header: EnvelopeHeader; plaintext: DraftPlaintext }> {
	const { header, ciphertext: body } = parseEnvelope(bytes)
	const level = assertProtocolLevel(header.key.protocolID[0])
	let counterparty: string = 'self'
	let ciphertext = body
	if (header.v === 2) {
		let identityKey: string
		try {
			const result = await wallet.getPublicKey({ identityKey: true })
			identityKey = normalizeIdentityKey(result.publicKey)
		} catch (error) {
			throw new CliError(
				`The wallet could not provide its identity key to open this shared draft: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
		const slot = header.key.slots.find(
			(candidate) => candidate.identityKey === identityKey,
		)
		if (!slot) {
			throw new CliError(
				'This wallet identity is not authorized to decrypt this version of the draft.',
			)
		}
		counterparty =
			identityKey === header.key.senderIdentityKey
				? 'self'
				: header.key.senderIdentityKey
		ciphertext = body.subarray(slot.offset, slot.offset + slot.length)
	}

	let decrypted: Awaited<ReturnType<typeof wallet.decrypt>>
	try {
		decrypted = await wallet.decrypt({
			protocolID: [level, header.key.protocolID[1]],
			keyID: header.key.keyID,
			counterparty,
			ciphertext: Array.from(ciphertext),
		})
	} catch (error) {
		throw new CliError(
			`The wallet refused to decrypt this draft (protocol ${header.key.protocolID[1]}, keyID ${header.key.keyID}): ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	let plaintextBytes = Uint8Array.from(decrypted.plaintext)
	if (header.v === 2) {
		if (plaintextBytes.length !== CONTENT_KEY_BYTES) {
			throw new CliError(
				`The wallet unwrapped ${plaintextBytes.length} key bytes; a shared bitplan key must be exactly ${CONTENT_KEY_BYTES} bytes.`,
			)
		}
		try {
			const contentKey = new SymmetricKey(Array.from(plaintextBytes))
			plaintextBytes = Uint8Array.from(
				contentKey.decrypt(
					Array.from(body.subarray(0, header.key.payloadLength)),
				) as number[],
			)
		} catch {
			throw new CliError(
				'The shared draft payload failed authenticated decryption.',
			)
		}
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(new TextDecoder().decode(plaintextBytes))
	} catch {
		throw new CliError(
			'Decrypted this draft but its plaintext is not valid JSON.',
		)
	}

	return { header, plaintext: assertPlaintext(parsed) }
}
