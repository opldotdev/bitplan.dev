import { describe, expect, test } from 'bun:test'
import type { Config, PluginInput } from '@opencode-ai/plugin'
import type { Auth } from '@opencode-ai/sdk/v2'
import BitplanPlugin from '../src/index.js'
import {
	CONNECT_LABEL,
	createBitplanPlugin,
	PASTE_LABEL,
	PROVIDER_ID,
	parseOptions,
} from '../src/plugin.js'
import { SAMPLE } from './models.test.js'
import {
	agedToken,
	createStubFetch,
	createStubWallet,
	decodeProof,
	freshToken,
	json,
	ORIGIN,
	paymentRequired,
} from './stubs.js'

function fakeInput() {
	const authWrites: Array<{ id: string; body: unknown }> = []
	const logs: Array<{ level: string; message: string }> = []
	const client = {
		auth: {
			set: async (args: { path: { id: string }; body: unknown }) => {
				authWrites.push({ id: args.path.id, body: args.body })
				return { data: true, error: undefined }
			},
		},
		app: {
			log: async (args: { body: { level: string; message: string } }) => {
				logs.push(args.body)
				return { data: true, error: undefined }
			},
		},
	}
	const input = {
		client,
		project: { id: 'p', worktree: '/tmp/p', time: { created: 0 } },
		directory: '/tmp/p',
		worktree: '/tmp/p',
		serverUrl: new URL('http://localhost:4096'),
		experimental_workspace: { register() {} },
		$: undefined,
	} as unknown as PluginInput
	return { input, authWrites, logs }
}

describe('module shape', () => {
	test('the entry module exports only the plugin function', async () => {
		const mod = await import('../src/index.js')
		expect(Object.keys(mod)).toEqual(['default'])
		expect(typeof BitplanPlugin).toBe('function')
	})
})

describe('parseOptions', () => {
	test('accepts the documented options and rejects wrong types', () => {
		expect(parseOptions(undefined)).toEqual({})
		expect(
			parseOptions({
				walletUrl: 'http://127.0.0.1:3321',
				gatewayUrl: 'https://gateway.test',
				byok: ['opencode-go'],
				maxOutputTokens: 8192,
			}),
		).toEqual({
			walletUrl: 'http://127.0.0.1:3321',
			gatewayUrl: 'https://gateway.test',
			byok: ['opencode-go'],
			maxOutputTokens: 8192,
		})
		expect(() => parseOptions({ walletUrl: '' })).toThrow('"walletUrl"')
		expect(() => parseOptions({ byok: 'opencode-go' })).toThrow('"byok"')
		expect(() => parseOptions({ maxOutputTokens: 0 })).toThrow(
			'"maxOutputTokens"',
		)
	})
})

