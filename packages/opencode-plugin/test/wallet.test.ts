import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	createWallet,
	DEFAULT_WALLET_URL,
	resolveWalletUrl,
	WALLET_URL_ENV,
} from '../src/wallet.js'

function tempHome(config?: unknown): string {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-opencode-'))
	if (config !== undefined) {
		fs.mkdirSync(path.join(home, '.bitplan'))
		fs.writeFileSync(
			path.join(home, '.bitplan', 'config.json'),
			typeof config === 'string' ? config : JSON.stringify(config),
		)
	}
	return home
}

describe('resolveWalletUrl', () => {
	test('plugin option wins, then the env var, then ~/.bitplan/config.json, then BSV Desktop', () => {
		const home = tempHome({ walletUrl: 'http://127.0.0.1:4444' })
		expect(
			resolveWalletUrl({
				option: 'http://127.0.0.1:1111',
				env: { [WALLET_URL_ENV]: 'http://127.0.0.1:2222' },
				home,
			}),
		).toBe('http://127.0.0.1:1111')
		expect(
			resolveWalletUrl({
				env: { [WALLET_URL_ENV]: 'http://127.0.0.1:2222' },
				home,
			}),
		).toBe('http://127.0.0.1:2222')
		expect(resolveWalletUrl({ env: {}, home })).toBe('http://127.0.0.1:4444')
		expect(resolveWalletUrl({ env: {}, home: tempHome() })).toBe(
			DEFAULT_WALLET_URL,
		)
	})

	test('a present but wrong source fails instead of falling through', () => {
		expect(() =>
			resolveWalletUrl({ env: { [WALLET_URL_ENV]: '' }, home: tempHome() }),
		).toThrow(`${WALLET_URL_ENV} is set but empty`)
		expect(() =>
			resolveWalletUrl({ option: 42, env: {}, home: tempHome() }),
		).toThrow('"walletUrl"')
		expect(() =>
			resolveWalletUrl({ env: {}, home: tempHome('{nope') }),
		).toThrow('not valid JSON')
		expect(() =>
			resolveWalletUrl({ env: {}, home: tempHome({ walletUrl: '' }) }),
		).toThrow('non-empty string')
	})

	test('the env var is used verbatim, never trimmed', () => {
		expect(
			resolveWalletUrl({
				env: { [WALLET_URL_ENV]: ' http://127.0.0.1:3321' },
				home: tempHome(),
			}),
		).toBe(' http://127.0.0.1:3321')
	})
})

describe('createWallet', () => {
	test('accepts https and loopback http only', () => {
		expect(() => createWallet('http://127.0.0.1:3321')).not.toThrow()
		expect(() => createWallet('https://wallet.example')).not.toThrow()
		expect(() => createWallet('http://wallet.example')).toThrow(
			'Refusing cleartext',
		)
	})
})
