import { describe, expect, test } from 'bun:test'
import {
	type Catalog,
	DEFAULT_CONTEXT_WINDOW,
	DEFAULT_MAX_OUTPUT_TOKENS,
	fetchCatalog,
	mapCatalogToConfig,
	mapCatalogToModels,
	selectModels,
} from '../src/models.js'

/** Shaped like GET /v1/models (apps/api/src/routes/models.ts), trimmed. */
export const SAMPLE: Catalog = {
	bsv_usd: 42.5,
	data: [
		{
			id: 'anthropic/claude-opus-4.8',
			name: 'Claude Opus 4.8',
			owned_by: 'anthropic',
			type: 'language',
			recommended: true,
			byok_only: false,
			context_window: 200000,
			pricing: {
				mode: 'markup',
				usd_per_million_input: 19.5,
				usd_per_million_output: 97.5,
				usd_per_million_cached_input: 1.95,
				usd_per_million_cache_write: 24.38,
				sats_per_million_input: 45882353,
				sats_per_million_output: 229411765,
				sats_per_image: null,
			},
		},
		{
			id: 'alibaba/qwen3-coder',
			name: 'Qwen3 Coder',
			owned_by: 'alibaba',
			type: 'language',
			recommended: false,
			byok_only: false,
			context_window: null,
			pricing: {
				mode: 'markup',
				usd_per_million_input: 0.29,
				usd_per_million_output: 1.17,
				usd_per_million_cached_input: null,
				usd_per_million_cache_write: null,
				sats_per_image: null,
			},
		},
		{
			id: 'openrouter/deepseek/deepseek-v4',
			name: 'DeepSeek V4',
			owned_by: 'openrouter',
			type: 'language',
			recommended: false,
			byok_only: false,
			context_window: 128000,
			pricing: {
				mode: 'markup',
				usd_per_million_input: 0.36,
				usd_per_million_output: 1.43,
				sats_per_image: null,
			},
		},
		{
			id: 'opencode-go/kimi-k3',
			name: 'Kimi K3',
			owned_by: 'opencode-go',
			type: 'language',
			recommended: false,
			byok_only: true,
			context_window: 256000,
			pricing: {
				mode: 'fee',
				usd_per_million_input: 0.03,
				usd_per_million_output: 0.13,
				sats_per_image: null,
			},
		},
		{
			id: 'opencode/glm-5.3',
			name: 'GLM 5.3',
			owned_by: 'opencode',
			type: 'language',
			recommended: false,
			byok_only: true,
			context_window: 200000,
			pricing: {
				mode: 'fee',
				usd_per_million_input: 0.03,
				usd_per_million_output: 0.11,
				sats_per_image: null,
			},
		},
		{
			id: 'google/imagen-4',
			name: 'Imagen 4',
			owned_by: 'google',
			type: 'image',
			recommended: false,
			byok_only: false,
			context_window: null,
			pricing: {
				mode: 'markup',
				usd_per_million_input: null,
				usd_per_million_output: null,
				sats_per_image: 120000,
			},
		},
	],
}

describe('selectModels', () => {
	test('drops image models and BYOK-only models, recommended first', () => {
		expect(selectModels(SAMPLE).map((m) => m.id)).toEqual([
			'anthropic/claude-opus-4.8',
			'alibaba/qwen3-coder',
			'openrouter/deepseek/deepseek-v4',
		])
	})

	test('includes BYOK-only models for providers the account has a key for', () => {
		expect(
			selectModels(SAMPLE, { byok: ['opencode-go'] }).map((m) => m.id),
		).toEqual([
			'anthropic/claude-opus-4.8',
			'alibaba/qwen3-coder',
			'opencode-go/kimi-k3',
			'openrouter/deepseek/deepseek-v4',
		])
	})
})

describe('mapCatalogToConfig', () => {
	test('produces opencode.json model entries with USD per million and limits', () => {
		const models = mapCatalogToConfig(SAMPLE)
		expect(Object.keys(models)[0]).toBe('anthropic/claude-opus-4.8')
		expect(models['anthropic/claude-opus-4.8']).toEqual({
			name: 'Claude Opus 4.8 ★',
			tool_call: true,
			temperature: true,
			limit: { context: 200000, output: DEFAULT_MAX_OUTPUT_TOKENS },
			cost: { input: 19.5, output: 97.5, cache_read: 1.95, cache_write: 24.38 },
			status: 'active',
		})
		expect(models['alibaba/qwen3-coder']).toMatchObject({
			name: 'Qwen3 Coder',
			limit: {
				context: DEFAULT_CONTEXT_WINDOW,
				output: DEFAULT_MAX_OUTPUT_TOKENS,
			},
			cost: { input: 0.29, output: 1.17, cache_read: 0, cache_write: 0 },
		})
		expect(models['google/imagen-4']).toBeUndefined()
		expect(models['opencode/glm-5.3']).toBeUndefined()
	})

	test('honours the output limit option', () => {
		const models = mapCatalogToConfig(SAMPLE, { maxOutputTokens: 8192 })
		expect(models['anthropic/claude-opus-4.8']?.limit?.output).toBe(8192)
	})
})

describe('mapCatalogToModels', () => {
	test('produces full runtime models pointing at the gateway with the openai-compatible SDK', () => {
		const models = mapCatalogToModels(
			'bitplan',
			'https://gateway.bitplan.dev/v1',
			SAMPLE,
		)
		const opus = models['anthropic/claude-opus-4.8']
		expect(opus).toMatchObject({
			id: 'anthropic/claude-opus-4.8',
			providerID: 'bitplan',
			api: {
				id: 'anthropic/claude-opus-4.8',
				url: 'https://gateway.bitplan.dev/v1',
				npm: '@ai-sdk/openai-compatible',
			},
			family: 'anthropic',
			capabilities: { toolcall: true, temperature: true },
			cost: { input: 19.5, output: 97.5, cache: { read: 1.95, write: 24.38 } },
			limit: { context: 200000, output: DEFAULT_MAX_OUTPUT_TOKENS },
			status: 'active',
		})
		expect(Object.keys(models)).toHaveLength(3)
	})
})

describe('fetchCatalog', () => {
	test('reads /v1/models and rejects a response without data', async () => {
		const calls: string[] = []
		const ok = await fetchCatalog('https://gateway.test', async (url) => {
			calls.push(url)
			return new Response(JSON.stringify(SAMPLE), {
				headers: { 'content-type': 'application/json' },
			})
		})
		expect(calls).toEqual(['https://gateway.test/v1/models'])
		expect(ok.data).toHaveLength(6)
		expect(ok.bsv_usd).toBe(42.5)

		await expect(
			fetchCatalog(
				'https://gateway.test',
				async () =>
					new Response('{}', {
						headers: { 'content-type': 'application/json' },
					}),
			),
		).rejects.toThrow('no "data" array')
		await expect(
			fetchCatalog(
				'https://gateway.test',
				async () => new Response('down', { status: 503 }),
			),
		).rejects.toThrow('(503)')
	})
})
