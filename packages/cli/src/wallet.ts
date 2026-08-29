/**
 * Wallet access.
 *
 * bitplan is a pure BRC-100 client: it holds no keys, derives nothing, and
 * signs nothing itself. Every key operation — encrypt, decrypt, getPublicKey,
 * createAction, signAction — is a call to the user's wallet over the local
 * BRC-100 JSON API. There is no embedded wallet and no fallback: if nothing
 * answers on the bridge, the command fails and says so.
 */

import { HTTPWalletJSON, WalletClient, type WalletInterface } from '@bsv/sdk'
import { DEFAULT_WALLET_URL, ORIGINATOR } from './constants.js'
import { CliError } from './errors.js'
import { readConfig } from './state.js'

export interface WalletConnection {
	wallet: WalletInterface
	url: string
	version: string
}

/** Endpoint to use: `--wallet-url`, then `~/.bitplan/config.json`, then the default. */
export function resolveWalletUrl(override?: string): string {
	if (override) return override
	const configured = readConfig().walletUrl
	if (configured) return configured
	return DEFAULT_WALLET_URL
}

/**
 * Build a wallet client pinned to one substrate.
 *
 * `WalletClient('auto')` races five substrates and picks whichever answers,
 * which is right for a browser and wrong for a CLI: bitplan should talk to the
 * wallet the user configured, or fail loudly.
 */
export function createWallet(url: string): WalletInterface {
	return new WalletClient(
		new HTTPWalletJSON(ORIGINATOR, url),
		ORIGINATOR,
	) as WalletInterface
}

/**
 * Connect and confirm a wallet is really there before doing anything that
 * would half-succeed against a dead endpoint.
 */
export async function connectWallet(
	override?: string,
): Promise<WalletConnection> {
	const url = resolveWalletUrl(override)
	const wallet = createWallet(url)

	let version: string
	try {
		const result = await wallet.getVersion({})
		version = result.version
	} catch (error) {
		throw new CliError(
			[
				`No BRC-100 wallet answered at ${url}.`,
				'',
				'Start BSV Desktop (or another BRC-100 wallet serving the JSON API)',
				'and make sure it is unlocked, then run this command again.',
				'',
				`Set a different endpoint with --wallet-url, or "walletUrl" in ~/.bitplan/config.json.`,
				'',
				`Underlying error: ${errorMessage(error)}`,
			].join('\n'),
		)
	}

	return { wallet, url, version }
}

/** The user's identity public key, as the wallet reports it. */
export async function identityKey(wallet: WalletInterface): Promise<string> {
	const { publicKey } = await wallet.getPublicKey({ identityKey: true })
	return publicKey
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error)
}
