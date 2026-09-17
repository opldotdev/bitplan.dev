/**
 * gateway.bitplan.dev from the connected wallet: mint a session token, check
 * credits, deposit, and list models. The wallet signs and pays; nothing is
 * exported and no key is typed anywhere.
 */

import { Transaction, Utils, type WalletInterface } from '@bsv/sdk'
import { CliError } from '../errors.js'
import { assertSecureHttpUrl, withTimeoutSignal } from '../http.js'
import { connectWallet, errorMessage, identityKey } from '../wallet.js'

export const DEFAULT_GATEWAY_URL = 'https://gateway.bitplan.dev'
const HTTP_TIMEOUT_MS = 60_000
const TOKEN_PROTOCOL: [1, string] = [1, 'bitcoin auth']

export interface GatewayOptions {
	json?: boolean
	walletUrl?: string
	gatewayUrl?: string
}

/** The CAIP-2 id the gateway uses for BSV (bip122, genesis block hash). */
const BSV_NETWORK = 'bip122:000000000019d6689c085ae165831e93'

/** One entry of an x402 (protocol version 2) PaymentRequired `accepts` list. */
interface PaymentRequirements {
	scheme: string
	network: string
	/** satoshis */
	amount: string
	asset: string
	payTo: string
	maxTimeoutSeconds: number
	extra: { challengeId: string; lockingScript: string; expiresAt?: string }
}

interface PaymentRequired {
	x402Version: number
	resource?: { url?: string; description?: string; mimeType?: string }
	accepts: PaymentRequirements[]
}

interface Account {
	identity_key: string
	balance_sats: number
	pending_confirmation_sats: number
	min_deposit_sats: number
}

interface Rate {
	bsv_usd: number
	min_deposit_sats: number
	min_deposit_usd: number
}

function gatewayOrigin(override?: string): string {
	const raw = override ?? DEFAULT_GATEWAY_URL
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		throw new CliError(`Invalid gateway URL: ${JSON.stringify(raw)}`)
	}
	assertSecureHttpUrl(url, 'gateway')
	return url.origin
}

/**
 * A bitcoin-auth session token in the brc100 scheme:
 * `pubkey|brc100|timestamp|<origin>/v1|signature`. The wallet signs
 * `<origin>/v1|<timestamp>|` with protocol [1, "bitcoin auth"], key id =
 * timestamp, counterparty "anyone"; the gateway verifies with the same
 * derivation. Valid for 24 hours on every /v1 route.
 */
export async function mintGatewayToken(
	wallet: WalletInterface,
	key: string,
	origin: string,
): Promise<string> {
	const requestPath = `${origin}/v1`
	const timestamp = new Date().toISOString()
	const message = Utils.toArray(`${requestPath}|${timestamp}|`, 'utf8')
	const { signature } = await wallet.createSignature({
		data: message,
		protocolID: TOKEN_PROTOCOL,
		keyID: timestamp,
		counterparty: 'anyone',
	})
	return `${key.toLowerCase()}|brc100|${timestamp}|${requestPath}|${Utils.toBase64(signature)}`
}

function formatBsv(sats: number): string {
	const bsv = sats / 1e8
	const digits = bsv >= 1 ? 2 : bsv >= 0.01 ? 4 : 6
	return `${bsv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })} BSV`
}

async function gatewayFetch(
	origin: string,
	path: string,
	init: RequestInit & { token?: string; proof?: string } = {},
): Promise<Response> {
	const headers = new Headers(init.headers)
	if (init.token) headers.set('authorization', `Bearer ${init.token}`)
	if (init.proof) headers.set('payment-signature', init.proof)
	return fetch(`${origin}${path}`, {
		...init,
		headers,
		signal: withTimeoutSignal(HTTP_TIMEOUT_MS),
	})
}

async function failure(res: Response, what: string): Promise<CliError> {
	const body = (await res.json().catch(() => ({}))) as {
		error?: { message?: string; code?: string }
	}
	return new CliError(
		`${what} failed (${res.status}): ${body.error?.message ?? 'unexpected response'}${body.error?.code ? ` [${body.error.code}]` : ''}`,
	)
}

