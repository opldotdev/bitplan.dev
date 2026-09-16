/**
 * The OpenCode plugin. Hook names and signatures follow
 * packages/plugin/src/index.ts in anomalyco/opencode (`Hooks.config`,
 * `Hooks.provider.models`, `Hooks.auth.{loader,methods}`).
 *
 * Why each hook is used the way it is:
 *
 * - `config`: OpenCode's `provider.models` hook only runs for providers that
 *   already exist in its models.dev catalog; `bitplan` does not. The `config`
 *   hook runs before OpenCode reads `config.provider`, so the provider and its
 *   model list are injected there, exactly as if they were in opencode.json.
 * - `provider.models`: defined too, so the catalog is served from the same
 *   mapping should the provider ever be listed upstream.
 * - `auth.methods`: OpenCode treats every `type: "api"` method as "paste a
 *   key" (CLI `providers.ts`, TUI `dialog-provider.tsx`) and only runs
 *   `authorize()` for `type: "oauth"`. Connecting the wallet therefore uses an
 *   oauth method with `method: "auto"`: the callback signs the token and
 *   OpenCode stores the returned `key` as `{ type: "api", key, metadata }`.
 *   A plain api method is offered as well for a token minted elsewhere
 *   (`bitplan gateway token`).
 * - `auth.loader`: runs at startup once the auth store has an entry, and
 *   returns provider options: `apiKey` and a `fetch` that re-signs when the
 *   token is due and pays a 402 from the wallet.
 */

import type { WalletInterface } from '@bsv/sdk'
import type {
	Hooks,
	Plugin,
	PluginInput,
	PluginOptions,
} from '@opencode-ai/plugin'
import { errorMessage, GatewayError } from './errors.js'
import { createGatewayFetch, type FetchLike } from './fetch.js'
import { gatewayOrigin } from './gateway.js'
import {
	type Catalog,
	fetchCatalog,
	type MapOptions,
	mapCatalogToConfig,
	mapCatalogToModels,
} from './models.js'
import {
	createTokenSource,
	type Log,
	type MintedToken,
	mintWithWallet,
	type StoredToken,
	tokenMetadata,
} from './session.js'
import { connectWallet, resolveWalletUrl } from './wallet.js'

export const PROVIDER_ID = 'bitplan'
export const PROVIDER_NAME = 'BitPlan Gateway'
export const PROVIDER_NPM = '@ai-sdk/openai-compatible'
export const CONNECT_LABEL = 'Connect BRC-100 wallet'
export const PASTE_LABEL = 'Paste a gateway token (bitplan gateway token)'

/** The second element of a `["opencode-plugin-bitplan", { ... }]` plugin entry. */
export interface BitplanPluginOptions {
	/** BRC-100 JSON API endpoint. Default: BITPLAN_WALLET_URL, ~/.bitplan/config.json, then BSV Desktop. */
	walletUrl?: string
	/** Gateway origin. Default: https://gateway.bitplan.dev */
	gatewayUrl?: string
	/** Gateway BYOK provider ids this account has stored a key for, e.g. ["opencode-go"]. */
	byok?: string[]
	/** Output token limit advertised for every model. Default 8192. */
	maxOutputTokens?: number
}

function optionError(name: string, expected: string): GatewayError {
	return new GatewayError(`Plugin option "${name}" must be ${expected}.`)
}

export function parseOptions(
	raw: PluginOptions | undefined,
): BitplanPluginOptions {
	const options: BitplanPluginOptions = {}
	if (raw === undefined) return options
	if (raw.walletUrl !== undefined) {
		if (typeof raw.walletUrl !== 'string' || raw.walletUrl === '') {
			throw optionError('walletUrl', 'a non-empty string')
		}
		options.walletUrl = raw.walletUrl
	}
	if (raw.gatewayUrl !== undefined) {
		if (typeof raw.gatewayUrl !== 'string' || raw.gatewayUrl === '') {
			throw optionError('gatewayUrl', 'a non-empty string')
		}
		options.gatewayUrl = raw.gatewayUrl
	}
	if (raw.byok !== undefined) {
		if (
			!Array.isArray(raw.byok) ||
			!raw.byok.every((v) => typeof v === 'string')
		) {
			throw optionError('byok', 'an array of provider ids')
		}
		options.byok = raw.byok
	}
	if (raw.maxOutputTokens !== undefined) {
		if (
			!Number.isSafeInteger(raw.maxOutputTokens) ||
			(raw.maxOutputTokens as number) <= 0
		) {
			throw optionError('maxOutputTokens', 'a positive integer')
		}
		options.maxOutputTokens = raw.maxOutputTokens as number
	}
	return options
}

