/**
 * Two outpoint spellings meet in this CLI:
 *
 *   - `txid.vout`  — BRC-100 wallet outputs (`WalletOutput.outpoint`)
 *   - `txid_vout`  — ordinals indexers, ORDFS keys, and `origin:` tags
 *
 * Everything bitplan stores or prints uses the ordinal (`_`) form, because that
 * is what a user pastes into a viewer or an explorer. Conversions happen at the
 * wallet boundary only.
 */

const OUTPOINT = /^([0-9a-f]{64})[._](0|[1-9]\d*)$/i
const MAX_VOUT = 0xffff_ffff

/** `txid_vout`. Accepts either spelling. */
export function toOrdinalOutpoint(outpoint: string): string {
	const { txid, vout } = splitOutpoint(outpoint)
	return `${txid}_${vout}`
}

/** `txid.vout`. Accepts either spelling. */
export function toWalletOutpoint(outpoint: string): string {
	const { txid, vout } = splitOutpoint(outpoint)
	return `${txid}.${vout}`
}

export function splitOutpoint(outpoint: string): {
	txid: string
	vout: number
} {
	const trimmed = outpoint.trim()
	const match = OUTPOINT.exec(trimmed)
	if (!match) {
		throw new Error(`Not an outpoint: ${outpoint}`)
	}
	const txid = match[1]
	const vout = Number(match[2])
	if (!txid || !Number.isSafeInteger(vout) || vout > MAX_VOUT) {
		throw new Error(`Not an outpoint: ${outpoint}`)
	}
	return { txid: txid.toLowerCase(), vout }
}

export function isOutpoint(value: string): boolean {
	try {
		splitOutpoint(value)
		return true
	} catch {
		return false
	}
}

/** `abcd...wxyz_0` — first and last four of the txid, vout kept. */
export function shortOutpoint(outpoint: string): string {
	try {
		const { txid, vout } = splitOutpoint(outpoint)
		return `${txid.slice(0, 4)}...${txid.slice(-4)}_${vout}`
	} catch {
		if (outpoint.length <= 12) return outpoint
		return `${outpoint.slice(0, 4)}...${outpoint.slice(-4)}`
	}
}
