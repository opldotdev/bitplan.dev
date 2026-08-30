import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import type { WalletInterface } from '@bsv/sdk'
import {
	ENVELOPE_OVERHEAD_ESTIMATE,
	FEE_SATS_PER_KB,
	isBitplanContentType,
	VIEWER_BASE_URL,
} from '../constants.js'
import {
	type DraftMeta,
	type DraftPlaintext,
	MAX_SHARED_RECIPIENTS,
	newKeyId,
	normalizeIdentityKey,
	openEnvelope,
	sealEnvelope,
	sharedWith as sharedWithHeader,
} from '../envelope.js'
import { CliError } from '../errors.js'
import { collectGitMetadata } from '../git.js'
import { validateHtml } from '../htmlPolicy.js'
import { fetchLatest } from '../ordfs.js'
import {
	type BitplanCoin,
	findCoinByOrigin,
	publishGenesis,
	publishVersion,
} from '../ordinals.js'
import { toOrdinalOutpoint } from '../outpoint.js'
import { relayBeef } from '../relay.js'
import { scanForSecrets } from '../secretScan.js'
import {
	type DraftRecord,
	findDraftByFile,
	findDraftByOrigin,
	saveDraftRecord,
} from '../state.js'
import { CLI_VERSION } from '../version.js'
import { connectWallet, identityKey } from '../wallet.js'

export interface UploadOptions {
	draft?: string
	new?: boolean
	description?: string
	yes?: boolean
	allowFinding?: string[]
	shareWith?: string[]
	private?: boolean
	walletUrl?: string
	ordfsUrl?: string
	relay?: boolean
}

