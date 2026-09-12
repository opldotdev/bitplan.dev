import { describe, expect, test } from 'bun:test'
import { createWallet } from '../src/wallet.js'

describe('wallet URL security', () => {
	test('accepts remote TLS and explicit loopback HTTP', () => {
		for (const url of [
			'https://wallet.example',
			'http://localhost:3321',
			'http://127.0.0.1:3321',
			'http://127.1:3321',
			'http://[::1]:3321',
		]) {
			expect(() => createWallet(url)).not.toThrow()
		}
	})

	test('rejects malformed, non-HTTP, and remote cleartext URLs', () => {
		for (const url of [
			'not-a-url',
			'file:///tmp/wallet',
			'http://wallet.example:3321',
			'http://localhost.example:3321',
			'http://127.0.0.2:3321',
		]) {
			expect(() => createWallet(url)).toThrow()
		}
	})
})
