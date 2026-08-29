import type { SecurityLevel, WalletProtocol } from '@bsv/sdk'

/** BRC-100 originator this CLI identifies itself with to the user's wallet. */
export const ORIGINATOR = 'bitplan.dev'

/**
 * On-chain content type. Constant across every version of every draft — the
 * envelope, not the payload, is what the type describes, and BRC-147 keeps the
 * genesis `type:` tag on every reinscription anyway.
 */
export const CONTENT_TYPE = 'application/x-bitplan'

/** Ordinals-basket tag every bitplan coin carries, from genesis onward. */
export const TYPE_TAG = `type:${CONTENT_TYPE}`

/**
 * BRC-2 protocol for the content-key wrap. Security level 2 = the wallet asks
 * the user per counterparty per app.
 */
export const BITPLAN_PROTOCOL: WalletProtocol = [2 as SecurityLevel, 'bitplan']

/** Cleartext MAP metadata written beside the envelope. Deliberately minimal. */
export const MAP_METADATA: Record<string, string> = {
	app: 'bitplan',
	type: 'plan',
	enc: '1',
}

/** Default BRC-100 JSON API endpoint (BSV Desktop). */
export const DEFAULT_WALLET_URL = 'http://127.0.0.1:3321'

/** Public viewer for a published draft. */
export const VIEWER_BASE_URL = 'https://bitplan.dev/d'

/** ORDFS gateway used to read published envelopes back. */
export const DEFAULT_ORDFS_URL = 'https://ordfs.network'

/** Fee estimate shown before publishing, in satoshis per 1000 bytes. */
export const FEE_SATS_PER_KB = 1
