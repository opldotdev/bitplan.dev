import { describe, expect, test } from 'bun:test'
import {
	formatDraftsTable,
	formatDraftsVerbose,
	type ListedDraft,
	listedDraftsForCoins,
	parseListLimit,
	recoverDraftMetadata,
	timeAgo,
} from '../src/commands/list.js'
import { type DraftPlaintext, MAGIC, sealEnvelope } from '../src/envelope.js'
import type { BitplanCoin } from '../src/ordinals.js'
import { createMockWallet } from './mockWallet.js'

const ORIGIN =
	'5a524804ff938d69cf7cc1cb78da03633aadce2ad216d0af87bc296eb2c0d813_0'
const TIP = `${'b'.repeat(64)}_1`

const NOW = Date.parse('2026-08-29T18:00:00.000Z')

const DRAFT: ListedDraft = {
	origin: ORIGIN,
	outpoint: TIP,
	id: 'coin-1',
	title: 'Migration plan',
	description: 'phase one',
	version: 3,
	updatedAt: '2026-08-29T16:00:00.000Z',
	file: '/tmp/plan.html',
}

describe('timeAgo', () => {
	test('renders relative time from a frozen now', () => {
		expect(timeAgo('2026-08-29T16:00:00.000Z', NOW)).toBe('2 hours ago')
		expect(timeAgo('2026-08-28T18:00:00.000Z', NOW)).toBe('1 day ago')
		expect(timeAgo('2026-08-29T17:59:30.000Z', NOW)).toBe('just now')
		expect(timeAgo(null, NOW)).toBe('-')
		expect(timeAgo('not-a-date', NOW)).toBe('-')
	})
})

describe('list options and recovery', () => {
	test('limit is a strict positive integer', () => {
		expect(parseListLimit(undefined)).toBe(100)
		expect(parseListLimit('25')).toBe(25)
		for (const invalid of [
			'0',
			'-1',
			'2drafts',
			'1.5',
			'',
			'9007199254740992',
		]) {
			expect(() => parseListLimit(invalid)).toThrow(/--limit/)
		}
	})

	test('recovers title, description, version, and timestamp from the envelope', async () => {
		const { wallet, calls } = createMockWallet()
		const plaintext: DraftPlaintext = {
			meta: {
				title: 'Recovered plan',
				description: 'No local state needed',
				repoOrg: null,
				repoName: null,
				repoHost: null,
				gitBranch: null,
				gitCommitSha: null,
				gitCommitSubject: null,
				gitDirty: null,
				cliVersion: '0.0.3',
				fileSha256: 'abc',
				createdAt: '2026-08-29T16:00:00.000Z',
			},
			html: '<!doctype html><title>Recovered plan</title>',
		}
		const bytes = await sealEnvelope(wallet, plaintext, 'recovery-key')
		const coin = {
			id: 'coin-1',
			origin: ORIGIN,
			outpoint: TIP,
			output: {},
		} as BitplanCoin
		const recovered = await recoverDraftMetadata(wallet, coin, async () => ({
			bytes,
			contentType: 'application/x-bitplan; charset=binary',
			origin: ORIGIN,
			outpoint: TIP,
			sequence: 2,
		}))

		expect(recovered).toEqual({
			title: 'Recovered plan',
			description: 'No local state needed',
			version: 3,
			updatedAt: '2026-08-29T16:00:00.000Z',
		})
		expect(calls.decrypt).toHaveLength(1)
	})

	test('openEnvelope failure still lists the coin as unreadable', async () => {
		const { wallet } = createMockWallet()
		const oldPrivate = Uint8Array.from([
			...MAGIC,
			0x01,
			0x04,
			0x00,
			0x00,
			0x00,
			0x7b,
			0x7d,
			0x00,
			0x01,
			0x02,
			0x03,
		])
		const coin = {
			id: 'coin-1',
			origin: ORIGIN,
			outpoint: TIP,
			output: {},
		} as BitplanCoin
		const { drafts } = await listedDraftsForCoins(
			wallet,
			[coin],
			new Map(),
			async () => ({
				bytes: oldPrivate,
				contentType: 'application/x-bitplan',
				origin: ORIGIN,
				outpoint: TIP,
				sequence: 0,
			}),
		)

		expect(drafts).toEqual([
			{
				origin: ORIGIN,
				outpoint: TIP,
				id: 'coin-1',
				title: null,
				description: null,
				version: null,
				updatedAt: null,
				file: null,
				unreadable: true,
			},
		])
		expect(JSON.stringify(drafts, null, 2)).toContain('"unreadable": true')
		expect(formatDraftsTable(drafts, { now: NOW })).toContain(
			'(unreadable: old envelope format)',
		)
		expect(formatDraftsVerbose(drafts)).toContain(
			'(unreadable: old envelope format)',
		)
	})
})

describe('formatDraftsTable', () => {
	test('normal mode shortens origin and outpoint and uses time ago', () => {
		const table = formatDraftsTable([DRAFT], { now: NOW })
		expect(table).toContain('Migration plan')
		expect(table).toContain('v3')
		expect(table).toContain('5a52...d813_0')
		expect(table).toContain('bbbb...bbbb_1')
		expect(table).toContain('2 hours ago')
		expect(table).not.toContain(ORIGIN)
		expect(table).not.toContain(TIP)
		expect(table).not.toContain('2026-08-29T16:00:00.000Z')
	})

	test('untitled drafts and missing versions still make a row', () => {
		const table = formatDraftsTable(
			[
				{
					...DRAFT,
					title: null,
					version: null,
					updatedAt: null,
				},
			],
			{ now: NOW },
		)
		expect(table).toContain('Untitled (no local record)')
		expect(table).toMatch(/-\s+5a52\.\.\.d813_0/)
		expect(table).toContain('Title')
		expect(table).toContain('Origin')
		expect(table).toContain('Outpoint')
		expect(table).toContain('Updated')
	})
})

describe('formatDraftsVerbose', () => {
	test('prints one labeled field per line instead of a wide table', () => {
		const output = formatDraftsVerbose([DRAFT])

		expect(output).toContain('Draft 1\n')
		expect(output).toContain(`  Origin       ${ORIGIN}`)
		expect(output).toContain(`  Outpoint     ${TIP}`)
		expect(output).toContain('  Updated      2026-08-29T16:00:00.000Z')
		expect(output).toContain('  Description  phase one')
		expect(output).toContain('  File         /tmp/plan.html')
		expect(output).toContain('  Wallet ID    coin-1')
		expect(output).not.toContain('5a52...d813_0')
		expect(output).not.toContain('Title  Ver')
	})

	test('separates multiple drafts with a blank line', () => {
		const output = formatDraftsVerbose([
			DRAFT,
			{ ...DRAFT, id: 'coin-2', title: null },
		])

		expect(output).toContain('Draft 1')
		expect(output).toContain('\n\nDraft 2\n')
		expect(output).toContain('  Title        Untitled')
	})
})
