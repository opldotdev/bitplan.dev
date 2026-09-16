import { describe, expect, test } from 'bun:test'
import { PrivateKey, ProtoWallet, Utils, type WalletInterface } from '@bsv/sdk'
import type { Command } from 'commander'
import { mintGatewayToken } from '../src/commands/gateway.js'
import { buildProgram } from '../src/index.js'

describe('gateway token', () => {
	test('is a bitcoin-auth brc100 token the gateway can verify with the anyone key', async () => {
		const key = PrivateKey.fromRandom()
		const wallet = new ProtoWallet(key) as unknown as WalletInterface
		const identity = key.toPublicKey().toString()
		const token = await mintGatewayToken(wallet, identity, 'https://gateway.bitplan.dev')

		const parts = token.split('|')
		expect(parts).toHaveLength(5)
		expect(parts[0]).toBe(identity.toLowerCase())
		expect(parts[1]).toBe('brc100')
		expect(parts[3]).toBe('https://gateway.bitplan.dev/v1')

		const timestamp = parts[2] as string
		const message = Utils.toArray(`https://gateway.bitplan.dev/v1|${timestamp}|`, 'utf8')
		const verifier = new ProtoWallet('anyone')
		const { valid } = await verifier.verifySignature({
			data: message,
			signature: Utils.toArray(parts[4] as string, 'base64'),
			protocolID: [1, 'bitcoin auth'],
			keyID: timestamp,
			counterparty: identity,
		})
		expect(valid).toBe(true)
	})

	test('gateway subcommands are registered', () => {
		const program = buildProgram()
		const gateway = program.commands.find((c: Command) => c.name() === 'gateway')
		expect(gateway).toBeDefined()
		const names = gateway?.commands.map((c: Command) => c.name()).sort()
		expect(names).toEqual(['credits', 'deposit', 'models', 'token'])
	})
})
