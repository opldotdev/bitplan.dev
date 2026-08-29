import { listBitplanCoins } from '../ordinals.js'
import { shortOutpoint } from '../outpoint.js'
import { type DraftRecord, readDrafts } from '../state.js'
import { connectWallet } from '../wallet.js'

export interface ListOptions {
	json?: boolean
	verbose?: boolean
	limit?: string
	walletUrl?: string
}

export interface ListedDraft {
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
		console.log('Publish one with: npx bitplan upload ./plan.html')
		return
	}

	console.log(formatDraftsTable(drafts, { verbose: options.verbose === true }))
}

const UNITS: ReadonlyArray<readonly [string, number]> = [
	['year', 31_536_000],
	['month', 2_592_000],
	['week', 604_800],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60],
]

export function timeAgo(value: string | null | undefined, now = Date.now()): string {
	if (!value) return '-'
	const then = new Date(value).getTime()
	if (Number.isNaN(then)) return '-'

	const seconds = Math.max(0, Math.floor((now - then) / 1000))
	for (const [name, secs] of UNITS) {
		const amount = Math.floor(seconds / secs)
		if (amount >= 1) return `${amount} ${name}${amount === 1 ? '' : 's'} ago`
	}
	return 'just now'
}

export function formatDraftsTable(
	drafts: readonly ListedDraft[],
	options: { verbose?: boolean; now?: number } = {},
): string {
	const verbose = options.verbose === true
	const now = options.now ?? Date.now()
	const headers = verbose
		? ['Title', 'Ver', 'Origin', 'Outpoint', 'Updated']
		: ['Title', 'Ver', 'Origin', 'Outpoint', 'Updated']

	const rows = drafts.map((draft) => {
		const title = draft.title ?? 'Untitled (no local record)'
		const ver = draft.version === null ? '-' : `v${draft.version}`
		const origin = verbose ? draft.origin : shortOutpoint(draft.origin)
		const outpoint = verbose ? draft.outpoint : shortOutpoint(draft.outpoint)
		const updated = verbose
			? (draft.updatedAt ?? '-')
			: timeAgo(draft.updatedAt, now)
		return [title, ver, origin, outpoint, updated]
	})

	return renderTable(headers, rows)
}

function renderTable(headers: string[], rows: string[][]): string {
	const widths = headers.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)),
	)
	const line = (cells: string[]) =>
		cells.map((cell, column) => padEnd(cell, widths[column] ?? 0)).join('  ')
	const rule = widths.map((width) => '-'.repeat(width)).join('  ')
	return [line(headers), rule, ...rows.map(line)].join('\n')
}

function padEnd(value: string, width: number): string {
	if (value.length >= width) return value
	return value + ' '.repeat(width - value.length)
}
