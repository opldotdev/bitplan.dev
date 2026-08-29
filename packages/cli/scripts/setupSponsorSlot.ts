import { parseArgs } from 'node:util'
import {
	buildOrdLockScript,
	createContext,
	defaultPayAddress,
	inscribe,
	P1SAT_PROTOCOL,
} from '@1sat/actions'
import { PublicKey } from '@bsv/sdk'
import { SPONSOR_TIERS } from '../../../apps/web/src/lib/sponsors'
import { relayBeef } from '../src/relay.js'
import { connectWallet } from '../src/wallet.js'

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			'price-sats': { type: 'string' },
			slot: { type: 'string' },
			'wallet-url': { type: 'string' },
			yes: { default: false, type: 'boolean' },
		},
		strict: true,
	})
	if (!values.yes) {
		throw new Error('This creates permanent transactions. Rerun with --yes.')
	}
	const tier = SPONSOR_TIERS.find((candidate) =>
		candidate.slotIds.includes(values.slot ?? ''),
	)
	if (!(tier && values.slot)) {
		throw new Error('Provide a valid slot such as --slot gold-1.')
	}

	const price = values['price-sats']
		? strictPositiveInteger(values['price-sats'])
		: Math.max(1, Math.ceil((tier.priceUsd / (await bsvUsdRate())) * 1e8))
	const { wallet } = await connectWallet(values['wallet-url'])
	const context = createContext(wallet, { chain: 'main' })
	const keyID = `bitplan-sponsor:${values.slot}:cancel`
	const cancelKey = await wallet.getPublicKey({
		protocolID: P1SAT_PROTOCOL,
		keyID,
		counterparty: 'self',
		forSelf: true,
	})
	const cancelAddress = PublicKey.fromString(cancelKey.publicKey).toAddress()
	const payAddress = await defaultPayAddress(context)
	const map = {
		app: 'bitplan',
		name: `BitPlan sponsor slot ${values.slot}`,
		subType: 'bitplanSponsorSlot',
		subTypeData: JSON.stringify({
			schema: 1,
			slot: values.slot,
			tier: tier.id,
		}),
		type: 'ord',
	}
	const listed = await inscribe.execute(context, {
		// One neutral pixel. The site renders an empty button until purchase.
		base64Content: 'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQ+tK3vv+BiOh/AAA=',
		contentType: 'image/webp',
		destination: {
			customInstructions: {
				counterparty: 'self',
				keyID,
				protocolID: P1SAT_PROTOCOL,
			},
			lockingScript: buildOrdLockScript(cancelAddress, payAddress, price),
		},
		map,
	})
	if (listed.error) throw new Error(`Could not create slot: ${listed.error}`)
	if (!listed.txid)
		throw new Error('The wallet returned no listing transaction ID.')
	const origin = `${listed.txid}_0`
	console.log(`Created and listed: ${origin} for ${price} sats`)
	await relay(listed.tx, listed.txid)
	console.log(`Origin mapping: "${values.slot}": "${origin}"`)
}

function strictPositiveInteger(value: string): number {
	if (!/^[1-9]\d*$/.test(value))
		throw new Error('--price-sats must be positive.')
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed))
		throw new Error('--price-sats is too large.')
	return parsed
}

async function bsvUsdRate(): Promise<number> {
	const response = await fetch(
		'https://api.whatsonchain.com/v1/bsv/main/exchangerate',
	)
	if (!response.ok)
		throw new Error(`Exchange rate returned HTTP ${response.status}.`)
	const body = (await response.json()) as { rate?: unknown }
	if (typeof body.rate !== 'number' || body.rate <= 0) {
		throw new Error('Exchange rate did not return a positive USD value.')
	}
	return body.rate
}

async function relay(tx: number[] | undefined, txid: string): Promise<void> {
	if (!tx) {
		console.warn(
			'The wallet returned no Atomic BEEF; automatic relay was skipped.',
		)
		return
	}
	try {
		const result = await relayBeef(Uint8Array.from(tx), txid)
		console.log(`Relay: ${result.txStatus}`)
	} catch (error) {
		console.warn(
			`Published, but the 1Sat relay failed: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	})
}
