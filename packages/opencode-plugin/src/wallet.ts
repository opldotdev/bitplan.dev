/**
 * Wallet access, the same way the bitplan CLI does it: a BRC-100 JSON API on
 * the local machine (BSV Desktop on 127.0.0.1:3321 by default). The plugin
 * never receives a private key; identity, signatures and payments are wallet
 * calls. There is no embedded wallet and no fallback: if nothing answers, the
 * call fails and says so.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { HTTPWalletJSON, WalletClient, type WalletInterface } from '@bsv/sdk'
import { errorMessage, GatewayError } from './errors.js'
import { assertSecureHttpUrl } from './gateway.js'

/** BRC-100 originator, shared with the CLI so the wallet's grants apply to both. */
export const ORIGINATOR = 'bitplan.dev'

/** Default BRC-100 JSON API endpoint (BSV Desktop). */
export const DEFAULT_WALLET_URL = 'http://127.0.0.1:3321'

/** Environment variable naming the wallet endpoint. Read verbatim, never trimmed. */
export const WALLET_URL_ENV = 'BITPLAN_WALLET_URL'

const WALLET_TIMEOUT_MS = 45_000

export interface WalletConnection {
	wallet: WalletInterface
	url: string
	version: string
}

export interface WalletUrlSources {
	/** `walletUrl` from the plugin entry in opencode.json. */
	option?: unknown
	env?: Record<string, string | undefined>
	/** Directory holding `.bitplan/config.json`; defaults to the home directory. */
	home?: string
}

function configuredWalletUrl(home: string): string | undefined {
	const file = path.join(home, '.bitplan', 'config.json')
	let text: string
	try {
		text = fs.readFileSync(file, 'utf8')
	} catch {
		return undefined
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new GatewayError(`${file} is not valid JSON.`)
	}
	const value = (parsed as { walletUrl?: unknown } | null)?.walletUrl
	if (value === undefined) return undefined
	if (typeof value !== 'string' || value === '') {
		throw new GatewayError(`${file}: "walletUrl" must be a non-empty string.`)
	}
	return value
}

/**
 * Endpoint to use, first match wins: plugin option `walletUrl`, then
 * `BITPLAN_WALLET_URL`, then `~/.bitplan/config.json` (shared with the CLI),
 * then BSV Desktop's default. A source that is present but wrong fails; it is
 * never skipped in favour of the next one.
 */
export function resolveWalletUrl(sources: WalletUrlSources = {}): string {
	const { option } = sources
	if (option !== undefined) {
		if (typeof option !== 'string' || option === '') {
			throw new GatewayError(
				'Plugin option "walletUrl" must be a non-empty string.',
			)
		}
		return option
	}
	const env = sources.env ?? process.env
	const fromEnv = env[WALLET_URL_ENV]
	if (fromEnv !== undefined) {
		if (fromEnv === '') {
			throw new GatewayError(`${WALLET_URL_ENV} is set but empty.`)
		}
		return fromEnv
	}
	const configured = configuredWalletUrl(sources.home ?? os.homedir())
	if (configured !== undefined) return configured
	return DEFAULT_WALLET_URL
}

const walletHttpClient = (async (
	input: string | URL | Request,
	init?: RequestInit,
) =>
	fetch(input, {
		...init,
		redirect: 'error',
		signal: AbortSignal.timeout(WALLET_TIMEOUT_MS),
	})) as typeof fetch

/**
 * Build a wallet client pinned to one HTTP substrate. `WalletClient('auto')`
 * races several substrates, which is right for a browser and wrong here: talk
 * to the wallet the person configured, or fail loudly.
 */
export function createWallet(url: string): WalletInterface {
	let endpoint: URL
	try {
		endpoint = new URL(url)
	} catch {
		throw new GatewayError(
			`Invalid wallet URL: ${JSON.stringify(url)}. Expected an https URL or a loopback http URL.`,
		)
	}
	assertSecureHttpUrl(endpoint, 'wallet')
	return new WalletClient(
		new HTTPWalletJSON(ORIGINATOR, url, walletHttpClient),
		ORIGINATOR,
	) as WalletInterface
}

/** Connect and confirm a wallet is really there before asking it to sign or pay. */
export async function connectWallet(url: string): Promise<WalletConnection> {
	const wallet = createWallet(url)
	let version: string
	try {
		const result = await wallet.getVersion({})
		version = result.version
	} catch (error) {
		throw new GatewayError(
			[
				`No BRC-100 wallet answered at ${url}.`,
				'Start BSV Desktop (or another BRC-100 wallet serving the JSON API), make sure it is unlocked, and try again.',
				`Set a different endpoint with the plugin option "walletUrl", ${WALLET_URL_ENV}, or "walletUrl" in ~/.bitplan/config.json.`,
				`Underlying error: ${errorMessage(error)}`,
			].join(' '),
		)
	}
	return { wallet, url, version }
}

/** The person's identity public key, as the wallet reports it. */
export async function identityKey(wallet: WalletInterface): Promise<string> {
	const { publicKey } = await wallet.getPublicKey({ identityKey: true })
	return publicKey
}