/** Seams for tests; production uses the real wallet and the real network. */
export interface PluginDeps {
	fetch?: FetchLike
	connect?: (walletUrl: string) => Promise<WalletInterface>
	env?: Record<string, string | undefined>
	home?: string
}

export function createBitplanPlugin(deps: PluginDeps = {}): Plugin {
	const connect =
		deps.connect ?? (async (url: string) => (await connectWallet(url)).wallet)

	return async (
		input: PluginInput,
		rawOptions?: PluginOptions,
	): Promise<Hooks> => {
		const options = parseOptions(rawOptions)
		const origin = gatewayOrigin(options.gatewayUrl)
		const baseURL = `${origin}/v1`
		const mapOptions: MapOptions = {
			byok: options.byok,
			maxOutputTokens: options.maxOutputTokens,
		}

		const log: Log = (level, message, extra) => {
			void Promise.resolve()
				.then(() =>
					input.client.app.log({
						body: { service: 'bitplan', level, message, extra },
					}),
				)
				.catch(() => undefined)
		}

		let catalogPromise: Promise<Catalog> | undefined
		const catalog = (): Promise<Catalog> => {
			catalogPromise ??= fetchCatalog(origin, deps.fetch).catch(
				(error: unknown) => {
					catalogPromise = undefined
					throw error
				},
			)
			return catalogPromise
		}

		// Resolved on first use so a wrong setting surfaces where the person
		// can see it (the connect flow or the request) rather than as a silent
		// plugin load failure.
		const walletUrl = (): string =>
			resolveWalletUrl({
				option: options.walletUrl,
				env: deps.env,
				home: deps.home,
			})
		const wallet = (): Promise<WalletInterface> => connect(walletUrl())
		const mint = async (): Promise<MintedToken> =>
			mintWithWallet(await wallet(), origin)

		const saveAuth = async (info: StoredToken): Promise<void> => {
			const result = await input.client.auth.set({
				path: { id: PROVIDER_ID },
				body: info,
			})
			if (result.error) {
				throw new GatewayError(
					`OpenCode refused to store the new gateway token: ${JSON.stringify(result.error)}`,
				)
			}
		}

		return {
			async config(cfg) {
				cfg.provider ??= {}
				const existing = cfg.provider[PROVIDER_ID] ?? {}
				let models: ReturnType<typeof mapCatalogToConfig> = {}
				try {
					models = mapCatalogToConfig(await catalog(), mapOptions)
				} catch (error) {
					log(
						'warn',
						'Could not load the gateway model catalog; only models from opencode.json are available.',
						{
							reason: errorMessage(error),
						},
					)
				}
				cfg.provider[PROVIDER_ID] = {
					npm: PROVIDER_NPM,
					name: PROVIDER_NAME,
					...existing,
					options: { baseURL, ...existing.options },
					models: { ...models, ...existing.models },
				}
			},

			provider: {
				id: PROVIDER_ID,
				async models(provider) {
					const listed = mapCatalogToModels(
						PROVIDER_ID,
						baseURL,
						await catalog(),
						mapOptions,
					)
					return { ...provider.models, ...listed }
				},
			},

			auth: {
				provider: PROVIDER_ID,
				async loader(getAuth) {
					const auth = await getAuth()
					if (auth?.type !== 'api') return {}
					const tokens = createTokenSource({ getAuth, saveAuth, mint, log })
					return {
						apiKey: auth.key,
						fetch: createGatewayFetch({
							token: tokens.current,
							wallet,
							fetch: deps.fetch,
							log,
						}),
					}
				},
				methods: [
					{
						type: 'oauth',
						label: CONNECT_LABEL,
						async authorize() {
							const url = walletUrl()
							return {
								url: '',
								instructions: `Approve the signature request in your BRC-100 wallet at ${url}. Nothing is typed or exported: the wallet signs a 24-hour gateway token and OpenCode refreshes it through the wallet before it expires.`,
								method: 'auto',
								async callback() {
									try {
										const minted = await mint()
										return {
											type: 'success',
											key: minted.token,
											metadata: tokenMetadata(minted, 'wallet'),
										}
									} catch (error) {
										log('error', 'Connecting the BRC-100 wallet failed.', {
											reason: errorMessage(error),
										})
										return { type: 'failed' }
									}
								},
							}
						},
					},
					{
						type: 'api',
						label: PASTE_LABEL,
					},
				],
			},
		}
	}
}
