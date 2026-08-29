import type { WalletInterface } from '@bsv/sdk'

/**
 * A stand-in for the user's wallet.
 *
 * encrypt/decrypt are a real involution — XOR against a fixed non-zero pad —
 * rather than the identity, so a test that round-trips an envelope actually
 * proves the wrap and unwrap ran and transformed bytes. An identity mock would
 * pass even if `sealEnvelope` forgot to call wallet.encrypt at all.
 */
const PAD = Uint8Array.from(
	Array.from({ length: 32 }, (_, i) => ((i * 37 + 11) % 251) + 1),
)

export function xorPad(bytes: number[]): number[] {
	return bytes.map((byte, i) => byte ^ (PAD[i % PAD.length] ?? 0))
}

export interface MockWalletCalls {
	encrypt: Array<{ protocolID: unknown; keyID: string; counterparty?: string }>
	decrypt: Array<{ protocolID: unknown; keyID: string; counterparty?: string }>
	getPublicKey: number
}

export function createMockWallet(
	identityKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
): {
	wallet: WalletInterface
	calls: MockWalletCalls
} {
	const calls: MockWalletCalls = { encrypt: [], decrypt: [], getPublicKey: 0 }

	const wallet = {
		async getPublicKey() {
			calls.getPublicKey += 1
			return { publicKey: identityKey }
		},
		async encrypt(args: {
			protocolID: unknown
			keyID: string
			counterparty?: string
			plaintext: number[]
		}) {
			calls.encrypt.push({
				protocolID: args.protocolID,
				keyID: args.keyID,
				counterparty: args.counterparty,
			})
			return { ciphertext: xorPad(args.plaintext) }
		},
		async decrypt(args: {
			protocolID: unknown
			keyID: string
			counterparty?: string
			ciphertext: number[]
		}) {
			calls.decrypt.push({
				protocolID: args.protocolID,
				keyID: args.keyID,
				counterparty: args.counterparty,
			})
			return { plaintext: xorPad(args.ciphertext) }
		},
	} as unknown as WalletInterface

	return { wallet, calls }
}
