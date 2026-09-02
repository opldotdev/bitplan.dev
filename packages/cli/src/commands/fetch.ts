import { isBitplanContentType } from '../constants.js'
import { openEnvelope, sharedWith } from '../envelope.js'
import { CliError } from '../errors.js'
import { fetchLatest, originFromReference } from '../ordfs.js'
import { connectWallet } from '../wallet.js'

export interface FetchOptions {
	meta?: boolean
	json?: boolean
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
		if (!/^[1-9]\d*$/.test(options.version)) {
			throw new CliError(
				`--version must be a positive version number; got "${options.version}".`,
			)
		}
		const parsed = Number(options.version)
		if (!Number.isSafeInteger(parsed)) {
			throw new CliError(`--version is too large; got "${options.version}".`)
		}
		// Version 1 is the genesis inscription, which ORDFS calls sequence 0.
		seq = parsed - 1
	}

	const content = await fetchLatest(origin, {
		baseUrl: options.ordfsUrl,
		seq,
	})

	if (!isBitplanContentType(content.contentType)) {
		throw new CliError(
			`${origin} is a ${content.contentType} inscription, not a bitplan draft.`,
		)
	}

	const { wallet } = await connectWallet(options.walletUrl)
	const { header, plaintext } = await openEnvelope(wallet, content.bytes)

	const metadata = {
		origin: content.origin ?? origin,
		outpoint: content.outpoint,
		version: content.sequence === null ? null : content.sequence + 1,
		contentType: content.contentType,
		envelopeVersion: header.v,
		keyID: header.key.keyID,
		access: {
			mode: sharedWith(header).length === 0 ? 'wallet-only' : 'shared',
			senderIdentityKey: header.key.senderIdentityKey,
			readers: sharedWith(header),
		},
		meta: plaintext.meta,
	}

	if (options.json) {
		console.log(JSON.stringify({ ...metadata, html: plaintext.html }, null, 2))
		return
	}

	if (options.meta) console.error(JSON.stringify(metadata, null, 2))

	process.stdout.write(plaintext.html)
	if (!plaintext.html.endsWith('\n')) process.stdout.write('\n')
}