/**
 * The x402 requirements of a 402: the PAYMENT-REQUIRED header (base64 JSON),
 * or the same object in the body. Returns the exact-on-BSV entry.
 */
async function readPaymentRequired(
	res: Response,
): Promise<{ required: PaymentRequired; accepted: PaymentRequirements }> {
	const header = res.headers.get('payment-required')
	let required: PaymentRequired | undefined
	if (header) {
		required = JSON.parse(Utils.toUTF8(Utils.toArray(header, 'base64'))) as PaymentRequired
	} else {
		const body = (await res.json().catch(() => ({}))) as Partial<PaymentRequired>
		if (body.x402Version === 2 && Array.isArray(body.accepts)) required = body as PaymentRequired
	}
	if (!required) throw new CliError('The gateway answered 402 without x402 requirements.')
	const accepted = required.accepts.find(
		(a) => a.scheme === 'exact' && a.network === BSV_NETWORK && typeof a.extra?.lockingScript === 'string',
	)
	if (!accepted) throw new CliError('The gateway offered no exact-on-BSV payment option.')
	return { required, accepted }
}

/** Pay the accepted requirements from the wallet and return the PAYMENT-SIGNATURE header value. */
export async function payChallenge(
	wallet: WalletInterface,
	required: PaymentRequired,
	accepted: PaymentRequirements,
): Promise<string> {
	const sats = Number(accepted.amount)
	const action = await wallet.createAction({
		description: `gateway.bitplan.dev credits: ${formatBsv(sats)}`,
		outputs: [
			{
				lockingScript: accepted.extra.lockingScript,
				satoshis: sats,
				outputDescription: 'gateway.bitplan.dev credits',
			},
		],
		options: { randomizeOutputs: false },
	})
	if (!action.tx) throw new CliError('The wallet did not return the transaction.')
	const tx = Transaction.fromAtomicBEEF(action.tx)
	const payload = JSON.stringify({
		x402Version: 2,
		...(required.resource ? { resource: required.resource } : {}),
		accepted,
		payload: { transaction: Utils.toBase64(tx.toBinary()) },
	})
	return Utils.toBase64(Utils.toArray(payload, 'utf8'))
}

async function session(
	options: GatewayOptions,
): Promise<{ wallet: WalletInterface; token: string; key: string; origin: string }> {
	const origin = gatewayOrigin(options.gatewayUrl)
	const { wallet } = await connectWallet(options.walletUrl)
	const key = await identityKey(wallet)
	let token: string
	try {
		token = await mintGatewayToken(wallet, key, origin)
	} catch (error) {
		throw new CliError(`The wallet declined to sign the token: ${errorMessage(error)}`)
	}
	return { wallet, token, key, origin }
}

/** bitplan gateway token — print a 24 h API key signed by the wallet. */
export async function gatewayTokenCommand(options: GatewayOptions): Promise<void> {
	const { token, key, origin } = await session(options)
	if (options.json) {
		console.log(JSON.stringify({ token, identityKey: key, gateway: origin, validMinutes: 1440 }))
		return
	}
	console.log(token)
}

/** bitplan gateway credits — balance for this wallet's account. */
export async function gatewayCreditsCommand(options: GatewayOptions): Promise<void> {
	const { token, origin } = await session(options)
	const res = await gatewayFetch(origin, '/v1/account', { token })
	if (!res.ok) throw await failure(res, 'Reading credits')
	const account = (await res.json()) as Account
	const rateRes = await gatewayFetch(origin, '/v1/rate')
	const rate = rateRes.ok ? ((await rateRes.json()) as Rate) : null
	if (options.json) {
		console.log(JSON.stringify({ ...account, bsv_usd: rate?.bsv_usd ?? null }, null, 2))
		return
	}
	const usd = rate ? ` (≈ $${((account.balance_sats / 1e8) * rate.bsv_usd).toFixed(2)})` : ''
	console.log(`Credits:  ${formatBsv(account.balance_sats)}${usd}`)
	if (account.pending_confirmation_sats > 0) {
		console.log(`Pending:  ${formatBsv(account.pending_confirmation_sats)} (waiting for a confirmation)`)
	}
	console.log(`Account:  ${account.identity_key}`)
}

