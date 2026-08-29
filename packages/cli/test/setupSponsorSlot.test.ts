import { describe, expect, test } from 'bun:test'
import { SPONSOR_TIERS } from '../../../apps/web/src/lib/sponsors'

describe('sponsor slot configuration', () => {
	test('uses unique fixed-size slot canvases', () => {
		const slots = SPONSOR_TIERS.flatMap((tier) => tier.slotIds)
		expect(new Set(slots).size).toBe(30)
		for (const tier of SPONSOR_TIERS) {
			expect(tier.imageWidth).toBeGreaterThan(tier.imageHeight)
		}
	})
})
