/**
 * Ordinal plumbing: publish a genesis inscription, publish a new version by
 * reinscription, and find bitplan coins in the wallet.
 *
 * Versioning is reinscription. The first publish inscribes a fresh 1-sat coin;
 * every later publish spends that coin back to the author with a new envelope
 * on the output (`TransferItem.inscription`). The coin — and therefore the
 * origin chain — carries forward, so `origin` is the stable identity of a
 * draft and each spend is one version.
 *
 * BRC-147 tag semantics (decided upstream, and convenient here): a reinscribed
 * output keeps the *genesis* `origin:` / `type:` tags as the collectable's
 * identity. It is not retagged with the new content type. Since bitplan's
 * content type never varies, `type:application/x-bitplan` is a reliable filter
 * for every version of every bitplan draft in the wallet.
 */

import { Buffer } from 'node:buffer'
import {
	buildTransferOrdinals,
	createContext,
	inscribe,
	type OneSatContext,
	ORDINALS_BASKET,
	sendOrdinals,
	type WalletInterface,
	type WalletOutput,
} from '@1sat/actions'
import { CONTENT_TYPE, MAP_METADATA, TYPE_TAG } from './constants.js'
import { CliError } from './errors.js'
import { splitOutpoint, toOrdinalOutpoint } from './outpoint.js'

export interface BitplanCoin {
	/** Wallet tracking id (`id:` tag value) — what a transfer spends by. */
	id: string
	/** `txid_vout` of the coin as it stands now. */
	outpoint: string
	/** `txid_vout` of the genesis inscription. */
	origin: string
	output: WalletOutput
}

export interface PublishResult {
	txid: string
	/** `txid_vout` of the coin holding the version just published. */
	outpoint: string
	/** `txid_vout` of the genesis inscription. */
	origin: string
}

export function walletContext(wallet: WalletInterface): OneSatContext {
	// No `services`: nothing bitplan does through the actions layer needs a
	// backend. Inscribe and transfer are wallet-only paths.
	return createContext(wallet, { chain: 'main' })
}

/** Every bitplan coin the wallet holds, newest tip of each origin chain. */
export async function listBitplanCoins(
	wallet: WalletInterface,
	options: { limit?: number; offset?: number } = {},
): Promise<BitplanCoin[]> {
	const result = await wallet.listOutputs({
		basket: ORDINALS_BASKET,
		tags: [TYPE_TAG],
		tagQueryMode: 'all',
		includeTags: true,
		includeCustomInstructions: true,
		limit: options.limit ?? 100,
		offset: options.offset ?? 0,
	})

	const coins: BitplanCoin[] = []
	for (const output of result.outputs) {
		const coin = toCoin(output)
		if (coin) coins.push(coin)
	}
	return coins
}

/** Turn a wallet output into a bitplan coin, or null if it is not one. */
export function toCoin(output: WalletOutput): BitplanCoin | null {
	const tags = output.tags ?? []
	if (!tags.includes(TYPE_TAG)) return null

	const id = tags.find((tag) => tag.startsWith('id:'))?.slice(3)
	if (!id) return null

	let outpoint: string
	try {
		outpoint = toOrdinalOutpoint(output.outpoint)
	} catch {
		return null
	}

	// The genesis output carries a bare `origin` tag; every later version
	// carries `origin:<genesis outpoint>` (see ordinalSeedTags upstream).
	const originTag = tags.find((tag) => tag.startsWith('origin:'))?.slice(7)
	const origin = originTag ? toOrdinalOutpoint(originTag) : outpoint

	return { id, outpoint, origin, output }
}

/** The coin currently holding a draft's latest version. */
export async function findCoinByOrigin(
	wallet: WalletInterface,
	origin: string,
): Promise<BitplanCoin> {
	const wanted = toOrdinalOutpoint(origin)
	const coins = await listBitplanCoins(wallet, { limit: 1000 })
	const match = coins.find((coin) => coin.origin === wanted)
	if (!match) {
		throw new CliError(
			[
				`This wallet does not hold a bitplan draft with origin ${wanted}.`,
				'',
				'A new version can only be published by the wallet that holds the coin.',
				'Run `bitplan list` to see the drafts this wallet can update.',
			].join('\n'),
		)
	}
	return match
}

/** First publish: inscribe the envelope onto a fresh 1-sat output. */
export async function publishGenesis(
	wallet: WalletInterface,
	envelope: Uint8Array,
): Promise<PublishResult> {
	const ctx = walletContext(wallet)
	const result = await inscribe.execute(ctx, {
		base64Content: Buffer.from(envelope).toString('base64'),
		contentType: CONTENT_TYPE,
		map: { ...MAP_METADATA },
	})

	if (result.error) {
		throw new CliError(
			`The wallet could not inscribe this draft: ${result.error}`,
		)
	}
	if (!result.txid) {
		throw new CliError(
			'The wallet returned no txid for the inscription; nothing was published.',
		)
	}

	const outpoint = await locateCoinOutpoint(wallet, result.txid)
	return { txid: result.txid, outpoint, origin: outpoint }
}

function versionTransfer(coin: BitplanCoin, envelope: Uint8Array) {
	return {
		id: coin.id,
		counterparty: 'self' as const,
		map: { ...MAP_METADATA },
		inscription: {
			base64Content: Buffer.from(envelope).toString('base64'),
			contentType: CONTENT_TYPE,
		},
	}
}

/**
 * Build the reinscription transfer: same envelope, content type, and MAP the
 * later publish spends onto the coin.
 */
export async function buildVersionTransfer(
	wallet: WalletInterface,
	coin: BitplanCoin,
	envelope: Uint8Array,
) {
	return buildTransferOrdinals(walletContext(wallet), {
		transfers: [versionTransfer(coin, envelope)],
	})
}

/** Later publishes: spend the draft's coin back to self with a new envelope. */
export async function publishVersion(
	wallet: WalletInterface,
	coin: BitplanCoin,
	envelope: Uint8Array,
): Promise<PublishResult> {
	const result = await sendOrdinals.execute(walletContext(wallet), {
		transfers: [versionTransfer(coin, envelope)],
	})

	if (result.error) {
		throw new CliError(
			`The wallet could not publish this version: ${result.error}`,
		)
	}
	if (!result.txid) {
		throw new CliError(
			'The wallet returned no txid for the update; nothing was published.',
		)
	}

	const outpoint = await locateCoinOutpoint(wallet, result.txid)
	return { txid: result.txid, outpoint, origin: coin.origin }
}

/**
 * Where the 1-sat output landed.
 *
 * Both paths build with `randomizeOutputs: false` and put the ordinal first,
 * so vout 0 is correct — but ask the wallet rather than assume, and only fall
 * back to vout 0 if the basket has not caught up yet.
 */
async function locateCoinOutpoint(
	wallet: WalletInterface,
	txid: string,
): Promise<string> {
	try {
		const coins = await listBitplanCoins(wallet, { limit: 1000 })
		const match = coins.find(
			(coin) => splitOutpoint(coin.outpoint).txid === txid.toLowerCase(),
		)
		if (match) return match.outpoint
	} catch {
		// Fall through to the deterministic position.
	}
	return `${txid}_0`
}