export interface DepositOptions extends GatewayOptions {
	yes?: boolean
}

/** bitplan gateway deposit [sats] — top up credits from the wallet. */
export async function gatewayDepositCommand(
	satsArg: string | undefined,
	options: DepositOptions,
): Promise<void> {
	const { wallet, token, origin } = await session(options)
	let sats: number | undefined
	if (satsArg !== undefined) {
		sats = Number(satsArg)
		if (!Number.isSafeInteger(sats) || sats <= 0) {
			throw new CliError(`Amount must be a whole number of satoshis, got ${JSON.stringify(satsArg)}.`)
		}
	}
	const body = JSON.stringify({ sats })
	const first = await gatewayFetch(origin, '/v1/deposit', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		token,
	})
	if (first.status !== 402) throw await failure(first, 'Requesting a deposit')
	const { required, accepted } = await readPaymentRequired(first)
	const amount = Number(accepted.amount)
	if (!options.yes) {
		console.error(
			`Deposit ${formatBsv(amount)} (${amount.toLocaleString('en-US')} sats) to ${accepted.payTo}? Re-run with --yes to approve. The wallet will still ask.`,
		)
		return
	}
	let proof: string
	try {
		proof = await payChallenge(wallet, required, accepted)
	} catch (error) {
		const paymail = (required as { fund?: { paymail?: string } }).fund?.paymail
		throw new CliError(
			`The wallet could not pay ${formatBsv(amount)} (${amount.toLocaleString('en-US')} sats): ${errorMessage(error).split(/[.\n]/)[0]}. Nothing was charged. Add BSV to the wallet and run this again${paymail ? `, or send at least ${amount.toLocaleString('en-US')} sats to the account's paymail ${paymail} from any BSV wallet` : ''}, or buy credits by card at ${origin} signed in with the same key.`,
		)
	}
	const second = await gatewayFetch(origin, '/v1/deposit', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		token,
		proof,
	})
	if (!second.ok) throw await failure(second, 'Confirming the deposit')
	const result = (await second.json()) as {
		txid: string
		satoshis: number
		credited: boolean
		balance_sats: number
	}
	if (options.json) {
		console.log(JSON.stringify(result, null, 2))
		return
	}
	console.log(`Paid:     ${formatBsv(result.satoshis)} (${result.txid})`)
	console.log(
		result.credited
			? `Credits:  ${formatBsv(result.balance_sats)}`
			: 'Credits:  arrive after one confirmation',
	)
}

export interface ModelsOptions extends GatewayOptions {
	query?: string
	starred?: boolean
	limit?: string
}

interface CatalogModel {
	id: string
	name: string
	owned_by: string
	type: string
	recommended: boolean
	pricing: {
		sats_per_million_input: number | null
		sats_per_million_output: number | null
		sats_per_image: number | null
	}
}

/** bitplan gateway models — the catalog with prices in BSV. */
export async function gatewayModelsCommand(options: ModelsOptions): Promise<void> {
	const origin = gatewayOrigin(options.gatewayUrl)
	const res = await gatewayFetch(origin, '/v1/models')
	if (!res.ok) throw await failure(res, 'Listing models')
	const body = (await res.json()) as { data: CatalogModel[]; bsv_usd: number }
	const q = options.query?.toLowerCase()
	const limit = options.limit ? Number(options.limit) : 40
	const rows = body.data
		.filter((m) => !options.starred || m.recommended)
		.filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
		.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.id.localeCompare(b.id))
		.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 40)
	if (options.json) {
		console.log(JSON.stringify({ bsv_usd: body.bsv_usd, models: rows }, null, 2))
		return
	}
	console.log(`1 BSV = $${body.bsv_usd.toFixed(2)} · prices per 1M tokens, markup included`)
	for (const m of rows) {
		const star = m.recommended ? '★' : ' '
		const price =
			m.pricing.sats_per_image !== null
				? `${formatBsv(m.pricing.sats_per_image)} per image`
				: `in ${formatBsv(m.pricing.sats_per_million_input ?? 0)} · out ${formatBsv(m.pricing.sats_per_million_output ?? 0)}`
		console.log(`${star} ${m.id.padEnd(44)} ${price}`)
	}
}
