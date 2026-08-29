import { CONTENT_TYPE } from '../constants.js'
import { openEnvelope } from '../envelope.js'
import { CliError } from '../errors.js'
import { fetchLatest, originFromReference } from '../ordfs.js'
import { connectWallet } from '../wallet.js'

export interface FetchOptions {
	meta?: boolean
	version?: string
	walletUrl?: string
	ordfsUrl?: string
}

/**
 * Read a published draft back.
 *
 * The HTML goes to stdout so it can be piped or redirected; metadata goes to
 * stderr under --meta so it never contaminates the document.
 */
export async function fetchCommand(
	reference: string,
	options: FetchOptions,
): Promise<void> {
	const origin = originFromReference(reference)

	let seq: number | undefined
	if (options.version !== undefined) {
		const parsed = Number.parseInt(options.version, 10)
		if (!Number.isInteger(parsed) || parsed < 1) {
			throw new CliError(
				`--version must be a positive version number; got "${options.version}".`,
			)
		}
		// Version 1 is the genesis inscription, which ORDFS calls sequence 0.
		seq = parsed - 1
	}

	const content = await fetchLatest(origin, {
		baseUrl: options.ordfsUrl,
		seq,
	})

	if (!content.contentType.startsWith(CONTENT_TYPE)) {
		throw new CliError(
			`${origin} is a ${content.contentType} inscription, not a bitplan draft.`,
		)
	}

	const { wallet } = await connectWallet(options.walletUrl)
	const { header, plaintext } = await openEnvelope(wallet, content.bytes)

	if (options.meta) {
		const version = content.sequence === null ? null : content.sequence + 1
		console.error(
			JSON.stringify(
				{
					origin: content.origin ?? origin,
					outpoint: content.outpoint,
					version,
					contentType: content.contentType,
					keyID: header.key.keyID,
					meta: plaintext.meta,
				},
				null,
				2,
			),
		)
	}

	process.stdout.write(plaintext.html)
	if (!plaintext.html.endsWith('\n')) process.stdout.write('\n')
}
