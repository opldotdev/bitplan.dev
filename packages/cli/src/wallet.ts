/**
 * Wallet access.
 *
 * bitplan is a BRC-100 client: it never receives an identity private key,
 * derives an identity key, or signs anything itself. Identity-key operations
 * and transaction calls go to the user's wallet over the local BRC-100 JSON
 * API. Shared envelopes do use a transient SDK-generated document key. There
 * is no embedded wallet and no fallback: if nothing answers on the bridge, the
 * command fails and says so.
 */

import { HTTPWalletJSON, WalletClient, type WalletInterface } from '@bsv/sdk'
import { DEFAULT_WALLET_URL, ORIGINATOR } from './constants.js'
import { CliError } from './errors.js'
import { assertSecureHttpUrl, fetchBoundedResponse } from './http.js'
import { readConfig } from './state.js'

export interface WalletConnection {
	wallet: WalletInterface
	url: string
	version: string
}

const WALLET_TIMEOUT_MS = 45_000
const WALLET_RESPONSE_MAX_BYTES = 4 * 1024 * 1024
const WALLET_TRANSACTION_RESPONSE_MAX_BYTES = 32 * 1024 * 1024

function walletResponseLimit(input: string | URL | Request): number {
	const path = input instanceof Request ? input.url : input.toString()
	const method = new URL(path).pathname.split('/').at(-1)
	return method === 'createAction' || method === 'signAction'
		? WALLET_TRANSACTION_RESPONSE_MAX_BYTES
		: WALLET_RESPONSE_MAX_BYTES
}

const walletHttpClient = (async (
	input: string | URL | Request,
	init?: RequestInit,
) =>
	fetchBoundedResponse(input, init, {
		label: 'Wallet response',
		maxBytes: walletResponseLimit(input),
		timeoutMs: WALLET_TIMEOUT_MS,
	})) as unknown as typeof fetch

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
	let endpoint: URL
	try {
		endpoint = new URL(url)
	} catch {
		throw new CliError(
			`Invalid wallet URL: ${JSON.stringify(url)}. Expected an https URL or a loopback http URL.`,
		)
	}
	assertSecureHttpUrl(endpoint, 'wallet')
	return new WalletClient(
		new HTTPWalletJSON(ORIGINATOR, url, walletHttpClient),
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
