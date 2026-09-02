/**
 * Throwaway secp256k1 keys used as envelope reader slots.
 *
 * The public half is an ordinary shared-envelope identity. The private half
 * travels in the viewer URL fragment (`#k=`) so `bitplan fetch` can open the
 * plan without a wallet.
 */

import { Buffer } from 'node:buffer'
import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'

/** 32 random bytes as 64 lowercase hex characters. */
export function newLinkSecret(): string {
	return PrivateKey.fromRandom().toHex().padStart(64, '0').toLowerCase()
}

/** Compressed public key (66 hex) for the slot. */
export function linkIdentityKey(secretHex: string): string {
	return PrivateKey.fromHex(secretHex).toPublicKey().toString()
}

/** `k=<base64url of the 32 secret bytes>` (43 chars, no padding). */
export function linkFragment(secretHex: string): string {
	return `k=${Buffer.from(secretHex, 'hex').toString('base64url')}`
}

/** Full viewer URL with the fragment. */
export function linkUrl(viewerUrl: string, secretHex: string): string {
	return `${viewerUrl}#${linkFragment(secretHex)}`
}

/**
 * Parse `#k=...` or `k=...` or a whole URL. Returns 64-hex or null.
 * Rejects anything that is not exactly 32 bytes.
 */
export function parseLinkFragment(input: string): string | null {
	const trimmed = input.trim()
	if (!trimmed) return null

	let candidate = trimmed
	if (/^https?:\/\//i.test(trimmed)) {
		try {
			candidate = new URL(trimmed).hash
		} catch {
			return null
		}
	}
	if (candidate.startsWith('#')) candidate = candidate.slice(1)
	if (!candidate.startsWith('k=')) return null

	const encoded = candidate.slice(2)
	if (!encoded) return null
	try {
		const bytes = Buffer.from(encoded, 'base64url')
		if (bytes.length !== 32) return null
		return bytes.toString('hex')
	} catch {
		return null
	}
}

/**
 * A wallet that can open envelopes for this link:
 * `new ProtoWallet(PrivateKey.fromHex(secretHex))` narrowed to decrypt +
 * getPublicKey.
 */
export function linkWallet(
	secretHex: string,
): Pick<WalletInterface, 'decrypt' | 'getPublicKey'> {
	return new ProtoWallet(PrivateKey.fromHex(secretHex))
}
