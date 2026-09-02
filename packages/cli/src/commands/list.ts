import type { WalletInterface } from '@bsv/sdk'
import { isBitplanContentType } from '../constants.js'
import { openEnvelope } from '../envelope.js'
import { CliError } from '../errors.js'
import { isHostedId } from '../hosted.js'
import { fetchLatest, type OrdfsContent } from '../ordfs.js'
import type { BitplanCoin } from '../ordinals.js'
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
	/** True when the on-chain envelope could not be opened. */
	unreadable?: boolean
	/** True when this row is a hosted draft, not a chain coin. */
	hosted?: boolean
}

interface RecoveredMetadata {
	title: string | null
	description: string | null
	version: number | null
	updatedAt: string | null
}

type FetchDraft = (
	origin: string,
	options?: { baseUrl?: string; seq?: number },
) => Promise<OrdfsContent>

export async function listCommand(options: ListOptions): Promise<void> {
	const limit = parseListLimit(options.limit)
	const { wallet } = await connectWallet(options.walletUrl)
	const coins = await listBitplanCoins(wallet, { limit })

	// The wallet is the source of truth for what exists; local state only adds
	// the human-readable parts, which are encrypted on chain and so cannot be
	// read back from the blockchain without the wallet decrypting each one.
	const byOrigin = new Map<string, { file: string; record: DraftRecord }>()
	for (const [file, record] of Object.entries(readDrafts().files)) {
		byOrigin.set(record.origin, { file, record })
	}

	const hosted = listedHostedDrafts(byOrigin)
	const { drafts: chainDrafts, recoveryErrors } = await listedDraftsForCoins(
		wallet,
		coins,
		byOrigin,
	)
	const drafts = [...hosted, ...chainDrafts]

	if (recoveryErrors.length > 0) {
		console.error(
			`Warning: could not recover encrypted metadata for ${recoveryErrors.length} draft${recoveryErrors.length === 1 ? '' : 's'}; the wallet-owned coins are still listed.`,
		)
		if (options.verbose) {
			for (const { origin, error } of recoveryErrors) {
				console.error(
					`  ${origin}: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
	}

	if (options.json) {
		console.log(JSON.stringify(drafts, null, 2))
		return
	}

	if (drafts.length === 0) {
		console.log('No bitplan drafts in this wallet yet.')
		console.log('Publish one with: npx bitplan upload ./plan.html')
		return
	}

	console.log(
		options.verbose ? formatDraftsVerbose(drafts) : formatDraftsTable(drafts),
	)
}

/** Local hosted drafts. These rows do not need a wallet or ORDFS. */
export function listedHostedDrafts(
	byOrigin: ReadonlyMap<string, { file: string; record: DraftRecord }>,
): ListedDraft[] {
	const drafts: ListedDraft[] = []
	for (const [origin, local] of byOrigin) {
		if (!isHostedId(origin)) continue
		drafts.push({
			origin: local.record.origin,
			outpoint: local.record.latestOutpoint,
			id: local.record.origin,
			title: local.record.title ?? null,
			description: local.record.description ?? null,
			version: local.record.latestVersion,
			updatedAt: local.record.updatedAt ?? null,
			file: local.file,
			hosted: true,
		})
	}
	return drafts
}

/** Map wallet coins to list rows, recovering encrypted metadata when needed. */
export async function listedDraftsForCoins(
	wallet: WalletInterface,
	coins: readonly BitplanCoin[],
	byOrigin: ReadonlyMap<string, { file: string; record: DraftRecord }>,
	load: FetchDraft = fetchLatest,
): Promise<{
	drafts: ListedDraft[]
	recoveryErrors: Array<{ origin: string; error: unknown }>
}> {
	const drafts: ListedDraft[] = []
	const recoveryErrors: Array<{ origin: string; error: unknown }> = []
	for (const coin of coins) {
		const local = byOrigin.get(coin.origin)
		let recovered: RecoveredMetadata | undefined
		let unreadable = false
		if (!local || local.record.latestOutpoint !== coin.outpoint) {
			try {
				recovered = await recoverDraftMetadata(wallet, coin, load)
			} catch (error) {
				recoveryErrors.push({ origin: coin.origin, error })
				unreadable = true
			}
		}
		drafts.push({
			origin: coin.origin,
			outpoint: coin.outpoint,
			id: coin.id,
			title: unreadable
				? null
				: recovered
					? recovered.title
					: (local?.record.title ?? null),
			description: unreadable
				? null
				: recovered
					? recovered.description
					: (local?.record.description ?? null),
			version: recovered
				? recovered.version
				: (local?.record.latestVersion ?? null),
			updatedAt: recovered
				? recovered.updatedAt
				: (local?.record.updatedAt ?? null),
			file: local?.file ?? null,
			...(unreadable ? { unreadable: true } : {}),
		})
	}
	return { drafts, recoveryErrors }
}

export function parseListLimit(value: string | undefined): number {
	if (value === undefined) return 100
	if (!/^[1-9]\d*$/.test(value)) {
		throw new CliError(`--limit must be a positive integer; got "${value}".`)
	}
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed)) {
		throw new CliError(`--limit is too large; got "${value}".`)
	}
	return parsed
}

/** Recover encrypted metadata when drafts.json is missing or behind the wallet. */
export async function recoverDraftMetadata(
	wallet: WalletInterface,
	coin: BitplanCoin,
	load: FetchDraft = fetchLatest,
): Promise<RecoveredMetadata> {
	const content = await load(coin.origin)
	if (!isBitplanContentType(content.contentType)) {
		throw new CliError(
			`${coin.origin} is a ${content.contentType} inscription, not a bitplan draft.`,
		)
	}
	const { plaintext } = await openEnvelope(wallet, content.bytes)
	const meta = plaintext.meta as unknown
	if (typeof meta !== 'object' || meta === null) {
		throw new CliError(
			'Decrypted this draft but its plaintext has no metadata.',
		)
	}
	const fields = meta as Record<string, unknown>
	return {
		title:
			typeof fields.title === 'string' || fields.title === null
				? fields.title
				: null,
		description:
			typeof fields.description === 'string' || fields.description === null
				? fields.description
				: null,
		version: content.sequence === null ? null : content.sequence + 1,
		updatedAt:
			typeof fields.createdAt === 'string' &&
			!Number.isNaN(Date.parse(fields.createdAt))
				? fields.createdAt
				: null,
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

export function timeAgo(
	value: string | null | undefined,
	now = Date.now(),
): string {
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
	options: { now?: number } = {},
): string {
	const now = options.now ?? Date.now()
	const headers = ['Title', 'Ver', 'Origin', 'Outpoint', 'Updated']

	const rows = drafts.map((draft) => {
		const title = draft.hosted
			? `${draft.title ?? 'Untitled'} (hosted, not on chain)`
			: draft.unreadable
				? '(unreadable: old envelope format)'
				: (draft.title ?? 'Untitled (no local record)')
		const ver = draft.version === null ? '-' : `v${draft.version}`
		return [
			title,
			ver,
			shortOutpoint(draft.origin),
			shortOutpoint(draft.outpoint),
			timeAgo(draft.updatedAt, now),
		]
	})

	return renderTable(headers, rows)
}

/** Long values belong on their own lines, not in an unbounded-width table. */
export function formatDraftsVerbose(drafts: readonly ListedDraft[]): string {
	return drafts
		.map((draft, index) => {
			const fields: ReadonlyArray<readonly [string, string]> = [
				[
					'Title',
					draft.hosted
						? `${draft.title ?? 'Untitled'} (hosted, not on chain)`
						: draft.unreadable
							? '(unreadable: old envelope format)'
							: (draft.title ?? 'Untitled'),
				],
				['Description', draft.description ?? '-'],
				['Version', draft.version === null ? '-' : `v${draft.version}`],
				['Origin', draft.origin],
				['Outpoint', draft.outpoint],
				['Updated', draft.updatedAt ?? '-'],
				['File', draft.file ?? '-'],
				['Wallet ID', draft.id],
			]
			const width = Math.max(...fields.map(([label]) => label.length))
			return [
				`Draft ${index + 1}`,
				...fields.map(([label, value]) => `  ${label.padEnd(width)}  ${value}`),
			].join('\n')
		})
		.join('\n\n')
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
