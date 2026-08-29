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

const TXID_HEX = /^[0-9a-f]{64}$/i

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
	const separator = trimmed.length > 64 ? trimmed[64] : undefined
	if (separator !== '.' && separator !== '_') {
		throw new Error(`Not an outpoint: ${outpoint}`)
	}
	const txid = trimmed.slice(0, 64)
	const vout = Number.parseInt(trimmed.slice(65), 10)
	if (!TXID_HEX.test(txid) || !Number.isInteger(vout) || vout < 0) {
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
