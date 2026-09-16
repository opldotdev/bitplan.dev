/**
 * Token lifecycle. OpenCode keeps the current token in its auth store
 * (`~/.local/share/opencode/auth.json`) as `{ type: "api", key, metadata }`;
 * this module decides when it is time to ask the wallet for a fresh one and
 * writes the replacement back through the OpenCode SDK.
 */

import type { WalletInterface } from '@bsv/sdk'
import type { Auth } from '@opencode-ai/sdk/v2'
import { errorMessage, GatewayError } from './errors.js'
import { mintGatewayToken, parseToken } from './gateway.js'
import { identityKey } from './wallet.js'

/** Mint a replacement this long before the gateway would reject the token. */
export const REFRESH_SKEW_MS = 30 * 60 * 1000

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Log = (
	level: LogLevel,
	message: string,
	extra?: Record<string, unknown>,
) => void

export interface StoredToken {
	type: 'api'
	key: string
	metadata?: Record<string, string>
}

export interface MintedToken {
	token: string
	identityKey: string
}

/** Connect to the wallet and sign a fresh 24 h session token for `origin`. */
export async function mintWithWallet(
	wallet: WalletInterface,
	origin: string,
): Promise<MintedToken> {
	const key = await identityKey(wallet)
	let token: string
	try {
		token = await mintGatewayToken(wallet, key, origin)
	} catch (error) {
		throw new GatewayError(
			`The wallet declined to sign the gateway token: ${errorMessage(error)}`,
		)
	}
	return { token, identityKey: key }
}

/** What the auth store keeps beside the token. Values are strings by contract. */
export function tokenMetadata(
	minted: MintedToken,
	source: 'wallet' | 'pasted',
): Record<string, string> {
	const info = parseToken(minted.token)
	return {
		source,
		identity_key: minted.identityKey,
		expires_at: info ? new Date(info.expiresAt).toISOString() : '',
	}
}

/** True when the token is malformed, expired, or inside the refresh window. */
export function needsRefresh(token: string, now = Date.now()): boolean {
	const info = parseToken(token)
	if (!info) return true
	return info.expiresAt - REFRESH_SKEW_MS <= now
}

/** True when the gateway would still accept the token right now. */
export function isUsable(token: string, now = Date.now()): boolean {
	const info = parseToken(token)
	return info !== null && info.expiresAt > now
}

export interface TokenSourceOptions {
	/** Read the provider's current entry from OpenCode's auth store. */
	getAuth: () => Promise<Auth | undefined>
	/** Write a replacement entry to OpenCode's auth store. */
	saveAuth: (info: StoredToken) => Promise<void>
	/** Ask the wallet for a new token. */
	mint: () => Promise<MintedToken>
	now?: () => number
	log?: Log
}

export interface TokenSource {
	/** The token to send right now, refreshed through the wallet when due. */
	current(): Promise<string>
}

/**
 * Hands out the stored token while it is fresh and refreshes it once per
 * expiry window, coalescing concurrent requests onto a single wallet prompt.
 * A wallet that is not running does not break a token that is still valid;
 * it only becomes an error once the token has actually expired.
 */
export function createTokenSource(options: TokenSourceOptions): TokenSource {
	const now = options.now ?? Date.now
	const log = options.log ?? (() => undefined)
	let refreshing: Promise<string> | undefined

	async function refresh(previous: string): Promise<string> {
		let minted: MintedToken
		try {
			minted = await options.mint()
		} catch (error) {
			if (isUsable(previous, now())) {
				log(
					'warn',
					'Could not refresh the gateway token yet; using the current one until it expires.',
					{
						reason: errorMessage(error),
					},
				)
				return previous
			}
			throw new GatewayError(
				`The gateway token has expired and the wallet could not sign a new one: ${errorMessage(error)} Run /connect and choose BitPlan Gateway once the wallet is running.`,
			)
		}
		await options.saveAuth({
			type: 'api',
			key: minted.token,
			metadata: tokenMetadata(minted, 'wallet'),
		})
		log('info', 'Minted a new gateway token.', {
			identityKey: minted.identityKey,
			expiresAt: tokenMetadata(minted, 'wallet').expires_at,
		})
		return minted.token
	}

	return {
		async current() {
			const auth = await options.getAuth()
			if (auth?.type !== 'api') {
				throw new GatewayError(
					'BitPlan Gateway is not connected. Run /connect and choose BitPlan Gateway.',
				)
			}
			if (!needsRefresh(auth.key, now())) return auth.key
			if (!refreshing) {
				refreshing = refresh(auth.key).finally(() => {
					refreshing = undefined
				})
			}
			return refreshing
		},
	}
}
