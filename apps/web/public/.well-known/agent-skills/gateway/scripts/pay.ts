#!/usr/bin/env bun
/**
 * Build the payment for a gateway.bitplan.dev 402 and print the header value.
 * Nothing is broadcast; the gateway broadcasts when it receives the proof.
 * Never prints the key.
 *
 *   printf '%s' "$CHALLENGE_JSON" | bun pay.ts --wif <WIF> --x402
 *   bun pay.ts --wif <WIF> --x402 --challenge '<json>'
 *
 * `--x402` prints the x402 v2 `PAYMENT-SIGNATURE` value (base64 JSON).
 * Without it, the script prints the legacy `X402-Proof` value.
 *
 * `--x402` needs the whole 402 body (`accepts[0]`, including
 * `maxTimeoutSeconds`). Challenge-only input is for the legacy proof.
 * Funds come from the P2PKH address of the WIF; UTXOs are read from
 * WhatsOnChain. Run `bun install` in this directory once.
 */
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction } from '@bsv/sdk'

const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
const FEE_SATS_PER_KB = 50

function flag(name: string): string | undefined {
	const argv = process.argv.slice(2)
	const i = argv.indexOf(`--${name}`)
	if (i === -1) return undefined
	const value = argv[i + 1]
	if (value === undefined || value.startsWith('--'))
		throw new Error(`--${name} requires a value`)
	return value
}

function hasFlag(name: string): boolean {
	return process.argv.slice(2).includes(`--${name}`)
}

interface Challenge {
	version: string
	challenge_id: string
	amount_sats: number
	payee_locking_script_hex: string
	payee_address?: string
	expires_at: string
}

interface Accepted {
	scheme: string
	network: string
	amount: string
	asset: string
	payTo: string
	maxTimeoutSeconds: number
	extra: {
		challengeId: string
		lockingScript: string
		expiresAt?: string
		payUrl?: string
	}
}

interface Body {
	challenge?: Challenge
	x402Version?: number
	resource?: { url?: string; description?: string; mimeType?: string }
	accepts?: Accepted[]
}

async function readBody(): Promise<{ raw: Body; challenge: Challenge }> {
	const text =
		flag('challenge') ?? (await new Response(Bun.stdin.stream()).text())
	const parsed = JSON.parse(text) as Body & Challenge
	const c = parsed.challenge ?? parsed
	if (c.version !== 'bsv-tx-v1')
		throw new Error('unsupported challenge version')
	if (!Number.isSafeInteger(c.amount_sats) || c.amount_sats <= 0)
		throw new Error('bad amount_sats')
	if (!/^[0-9a-f]+$/i.test(c.payee_locking_script_hex))
		throw new Error('bad payee_locking_script_hex')
	if (Date.parse(c.expires_at) < Date.now())
		throw new Error('challenge expired; request a new one')
	if (
		c.payee_address &&
		new P2PKH().lock(c.payee_address).toHex() !==
			c.payee_locking_script_hex.toLowerCase()
	) {
		throw new Error('payee_address does not match payee_locking_script_hex')
	}
	return { raw: parsed, challenge: c }
}

function acceptedOf(raw: Body): Accepted {
	const a = Array.isArray(raw.accepts) ? raw.accepts[0] : undefined
	if (
		a?.scheme === 'exact' &&
		typeof a.extra?.lockingScript === 'string' &&
		typeof a.amount === 'string' &&
		typeof a.maxTimeoutSeconds === 'number'
	) {
		return a
	}
	throw new Error(
		'--x402 needs the full 402 body (accepts[0] with maxTimeoutSeconds); challenge-only is for the legacy proof',
	)
}

const wif = flag('wif')
if (!wif) throw new Error('--wif is required')
const key = PrivateKey.fromWif(wif)
const address = key.toAddress()
const { raw, challenge } = await readBody()

const utxoRes = await fetch(`${WOC}/address/${address}/unspent`)
if (!utxoRes.ok) throw new Error(`whatsonchain unspent ${utxoRes.status}`)
const utxos = (await utxoRes.json()) as Array<{
	tx_hash: string
	tx_pos: number
	value: number
}>
utxos.sort((a, b) => b.value - a.value)

const tx = new Transaction()
tx.addOutput({
	lockingScript: (await import('@bsv/sdk')).LockingScript.fromHex(
		challenge.payee_locking_script_hex,
	),
	satoshis: challenge.amount_sats,
})
tx.addOutput({ lockingScript: new P2PKH().lock(address), change: true })

let total = 0
const template = new P2PKH()
for (const u of utxos) {
	const hexRes = await fetch(`${WOC}/tx/${u.tx_hash}/hex`)
	if (!hexRes.ok)
		throw new Error(`whatsonchain tx ${u.tx_hash} ${hexRes.status}`)
	tx.addInput({
		sourceTransaction: Transaction.fromHex(await hexRes.text()),
		sourceOutputIndex: u.tx_pos,
		unlockingScriptTemplate: template.unlock(key),
	})
	total += u.value
	if (total > challenge.amount_sats + 1000) break
}
if (total < challenge.amount_sats) {
	throw new Error(
		`insufficient funds at ${address}: have ${total} sats, need ${challenge.amount_sats} plus fee`,
	)
}
await tx.fee(new SatoshisPerKilobyte(FEE_SATS_PER_KB))
await tx.sign()

const rawtx = Buffer.from(tx.toBinary()).toString('base64')
if (hasFlag('x402')) {
	const payload = {
		x402Version: 2,
		...(raw.resource ? { resource: raw.resource } : {}),
		accepted: acceptedOf(raw),
		payload: { transaction: rawtx },
	}
	process.stdout.write(
		`${Buffer.from(JSON.stringify(payload)).toString('base64')}\n`,
	)
} else {
	const proof = {
		version: 'bsv-tx-v1',
		challenge_id: challenge.challenge_id,
		rawtx_base64: rawtx,
		txid: tx.id('hex'),
	}
	process.stdout.write(
		`${Buffer.from(JSON.stringify(proof)).toString('base64url')}\n`,
	)
}
