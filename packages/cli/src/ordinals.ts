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
import { randomUUID } from 'node:crypto'
import {
	buildOrdinalCustomInstructions,
	buildTransferOrdinals,
	type CreateActionArgs,
	createContext,
	executeTrackedAction,
	MAX_INSCRIPTION_BYTES,
	type OneSatContext,
	ORDINALS_BASKET,
	P1SAT_PROTOCOL,
	type WalletInterface,
	type WalletOutput,
} from '@1sat/actions'
import { buildInscriptionScript } from '@1sat/templates'
import { Beef, Hash, P2PKH, PublicKey, Utils } from '@bsv/sdk'
import { CONTENT_TYPE, MAP_METADATA, TYPE_TAG } from './constants.js'
import { CliError } from './errors.js'
import { toOrdinalOutpoint } from './outpoint.js'

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
	/** Wallet-returned BRC-95 Atomic BEEF, when the wallet provides it. */
	beef?: Uint8Array
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
	return (await publishBatch(wallet, [{ envelope }]))[0]!
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

/**
 * Later publishes: spend the draft's coin back to self with a new envelope.
 *
 * Reinscribe is `buildTransferOrdinals` with `TransferItem.inscription`, then
 * the local createAction pipeline. The 1sat permission module is not used:
 * `p 1sat` labels stay off the args, `usePermissionModule` is false.
 */
export async function publishVersion(
	wallet: WalletInterface,
	coin: BitplanCoin,
	envelope: Uint8Array,
): Promise<PublishResult> {
	return (await publishBatch(wallet, [{ coin, envelope }]))[0]!
}

export interface PublishItem {
	/** Already sealed with the existing envelope format; never re-encrypted here. */
	envelope: Uint8Array
	/** Omit to create a new ordinal. Supply to preserve an existing origin. */
	coin?: BitplanCoin
}

/**
 * One action, one ordinal output per item. Existing coins must precede genesis
 * items so each one-sat input maps to its corresponding one-sat output.
 * Item order is output order; callers can bind same-transaction references
 * before sealing. Payment/change outputs belong to the wallet, not this list.
 */
export async function publishBatch(
	wallet: WalletInterface,
	items: readonly PublishItem[],
): Promise<PublishResult[]> {
	if (!items.length) throw new CliError('A publish needs at least one item.')
	const ids = new Set<string>()
	const outpoints = new Set<string>()
	let sawGenesis = false
	for (const { coin, envelope } of items) {
		if (!envelope.byteLength || envelope.byteLength > MAX_INSCRIPTION_BYTES) {
			throw new CliError(
				'Envelope is empty or exceeds the inscription size limit.',
			)
		}
		if (!coin) {
			sawGenesis = true
			continue
		}
		if (sawGenesis)
			throw new CliError('Existing ordinal versions must precede new ordinals.')
		const outpoint = toOrdinalOutpoint(coin.outpoint)
		if (ids.has(coin.id) || outpoints.has(outpoint)) {
			throw new CliError('An ordinal cannot be spent twice in one publish.')
		}
		ids.add(coin.id)
		outpoints.add(outpoint)
	}
	const args: CreateActionArgs = {
		description: `Publish ${items.length} BitPlan output(s)`,
		inputs: [],
		outputs: [],
		options: { randomizeOutputs: false, acceptDelayedBroadcast: false },
	}
	const proofs: number[][] = []
	for (const { coin, envelope } of items) {
		if (coin) {
			const params = await buildVersionTransfer(wallet, coin, envelope)
			if ('error' in params)
				throw new CliError(`Could not build version: ${params.error}`)
			if (
				params.inputs?.length !== 1 ||
				params.outputs?.length !== 1 ||
				toOrdinalOutpoint(params.inputs[0]!.outpoint) !==
					toOrdinalOutpoint(coin.outpoint) ||
				params.outputs[0]!.satoshis !== 1 ||
				params.sources[0]?.satoshis !== 1
			) {
				throw new CliError(
					'Ordinal source changed or the transfer layout is invalid; reload before publishing.',
				)
			}
			if (!params.inputBEEF?.length)
				throw new CliError('Missing ordinal input proof.')
			args.inputs!.push(...params.inputs)
			args.outputs!.push(...params.outputs)
			proofs.push(Array.from(params.inputBEEF))
		} else {
			const keyID = `inscribe-${randomUUID()}`
			const { publicKey } = await wallet.getPublicKey({
				protocolID: P1SAT_PROTOCOL,
				keyID,
				counterparty: 'self',
				forSelf: true,
			})
			const tags = [
				TYPE_TAG,
				'origin',
				`sha256:${Utils.toHex(Hash.sha256(Array.from(envelope)))}`,
			]
			args.outputs!.push({
				lockingScript: buildInscriptionScript(
					new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()),
					envelope,
					CONTENT_TYPE,
					{ ...MAP_METADATA },
				).toHex(),
				satoshis: 1,
				outputDescription: 'BitPlan inscription',
				basket: ORDINALS_BASKET,
				tags,
				customInstructions: buildOrdinalCustomInstructions({
					protocolID: P1SAT_PROTOCOL,
					keyID,
					tags,
				}),
			})
		}
	}
	if (proofs.length === 1) args.inputBEEF = proofs[0]
	else if (proofs.length > 1) {
		const beef = new Beef()
		for (const proof of proofs) beef.mergeBeef(proof)
		args.inputBEEF = beef.toBinary()
	}
	const result = await executeTrackedAction(
		wallet,
		args,
		undefined,
		args.inputBEEF ? Array.from(args.inputBEEF) : undefined,
		undefined,
		{
			spends: items.flatMap(({ coin }) =>
				coin ? [{ basket: ORDINALS_BASKET, id: coin.id }] : [],
			),
			usePermissionModule: false,
		},
	)

	if (result.error) {
		throw new CliError(
			`The wallet could not publish the batch: ${result.error}`,
		)
	}
	if (!result.txid) {
		throw new CliError(
			'The wallet returned no txid. Check wallet activity before retrying this publish.',
		)
	}

	const txid = result.txid
	return items.map(({ coin }, index) => ({
		txid,
		beef: result.tx ? Uint8Array.from(result.tx) : undefined,
		outpoint: `${txid}_${index}`,
		origin: coin?.origin ?? `${txid}_${index}`,
	}))
}