describe('hooks', () => {
	test('config hook injects the provider with the gateway catalog and keeps user overrides', async () => {
		const net = createStubFetch([json(200, SAMPLE)])
		const plugin = createBitplanPlugin({ fetch: net.fetch })
		const { input } = fakeInput()
		const hooks = await plugin(input, { gatewayUrl: ORIGIN })
		const cfg: Config = {
			provider: {
				[PROVIDER_ID]: {
					options: { timeout: 1000 },
					models: {
						'alibaba/qwen3-coder': { name: 'My Qwen' },
					},
				},
			},
		}
		await hooks.config?.(cfg)
		const provider = cfg.provider?.[PROVIDER_ID]
		expect(provider?.npm).toBe('@ai-sdk/openai-compatible')
		expect(provider?.name).toBe('BitPlan Gateway')
		expect(provider?.options).toEqual({
			baseURL: `${ORIGIN}/v1`,
			timeout: 1000,
		})
		expect(Object.keys(provider?.models ?? {})).toEqual([
			'anthropic/claude-opus-4.8',
			'alibaba/qwen3-coder',
			'openrouter/deepseek/deepseek-v4',
		])
		expect(provider?.models?.['alibaba/qwen3-coder']).toEqual({
			name: 'My Qwen',
		})
		expect(net.requests[0]?.url).toBe(`${ORIGIN}/v1/models`)
	})

	test('config hook still registers the provider when the catalog is unreachable', async () => {
		const plugin = createBitplanPlugin({
			fetch: async () => {
				throw new Error('offline')
			},
		})
		const { input, logs } = fakeInput()
		const hooks = await plugin(input, { gatewayUrl: ORIGIN })
		const cfg: Config = {}
		await hooks.config?.(cfg)
		expect(cfg.provider?.[PROVIDER_ID]).toEqual({
			npm: '@ai-sdk/openai-compatible',
			name: 'BitPlan Gateway',
			options: { baseURL: `${ORIGIN}/v1` },
			models: {},
		})
		await Bun.sleep(0)
		expect(logs.some((l) => l.level === 'warn')).toBe(true)
	})

	test('provider.models hook serves the same catalog in the runtime shape', async () => {
		const net = createStubFetch([json(200, SAMPLE)])
		const plugin = createBitplanPlugin({ fetch: net.fetch })
		const hooks = await plugin(fakeInput().input, { gatewayUrl: ORIGIN })
		expect(hooks.provider?.id).toBe(PROVIDER_ID)
		const models = await hooks.provider?.models?.(
			{
				id: PROVIDER_ID,
				name: 'x',
				source: 'config',
				env: [],
				options: {},
				models: {},
			},
			{},
		)
		expect(Object.keys(models ?? {})).toEqual([
			'anthropic/claude-opus-4.8',
			'alibaba/qwen3-coder',
			'openrouter/deepseek/deepseek-v4',
		])
		expect(models?.['anthropic/claude-opus-4.8']?.api.url).toBe(`${ORIGIN}/v1`)
	})

	test('auth hook offers the wallet connect (oauth/auto) and a paste method, and the callback returns a signed token', async () => {
		const stub = createStubWallet()
		const plugin = createBitplanPlugin({
			connect: async () => stub.wallet,
			fetch: createStubFetch([]).fetch,
		})
		const hooks = await plugin(fakeInput().input, {
			gatewayUrl: ORIGIN,
			walletUrl: 'http://127.0.0.1:3321',
		})
		expect(hooks.auth?.provider).toBe(PROVIDER_ID)
		expect(hooks.auth?.methods.map((m) => [m.type, m.label])).toEqual([
			['oauth', CONNECT_LABEL],
			['api', PASTE_LABEL],
		])
		const connect = hooks.auth?.methods[0]
		if (connect?.type !== 'oauth') throw new Error('expected oauth method')
		const authorization = await connect.authorize()
		expect(authorization.method).toBe('auto')
		expect(authorization.instructions).toContain('http://127.0.0.1:3321')
		if (authorization.method !== 'auto') throw new Error('expected auto')
		const result = await authorization.callback()
		expect(result.type).toBe('success')
		if (result.type !== 'success' || !('key' in result))
			throw new Error('expected a key')
		expect(result.key.split('|')[0]).toBe(stub.identityKey.toLowerCase())
		expect(result.key.split('|')[3]).toBe(`${ORIGIN}/v1`)
		expect(result.metadata?.source).toBe('wallet')
		expect(result.metadata?.identity_key).toBe(stub.identityKey)
	})

	test('connect callback reports failure instead of throwing when no wallet answers', async () => {
		const plugin = createBitplanPlugin({
			connect: async () => {
				throw new Error('No BRC-100 wallet answered')
			},
		})
		const { input, logs } = fakeInput()
		const hooks = await plugin(input, {
			gatewayUrl: ORIGIN,
			walletUrl: 'http://127.0.0.1:1',
		})
		const connect = hooks.auth?.methods[0]
		if (connect?.type !== 'oauth') throw new Error('expected oauth method')
		const authorization = await connect.authorize()
		if (authorization.method !== 'auto') throw new Error('expected auto')
		expect(await authorization.callback()).toEqual({ type: 'failed' })
		await Bun.sleep(0)
		expect(logs.some((l) => l.level === 'error')).toBe(true)
	})

	test('loader returns apiKey plus a fetch that pays a 402 and refreshes the token through the wallet', async () => {
		const stub = createStubWallet()
		const net = createStubFetch([paymentRequired(), json(200, { id: 'ok' })])
		const plugin = createBitplanPlugin({
			connect: async () => stub.wallet,
			fetch: net.fetch,
		})
		const { input, authWrites } = fakeInput()
		const hooks = await plugin(input, {
			gatewayUrl: ORIGIN,
			walletUrl: 'http://127.0.0.1:3321',
		})

		// Stored token is inside the refresh window: the first request re-signs.
		let stored: Auth = {
			type: 'api',
			key: agedToken(stub.identityKey, 23.9 * 60 * 60 * 1000),
		}
		const options = await hooks.auth?.loader?.(async () => stored, {
			id: PROVIDER_ID,
			name: 'x',
			source: 'api',
			env: [],
			options: {},
			models: {},
		})
		expect(options?.apiKey).toBe(stored.key)
		expect(typeof options?.fetch).toBe('function')

		const res = await options?.fetch(`${ORIGIN}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: 'Bearer placeholder',
			},
			body: '{"model":"anthropic/claude-opus-4.8","messages":[]}',
		})
		expect(res.status).toBe(200)

		expect(authWrites).toHaveLength(1)
		expect(authWrites[0]?.id).toBe(PROVIDER_ID)
		const written = authWrites[0]?.body as { type: string; key: string }
		expect(written.type).toBe('api')
		expect(written.key).not.toBe(stored.key)
		stored = written as Auth

		expect(net.requests).toHaveLength(2)
		for (const r of net.requests) {
			expect(r.headers.get('authorization')).toBe(`Bearer ${written.key}`)
			expect(r.headers.get('x-gateway-deposit')).toBe('exact')
		}
		expect(
			decodeProof(net.requests[1]?.headers.get('x402-proof') ?? '').txid,
		).toBe(stub.txid())
		expect(stub.calls.createAction).toHaveLength(1)
	})

	test('loader returns no options until the provider is connected', async () => {
		const plugin = createBitplanPlugin({ fetch: createStubFetch([]).fetch })
		const hooks = await plugin(fakeInput().input, { gatewayUrl: ORIGIN })
		const options = await hooks.auth?.loader?.(
			async () => undefined as unknown as Auth,
			{
				id: PROVIDER_ID,
				name: 'x',
				source: 'config',
				env: [],
				options: {},
				models: {},
			},
		)
		expect(options).toEqual({})
	})

	test('a fresh pasted token is used as-is without a wallet', async () => {
		const stub = createStubWallet()
		const net = createStubFetch([json(200, {})])
		const plugin = createBitplanPlugin({
			connect: async () => {
				throw new Error('wallet must not be contacted')
			},
			fetch: net.fetch,
		})
		const hooks = await plugin(fakeInput().input, { gatewayUrl: ORIGIN })
		const token = await freshToken(stub)
		const options = await hooks.auth?.loader?.(
			async () => ({ type: 'api', key: token }),
			{
				id: PROVIDER_ID,
				name: 'x',
				source: 'api',
				env: [],
				options: {},
				models: {},
			},
		)
		const res = await options?.fetch(`${ORIGIN}/v1/chat/completions`, {
			method: 'POST',
			body: '{}',
		})
		expect(res.status).toBe(200)
		expect(net.requests[0]?.headers.get('authorization')).toBe(
			`Bearer ${token}`,
		)
	})
})
