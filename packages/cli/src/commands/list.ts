import { listBitplanCoins } from '../ordinals.js'
import { type DraftRecord, readDrafts } from '../state.js'
import { connectWallet } from '../wallet.js'
import { viewerUrl } from './upload.js'

export interface ListOptions {
	json?: boolean
	limit?: string
	walletUrl?: string
}

interface ListedDraft {
	origin: string
	outpoint: string
	id: string
	/** From local state — titles are encrypted on chain. */
	title: string | null
	description: string | null
	version: number | null
	updatedAt: string | null
	file: string | null
}

export async function listCommand(options: ListOptions): Promise<void> {
	const { wallet } = await connectWallet(options.walletUrl)
	const limit = options.limit ? Number.parseInt(options.limit, 10) : 100
	const coins = await listBitplanCoins(wallet, { limit })

	// The wallet is the source of truth for what exists; local state only adds
	// the human-readable parts, which are encrypted on chain and so cannot be
	// read back from the blockchain without the wallet decrypting each one.
	const byOrigin = new Map<string, { file: string; record: DraftRecord }>()
	for (const [file, record] of Object.entries(readDrafts().files)) {
		byOrigin.set(record.origin, { file, record })
	}

	const drafts: ListedDraft[] = coins.map((coin) => {
		const local = byOrigin.get(coin.origin)
		return {
			origin: coin.origin,
			outpoint: coin.outpoint,
			id: coin.id,
			title: local?.record.title ?? null,
			description: local?.record.description ?? null,
			version: local?.record.latestVersion ?? null,
			updatedAt: local?.record.updatedAt ?? null,
			file: local?.file ?? null,
		}
	})

	if (options.json) {
		console.log(JSON.stringify(drafts, null, 2))
		return
	}

	if (drafts.length === 0) {
		console.log('No bitplan drafts in this wallet yet.')
		console.log('Publish one with: bitplan upload <file>')
		return
	}

	console.log(`Drafts (${drafts.length})`)
	console.log('')
	for (const draft of drafts) {
		console.log(draft.title ?? 'Untitled draft (no local record)')
		const version = draft.version === null ? 'version ?' : `v${draft.version}`
		const updated = draft.updatedAt ? timeAgo(draft.updatedAt) : 'unknown'
		console.log(`  ${version} · updated ${updated}`)
		console.log(`  origin ${draft.origin}`)
		console.log(`  ${viewerUrl(draft.origin)}`)
		if (draft.description) console.log(`  ${draft.description}`)
		if (draft.file) console.log(`  ${draft.file}`)
		console.log('')
	}
}

const UNITS: ReadonlyArray<readonly [string, number]> = [
	['year', 31_536_000],
	['month', 2_592_000],
	['week', 604_800],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60],
]

export function timeAgo(value: string | null | undefined): string {
	if (!value) return 'unknown'
	const then = new Date(value).getTime()
	if (Number.isNaN(then)) return 'unknown'

	const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
	for (const [name, secs] of UNITS) {
		const amount = Math.floor(seconds / secs)
		if (amount >= 1) return `${amount} ${name}${amount === 1 ? '' : 's'} ago`
	}
	return 'just now'
}
