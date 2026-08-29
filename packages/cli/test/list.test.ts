import { describe, expect, test } from 'bun:test'
import { formatDraftsTable, type ListedDraft, timeAgo } from '../src/commands/list.js'

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

	test('verbose mode prints the full origin, outpoint, and timestamp', () => {
		const table = formatDraftsTable([DRAFT], { verbose: true, now: NOW })
		expect(table).toContain(ORIGIN)
		expect(table).toContain(TIP)
		expect(table).toContain('2026-08-29T16:00:00.000Z')
		expect(table).not.toContain('5a52...d813_0')
		expect(table).not.toContain('2 hours ago')
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
