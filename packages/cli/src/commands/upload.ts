import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { CONTENT_TYPE, FEE_SATS_PER_KB, VIEWER_BASE_URL } from '../constants.js'
import {
	type DraftMeta,
	type DraftPlaintext,
	newKeyId,
	parseEnvelope,
	sealEnvelope,
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
import { scanForSecrets } from '../secretScan.js'
import { type DraftRecord, findDraftByFile, saveDraftRecord } from '../state.js'
import { CLI_VERSION } from '../version.js'
import { connectWallet } from '../wallet.js'

export interface UploadOptions {
	draft?: string
	new?: boolean
	description?: string
	yes?: boolean
	allowFinding?: string[]
	walletUrl?: string
	ordfsUrl?: string
}

export async function uploadCommand(
	file: string,
	options: UploadOptions,
): Promise<void> {
	const resolvedFile = path.resolve(file)
	if (!fs.existsSync(resolvedFile)) {
		throw new CliError(`File does not exist: ${resolvedFile}`)
	}

	const html = fs.readFileSync(resolvedFile, 'utf8')

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
		description: options.description ?? null,
		...git,
		cliVersion: CLI_VERSION,
		fileSha256: createHash('sha256').update(html, 'utf8').digest('hex'),
		createdAt: new Date().toISOString(),
	}
	const plaintext: DraftPlaintext = { meta, html }

	// The scan runs on the plaintext, not on what goes on chain. Everything
	// bitplan publishes is encrypted, but the ciphertext is public forever —
	// so a secret sealed today is a secret leaked the day the cipher or the
	// key wrap breaks, and an inscription cannot be taken back.
	const findings = scanForSecrets([
		{ source: path.basename(resolvedFile), text: html },
		{ source: 'metadata', text: JSON.stringify(meta, null, 1) },
	])
	const waived = new Set(options.allowFinding ?? [])
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
	const waivedCount = findings.length - blocking.length
	if (waivedCount > 0) {
		console.warn(
			`Warning: ${waivedCount} secret-scanner finding${waivedCount === 1 ? '' : 's'} waived by --allow-finding.`,
		)
	}

	const known = findDraftByFile(resolvedFile)
	const targetOrigin = options.new
		? null
		: options.draft
			? toOrdinalOutpoint(options.draft)
			: (known?.origin ?? null)

	if (options.new && options.draft) {
		throw new CliError('--new and --draft cannot be used together.')
	}

	const { wallet, url } = await connectWallet(options.walletUrl)

	// Resolve what we are updating before showing the confirmation, so the
	// user is told "version 4 of this draft", not "something".
	let coin: BitplanCoin | null = null
	let keyID: string
	let nextVersion: number | null
	if (targetOrigin) {
		coin = await findCoinByOrigin(wallet, targetOrigin)
		const local = known?.origin === targetOrigin ? known : undefined
		if (local) {
			keyID = local.keyID
			nextVersion =
				local.latestVersion === null ? null : local.latestVersion + 1
		} else {
			// Adopting a draft with no local history. The keyID it was sealed
			// with lives in the header of the published envelope — that is why
			// the header carries it in cleartext — and the version number comes
			// from the chain position ORDFS reports: genesis is sequence 0 and
			// version 1, so the version about to be written is sequence + 2.
			const adopted = await adoptFromChain(targetOrigin, options.ordfsUrl)
			keyID = adopted.keyID
			nextVersion = adopted.sequence === null ? null : adopted.sequence + 2
		}
	} else {
		keyID = newKeyId()
		nextVersion = 1
	}

	const envelope = await sealEnvelope(wallet, plaintext, keyID)

	await confirmPublish({
		file: resolvedFile,
		title: meta.title,
		envelopeBytes: envelope.length,
		origin: targetOrigin,
		version: nextVersion,
		walletUrl: url,
		skip: options.yes === true,
	})

	const published = coin
		? await publishVersion(wallet, coin, envelope)
		: await publishGenesis(wallet, envelope)

	const record: DraftRecord = {
		origin: published.origin,
		keyID,
		latestOutpoint: published.outpoint,
		latestVersion: nextVersion,
		updatedAt: new Date().toISOString(),
		title: meta.title,
		description: meta.description,
	}
	saveDraftRecord(resolvedFile, record)

	console.log(coin ? 'Published a new version.' : 'Published a new draft.')
	console.log(`Origin:   ${published.origin}`)
	console.log(`Outpoint: ${published.outpoint}`)
	console.log(`Version:  ${nextVersion ?? 'unknown (no local history)'}`)
	console.log(`Viewer:   ${viewerUrl(published.origin)}`)
}

export function viewerUrl(origin: string): string {
	return `${VIEWER_BASE_URL}/${encodeURIComponent(origin)}`
}

/** 1 sat/KB, rounded up — the usual 1Sat Ordinals rate. */
export function estimateFeeSats(bytes: number): number {
	return Math.max(1, Math.ceil((bytes / 1000) * FEE_SATS_PER_KB))
}

async function adoptFromChain(
	origin: string,
	ordfsUrl: string | undefined,
): Promise<{ keyID: string; sequence: number | null }> {
	const content = await fetchLatest(origin, { baseUrl: ordfsUrl })
	if (!content.contentType.startsWith(CONTENT_TYPE)) {
		throw new CliError(
			`${origin} is a ${content.contentType} inscription, not a bitplan draft.`,
		)
	}
	const { header } = parseEnvelope(content.bytes)
	return { keyID: header.key.keyID, sequence: content.sequence }
}

interface ConfirmInput {
	file: string
	title: string | null
	envelopeBytes: number
	origin: string | null
	version: number | null
	walletUrl: string
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