export async function uploadCommand(
	file: string,
	options: UploadOptions,
): Promise<void> {
	if (options.new && options.draft) {
		throw new CliError('--new and --draft cannot be used together.')
	}
	if (options.private && (options.shareWith?.length ?? 0) > 0) {
		throw new CliError('--private and --share-with cannot be used together.')
	}
	const requestedRecipients = [
		...new Set((options.shareWith ?? []).map(normalizeIdentityKey)),
	]

	const resolvedFile = path.resolve(file)
	if (!fs.existsSync(resolvedFile)) {
		throw new CliError(`File does not exist: ${resolvedFile}`)
	}

	const html = fs.readFileSync(resolvedFile, 'utf8')
	const known = findDraftByFile(resolvedFile)
	let explicitOrigin: string | null = null
	if (options.draft) {
		try {
			explicitOrigin = toOrdinalOutpoint(options.draft)
		} catch {
			throw new CliError(
				`--draft must be an outpoint in txid_vout form; got "${options.draft}".`,
			)
		}
	}
	const targetOrigin = options.new
		? null
		: (explicitOrigin ?? known?.origin ?? null)
	const targetLocal = targetOrigin
		? known?.origin === targetOrigin
			? known
			: findDraftByOrigin(targetOrigin)?.record
		: undefined

	const validation = validateHtml(html)
	if (!validation.ok) {
		throw new CliError(
			`This document failed bitplan's HTML policy:\n- ${validation.errors.join('\n- ')}`,
		)
	}
	for (const warning of validation.warnings) {
		console.warn(`Warning: ${warning}`)
	}

	const git = collectGitMetadata(path.dirname(resolvedFile))
	const meta: DraftMeta = {
		title: validation.title,
		description: resolveDescription(options.description, targetLocal),
		...git,
		cliVersion: CLI_VERSION,
		fileSha256: createHash('sha256').update(html, 'utf8').digest('hex'),
		createdAt: new Date().toISOString(),
	}
	const plaintext: DraftPlaintext = { meta, html }

	const { wallet, url } = await connectWallet(options.walletUrl)

	// Resolve what we are updating before showing the confirmation, so the
	// user is told "version 4 of this draft", not "something".
	let coin: BitplanCoin | null = null
	let keyID: string
	let nextVersion: number | null
	let previousRecipients: string[] = []
	if (targetOrigin) {
		coin = await findCoinByOrigin(wallet, targetOrigin)
		const local = targetLocal
		if (local && local.latestOutpoint === coin.outpoint) {
			keyID = local.keyID
			nextVersion =
				local.latestVersion === null ? null : local.latestVersion + 1
			previousRecipients = local.sharedWith ?? []
		} else {
			// Adopting a draft with no local history. The keyID it was sealed
			// with lives in the header of the published envelope — that is why
			// the header carries it in cleartext — and the version number comes
			// from the chain position ORDFS reports: genesis is sequence 0 and
			// version 1, so the version about to be written is sequence + 2.
			const adopted = await adoptFromChain(
				wallet,
				targetOrigin,
				coin.outpoint,
				options.ordfsUrl,
			)
			keyID = adopted.keyID
			nextVersion = adopted.sequence === null ? null : adopted.sequence + 2
			previousRecipients = adopted.sharedWith
			if (options.description === undefined) {
				meta.description = adopted.description
			}
		}
	} else {
		keyID = newKeyId()
		nextVersion = 1
	}
	let sharedWith = options.private
		? []
		: [
				...new Set(
					[...previousRecipients, ...requestedRecipients].map(
						normalizeIdentityKey,
					),
				),
			]
	if (sharedWith.length > MAX_SHARED_RECIPIENTS) {
		throw new CliError(
			`A shared draft supports at most ${MAX_SHARED_RECIPIENTS} recipient identities; got ${sharedWith.length}.`,
		)
	}
	scanPlaintext(plaintext, resolvedFile, options.allowFinding)

	// Confirm before sealing: sealing triggers the wallet's own BRC-2
	// permission dialog, which must not appear for a publish the user has
	// not yet agreed to. Size shown is plaintext + a small envelope overhead.
	const plaintextBytes = new TextEncoder().encode(
		JSON.stringify(plaintext),
	).length
	await confirmPublish({
		file: resolvedFile,
		title: meta.title,
		envelopeBytes: estimateEnvelopeBytes(plaintextBytes, sharedWith.length),
		origin: targetOrigin,
		version: nextVersion,
		walletUrl: url,
		sharedWith,
		privateReset: options.private === true && previousRecipients.length > 0,
		skip: options.yes === true,
	})

	let ownerIdentityKey: string | undefined
	if (sharedWith.length > 0) {
		try {
			ownerIdentityKey = normalizeIdentityKey(await identityKey(wallet))
		} catch (error) {
			throw new CliError(
				`The wallet could not provide its identity key for sharing: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
		sharedWith = sharedWith.filter(
			(recipientIdentityKey) => recipientIdentityKey !== ownerIdentityKey,
		)
	}

	const envelope = await sealEnvelope(
		wallet,
		plaintext,
		keyID,
		sharedWith,
		ownerIdentityKey,
	)

	const published = coin
		? await publishVersion(wallet, coin, envelope)
		: await publishGenesis(wallet, envelope)

	console.log(coin ? 'Published a new version.' : 'Published a new draft.')
	console.log(`Origin:   ${published.origin}`)
	console.log(`Outpoint: ${published.outpoint}`)
	console.log(`Version:  ${nextVersion ?? 'unknown (no local history)'}`)
	console.log(
		sharedWith.length === 0
			? 'Access:   This wallet only'
			: `Access:   This wallet + ${sharedWith.length} shared identit${sharedWith.length === 1 ? 'y' : 'ies'}`,
	)
	const record: DraftRecord = {
		origin: published.origin,
		keyID,
		latestOutpoint: published.outpoint,
		latestVersion: nextVersion,
		updatedAt: new Date().toISOString(),
		title: meta.title,
		description: meta.description,
		sharedWith,
	}
	try {
		saveDraftRecord(resolvedFile, record)
	} catch (error) {
		console.warn(
			`Warning: the draft was published, but local state was not saved: ${error instanceof Error ? error.message : String(error)}`,
		)
		console.warn(
			`Keep the origin and outpoint above. A retry would publish another version.`,
		)
	}

	if (options.relay !== false) {
		if (published.beef) {
			try {
				const relay = await relayBeef(published.beef, published.txid)
				console.log(
					relay.state === 'accepted'
						? `Relay:    1Sat accepted (${relay.txStatus})`
						: `Relay:    1Sat is still processing (${relay.txStatus})`,
				)
			} catch (error) {
				console.warn(
					`Warning: the wallet published the draft, but 1Sat relay failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		} else {
			console.warn(
				'Warning: the wallet published the draft but returned no Atomic BEEF, so it could not be relayed to 1Sat.',
			)
		}
	}
	console.log(`Viewer:   ${viewerUrl(published.origin)}`)
}

export function resolveDescription(
	description: string | undefined,
	existing: DraftRecord | undefined,
): string | null {
	return description ?? existing?.description ?? null
}

export function viewerUrl(origin: string): string {
	return `${VIEWER_BASE_URL}/${encodeURIComponent(origin)}`
}

/** 1 sat/KB, rounded up — the usual 1Sat Ordinals rate. */
export function estimateFeeSats(bytes: number): number {
	return Math.max(1, Math.ceil((bytes / 1000) * FEE_SATS_PER_KB))
}

/** Approximation shown before wallet encryption prompts. */
export function estimateEnvelopeBytes(
	plaintextBytes: number,
	recipientCount: number,
): number {
	if (recipientCount === 0) {
		return plaintextBytes + ENVELOPE_OVERHEAD_ESTIMATE + 48
	}
	const readerCount = recipientCount + 1
	const wrappedContentKeys = (32 + 48) * readerCount
	const sharedHeaderOverhead = readerCount * 160
	return (
		plaintextBytes +
		48 +
		ENVELOPE_OVERHEAD_ESTIMATE +
		wrappedContentKeys +
		sharedHeaderOverhead
	)
}

async function adoptFromChain(
	wallet: WalletInterface,
	origin: string,
	expectedOutpoint: string,
	ordfsUrl: string | undefined,
): Promise<{
	keyID: string
	sequence: number | null
	sharedWith: string[]
	description: string | null
}> {
	const content = await fetchLatest(origin, { baseUrl: ordfsUrl })
	if (!isBitplanContentType(content.contentType)) {
		throw new CliError(
			`${origin} is a ${content.contentType} inscription, not a bitplan draft.`,
		)
	}
	if (
		!matchesOutpoint(content.origin, origin) ||
		!matchesOutpoint(content.outpoint, expectedOutpoint)
	) {
		throw new CliError(
			`ORDFS has not caught up to the wallet's current draft coin. Refusing to inherit an older access list; wait for indexing and try again.`,
		)
	}
	const { header, plaintext } = await openEnvelope(wallet, content.bytes)
	return {
		keyID: header.key.keyID,
		sequence: content.sequence,
		sharedWith: sharedWithHeader(header),
		description:
			typeof plaintext.meta.description === 'string' ||
			plaintext.meta.description === null
				? plaintext.meta.description
				: null,
	}
}

function matchesOutpoint(actual: string | null, expected: string): boolean {
	if (!actual) return false
	try {
		return toOrdinalOutpoint(actual) === toOrdinalOutpoint(expected)
	} catch {
		return false
	}
}

function scanPlaintext(
	plaintext: DraftPlaintext,
	file: string,
	allowFinding: string[] | undefined,
): void {
	// The scan runs on plaintext. Ciphertext is permanent, so secrets still
	// block publication unless each finding is explicitly waived.
	const findings = scanForSecrets([
		{ source: path.basename(file), text: plaintext.html },
		{ source: 'metadata', text: JSON.stringify(plaintext.meta, null, 1) },
	])
	const waived = new Set(allowFinding ?? [])
	const blocking = findings.filter((finding) => !waived.has(finding.id))
	if (blocking.length > 0) {
		const lines = blocking.map(
			(finding) =>
				`  ${finding.source}:${finding.line}  ${finding.description}\n` +
				`    match: ${finding.excerpt}\n` +
				`    waive: --allow-finding ${finding.id}`,
		)
		throw new CliError(
			[
				`The secret scanner found ${blocking.length} thing${blocking.length === 1 ? '' : 's'} that should not be published:`,
				'',
				...lines,
				'',
				'Remove them from the document, or waive each one individually.',
			].join('\n'),
		)
	}
	if (findings.length > 0) {
		console.warn(
			`Warning: ${findings.length} secret-scanner finding${findings.length === 1 ? '' : 's'} waived by --allow-finding.`,
		)
	}
}

interface ConfirmInput {
	file: string
	title: string | null
	envelopeBytes: number
	origin: string | null
	version: number | null
	walletUrl: string
	sharedWith: string[]
	privateReset: boolean
	skip: boolean
}

async function confirmPublish(input: ConfirmInput): Promise<void> {
	const kind = input.origin ? 'New version' : 'New draft'
	console.log('')
	console.log(`${kind} of: ${input.file}`)
	console.log(`Title:    ${input.title ?? '(untitled)'}`)
	console.log(
		`Size:     ${input.envelopeBytes.toLocaleString('en-US')} bytes on chain (encrypted)`,
	)
	console.log(
		`Fee:      ~${estimateFeeSats(input.envelopeBytes).toLocaleString('en-US')} sats at 1 sat/KB`,
	)
	if (input.origin) {
		console.log(`Origin:   ${input.origin}`)
		console.log(`Version:  ${input.version ?? 'unknown (no local history)'}`)
	}
	console.log(`Wallet:   ${input.walletUrl}`)
	if (input.sharedWith.length === 0) {
		console.log('Access:   This wallet only')
	} else {
		console.log(
			`Access:   This wallet + ${input.sharedWith.length} shared identit${input.sharedWith.length === 1 ? 'y' : 'ies'}`,
		)
		for (const identityKey of input.sharedWith) {
			console.log(`          ${identityKey}`)
		}
		console.log('          Recipient identity keys are public in the envelope.')
	}
	if (input.privateReset) {
		console.log(
			'          This version removes prior recipients; older shared versions remain readable.',
		)
	}
	console.log('')
	console.log(
		'Publishing is permanent. The content is encrypted, but the ciphertext',
	)
	console.log('is public forever and cannot be deleted, edited, or taken back.')
	console.log('')

	if (input.skip) return

	if (!process.stdin.isTTY) {
		throw new CliError(
			'Refusing to publish without confirmation. Re-run with --yes when there is no terminal to prompt on.',
		)
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	let answer: string
	try {
		answer = (await rl.question('Publish this to Bitcoin? [y/N] ')).trim()
	} finally {
		rl.close()
	}
	if (!/^y(es)?$/i.test(answer)) {
		throw new CliError('Cancelled. Nothing was published.')
	}
}
