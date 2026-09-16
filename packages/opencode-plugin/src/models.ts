/**
 * The gateway catalog (`GET /v1/models`) mapped to OpenCode's model shapes:
 * the `provider.<id>.models` config entry the `config` hook writes, and the
 * full runtime `Model` the `provider.models` hook returns.
 */

import type { Config } from '@opencode-ai/plugin'
import type { Model } from '@opencode-ai/sdk/v2'
import { GatewayError } from './errors.js'

export interface CatalogPricing {
	usd_per_million_input: number | null
	usd_per_million_output: number | null
	usd_per_million_cached_input?: number | null
	usd_per_million_cache_write?: number | null
	sats_per_million_input?: number | null
	sats_per_million_output?: number | null
	sats_per_image?: number | null
	mode?: string
}

export interface CatalogModel {
	id: string
	name: string
	owned_by?: string
	type: string
	recommended: boolean
	byok_only: boolean
	context_window: number | null
	pricing: CatalogPricing
}

export interface Catalog {
	data: CatalogModel[]
	bsv_usd?: number
}

type ProviderConfig = NonNullable<NonNullable<Config['provider']>[string]>
export type ModelConfig = NonNullable<ProviderConfig['models']>[string]

export interface MapOptions {
	/**
	 * Gateway BYOK provider ids this account has stored a key for
	 * (`opencode`, `opencode-go`). Their `byok_only` models are listed only
	 * when named here, because without the key the gateway refuses the call.
	 */
	byok?: readonly string[]
	/** Default output limit when the catalog does not state one. */
	maxOutputTokens?: number
	/** Assumed context window when the catalog does not state one. */
	defaultContextWindow?: number
}

/** OpenCode caps requested output at 32k; the gateway sizes its hold by it. */
/**
 * Default output limit. The gateway holds max_tokens times the output price
 * before every call, so this directly sizes the up-front reserve; 8k keeps
 * a first call on a frontier model to cents while leaving room for code.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192
export const DEFAULT_CONTEXT_WINDOW = 128_000

/** The gateway provider a model runs on: the first id segment for BYOK-only ids. */
export function byokProviderOf(model: CatalogModel): string {
	return model.id.split('/', 1)[0] ?? model.id
}

/** Language models only: no image models, no BYOK-only models without a key. */
export function selectModels(
	catalog: Catalog,
	options: MapOptions = {},
): CatalogModel[] {
	const byok = new Set(options.byok ?? [])
	return catalog.data
		.filter((m) => m.type !== 'image' && m.pricing.sats_per_image == null)
		.filter((m) => !m.byok_only || byok.has(byokProviderOf(m)))
		.sort(
			(a, b) =>
				Number(b.recommended) - Number(a.recommended) ||
				a.id.localeCompare(b.id),
		)
}

function usd(value: number | null | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** One `provider.bitplan.models[id]` entry for opencode.json. */
export function toModelConfig(
	model: CatalogModel,
	options: MapOptions = {},
): ModelConfig {
	return {
		name: model.recommended ? `${model.name} ★` : model.name,
		tool_call: true,
		temperature: true,
		limit: {
			context:
				model.context_window ??
				options.defaultContextWindow ??
				DEFAULT_CONTEXT_WINDOW,
			output: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
		},
		cost: {
			input: usd(model.pricing.usd_per_million_input),
			output: usd(model.pricing.usd_per_million_output),
			cache_read: usd(model.pricing.usd_per_million_cached_input),
			cache_write: usd(model.pricing.usd_per_million_cache_write),
		},
		status: 'active',
	}
}

/** The `models` map for the `config` hook, recommended models first. */
export function mapCatalogToConfig(
	catalog: Catalog,
	options: MapOptions = {},
): Record<string, ModelConfig> {
	return Object.fromEntries(
		selectModels(catalog, options).map((m) => [
			m.id,
			toModelConfig(m, options),
		]),
	)
}

/** The full runtime model for the `provider.models` hook. */
export function toModel(
	providerID: string,
	baseURL: string,
	model: CatalogModel,
	options: MapOptions = {},
): Model {
	const config = toModelConfig(model, options)
	return {
		id: model.id,
		providerID,
		api: { id: model.id, url: baseURL, npm: '@ai-sdk/openai-compatible' },
		name: config.name ?? model.name,
		family: byokProviderOf(model),
		capabilities: {
			temperature: true,
			reasoning: false,
			attachment: false,
			toolcall: true,
			input: {
				text: true,
				audio: false,
				image: false,
				video: false,
				pdf: false,
			},
			output: {
				text: true,
				audio: false,
				image: false,
				video: false,
				pdf: false,
			},
			interleaved: false,
		},
		cost: {
			input: config.cost?.input ?? 0,
			output: config.cost?.output ?? 0,
			cache: {
				read: config.cost?.cache_read ?? 0,
				write: config.cost?.cache_write ?? 0,
			},
		},
		limit: {
			context: config.limit?.context ?? DEFAULT_CONTEXT_WINDOW,
			output: config.limit?.output ?? DEFAULT_MAX_OUTPUT_TOKENS,
		},
		status: 'active',
		options: {},
		headers: {},
		release_date: '',
	}
}

export function mapCatalogToModels(
	providerID: string,
	baseURL: string,
	catalog: Catalog,
	options: MapOptions = {},
): Record<string, Model> {
	return Object.fromEntries(
		selectModels(catalog, options).map((m) => [
			m.id,
			toModel(providerID, baseURL, m, options),
		]),
	)
}

const CATALOG_TIMEOUT_MS = 15_000

/** Fetch and validate `GET <origin>/v1/models`. */
export async function fetchCatalog(
	origin: string,
	fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Catalog> {
	const res = await fetchImpl(`${origin}/v1/models`, {
		headers: { accept: 'application/json' },
		signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
	})
	if (!res.ok)
		throw new GatewayError(`Listing gateway models failed (${res.status}).`)
	const body = (await res.json()) as Partial<Catalog>
	if (!Array.isArray(body.data)) {
		throw new GatewayError(
			'Listing gateway models failed: no "data" array in the response.',
		)
	}
	return { data: body.data, bsv_usd: body.bsv_usd }
}
