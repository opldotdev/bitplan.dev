#!/usr/bin/env bun
/**
 * Build the payment for a gateway.bitplan.dev `bsv-tx-v1` challenge and print
 * the X402-Proof header value. Nothing is broadcast; the gateway broadcasts
 * when it receives the proof. Never prints the key.
 *
 *   printf '%s' "$CHALLENGE_JSON" | bun pay.ts --wif <WIF>
 *   bun pay.ts --wif <WIF> --challenge '<json>'
 *
 * The JSON may be the whole 402 body or just the `challenge` object. Funds
 * come from the P2PKH address of the WIF; UTXOs are read from WhatsOnChain.
 * Run `bun install` in this directory once.
 */
import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction } from "@bsv/sdk"

const WOC = "https://api.whatsonchain.com/v1/bsv/main"
const FEE_SATS_PER_KB = 50

function flag(name: string): string | undefined {
	const argv = process.argv.slice(2)
	const i = argv.indexOf(`--${name}`)
	if (i === -1) return undefined
	const value = argv[i + 1]
	if (value === undefined || value.startsWith("--"))
		throw new Error(`--${name} requires a value`)
	return value
}

interface Challenge {
	version: string
	challenge_id: string
	amount_sats: number
	payee_locking_script_hex: string
	payee_address?: string
	expires_at: string
}

async function readChallenge(): Promise<Challenge> {
	const raw =
		flag("challenge") ?? (await new Response(Bun.stdin.stream()).text())
	const parsed = JSON.parse(raw) as { challenge?: Challenge } & Challenge
	const c = parsed.challenge ?? parsed
	if (c.version !== "bsv-tx-v1")
		throw new Error("unsupported challenge version")
	if (!Number.isSafeInteger(c.amount_sats) || c.amount_sats <= 0)
		throw new Error("bad amount_sats")
	if (!/^[0-9a-f]+$/i.test(c.payee_locking_script_hex))
		throw new Error("bad payee_locking_script_hex")
	if (Date.parse(c.expires_at) < Date.now())
		throw new Error("challenge expired; request a new one")
	if (
		c.payee_address &&
		new P2PKH().lock(c.payee_address).toHex() !==
			c.payee_locking_script_hex.toLowerCase()
	) {
		throw new Error("payee_address does not match payee_locking_script_hex")
	}
	return c
}

const wif = flag("wif")
if (!wif) throw new Error("--wif is required")
const key = PrivateKey.fromWif(wif)
const address = key.toAddress()
const challenge = await readChallenge()

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
	lockingScript: (await import("@bsv/sdk")).LockingScript.fromHex(
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

const proof = {
	version: "bsv-tx-v1",
	challenge_id: challenge.challenge_id,
	rawtx_base64: Buffer.from(tx.toBinary()).toString("base64"),
	txid: tx.id("hex"),
}
process.stdout.write(
	`${Buffer.from(JSON.stringify(proof)).toString("base64url")}\n`,
)
