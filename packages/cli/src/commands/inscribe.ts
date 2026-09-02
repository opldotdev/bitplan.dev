import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { CliError } from '../errors.js'
import {
	isHostedId,
	markHostedInscribed,
	readHostedRecord,
	resolveSiteUrl,
} from '../hosted.js'
import { fetchLatest, originFromReference } from '../ordfs.js'
import {
	findCoinByOrigin,
	publishGenesis,
	publishVersion,
} from '../ordinals.js'
import type { RelayResult } from '../relay.js'
import { relayBeef } from '../relay.js'
import {
	type DraftRecord,
	findDraftByFile,
	findDraftByOrigin,
	readConfig,
	saveDraftRecord,
} from '../state.js'
import { connectWallet } from '../wallet.js'
import { estimateFeeSats, viewerUrl } from './upload.js'

export interface InscribeOptions {
	allVersions?: boolean
	walletUrl?: string
	siteUrl?: string
	yes?: boolean
	json?: boolean
}

export async function inscribeCommand(
	reference: string,
	options: InscribeOptions,
): Promise<void> {
	if (options.json && !options.yes) {
		throw new CliError('--json requires --yes because inscribing is permanent.')
	}

	const config = readConfig()
	const site = resolveSiteUrl(options.siteUrl ?? config.siteUrl)
	const target = resolveHostedTarget(reference)
	if (!target.record) {
		console.warn(
			'Note: this machine has no local record for this hosted draft; drafts.json will not be updated.',
		)
	}

	const hosted = await readHostedRecord(site, target.id)
	if (hosted.origin) {
		throw new CliError(`Already on the chain at ${hosted.origin}.`)
	}

	const seqs = options.allVersions
		? Array.from({ length: hosted.versions }, (_, index) => index)
		: [-1]
	const envelopes: Uint8Array[] = []
	for (const seq of seqs) {
		const content = await fetchLatest(target.id, { seq, siteUrl: site })
		envelopes.push(content.bytes)
	}
	const totalBytes = envelopes.reduce((sum, bytes) => sum + bytes.length, 0)

	await confirmInscribe({
		id: target.id,
		versionsToWrite: envelopes.length,
		allVersions: options.allVersions === true,
		totalVersions: hosted.versions,
		envelopeBytes: totalBytes,
		skip: options.yes === true,
		quiet: options.json === true,
	})

	const { wallet } = await connectWallet(options.walletUrl)
	const first = envelopes[0]
	if (!first) {
		throw new CliError('No hosted versions to inscribe.')
	}

	const genesis = await publishGenesis(wallet, first)
	await relayPublished(genesis, options.json === true)
	let latest = genesis
	for (const envelope of envelopes.slice(1)) {
		const coin = await findCoinByOrigin(wallet, genesis.origin)
		latest = await publishVersion(wallet, coin, envelope)
		await relayPublished(latest, options.json === true)
	}

	const versionsWritten = envelopes.length
	let redirectRecorded = false
	if (target.record?.hostedSecret) {
		await markHostedInscribed(
			site,
			target.id,
			target.record.hostedSecret,
			genesis.origin,
		)
		redirectRecorded = true
	} else {
		console.warn(
			'Note: the hosted redirect could not be recorded (no local secret).',
		)
	}

	if (target.filePath && target.record) {
		const rest = { ...target.record }
		delete rest.hostedSecret
		const record: DraftRecord = {
			...rest,
			origin: genesis.origin,
			latestOutpoint: latest.outpoint,
			latestVersion: versionsWritten,
			updatedAt: new Date().toISOString(),
		}
		saveDraftRecord(target.filePath, record)
	}

	const viewer = viewerUrl(genesis.origin)
	if (options.json) {
		console.log(
			JSON.stringify(
				{
					inscribed: true,
					hostedId: target.id,
					origin: genesis.origin,
					outpoint: latest.outpoint,
					versions: versionsWritten,
					viewer,
				},
				null,
				2,
			),
		)
		return
	}

	console.log('Inscribed a hosted draft onto the chain.')
	console.log(`Origin:   ${genesis.origin}`)
	console.log(`Outpoint: ${latest.outpoint}`)
	console.log(`Versions: ${versionsWritten} written`)
	console.log(`Viewer:   ${viewer}`)
	if (redirectRecorded) {
		console.log('The hosted link now redirects to the chain origin.')
	}
}

function resolveHostedTarget(reference: string): {
	id: string
	filePath?: string
	record?: DraftRecord
} {
	const trimmed = reference.trim()
	if (!trimmed) throw new CliError('No hosted draft given.')

	if (isHostedId(trimmed)) {
		const found = findDraftByOrigin(trimmed)
		return {
			id: trimmed,
			filePath: found?.filePath,
			record: found?.record,
		}
	}

	if (/^https?:\/\//i.test(trimmed)) {
		const origin = originFromReference(trimmed)
		if (!isHostedId(origin)) {
			throw new CliError(`That URL is not a hosted draft: ${reference}`)
		}
		const found = findDraftByOrigin(origin)
		return {
			id: origin,
			filePath: found?.filePath,
			record: found?.record,
		}
	}

	const resolved = path.resolve(trimmed)
	if (fs.existsSync(resolved)) {
		const record = findDraftByFile(resolved)
		if (!record || !isHostedId(record.origin)) {
			throw new CliError(
				`That file is not mapped to a hosted draft: ${resolved}`,
			)
		}
		return { id: record.origin, filePath: resolved, record }
	}

	throw new CliError(
		`Not a hosted draft id, viewer URL, or local file: ${reference}`,
	)
}

interface ConfirmInscribeInput {
	id: string
	versionsToWrite: number
	allVersions: boolean
	totalVersions: number
	envelopeBytes: number
	skip: boolean
	quiet: boolean
}

async function confirmInscribe(input: ConfirmInscribeInput): Promise<void> {
	if (input.quiet) return
	console.log('')
	console.log(`Inscribe hosted draft: ${input.id}`)
	console.log(
		input.allVersions
			? `Versions: all ${input.totalVersions}`
			: 'Versions: latest only',
	)
	console.log(`Writing:  ${input.versionsToWrite}`)
	console.log(
		`Fee:      ~${estimateFeeSats(input.envelopeBytes).toLocaleString('en-US')} sats at 1 sat/KB`,
	)
	console.log('')
	console.log(
		'Inscribing publishes this ciphertext on Bitcoin. That write is permanent.',
	)
	console.log('')

	if (input.skip) return

	if (!process.stdin.isTTY) {
		throw new CliError(
			'Refusing to inscribe without confirmation. Re-run with --yes when there is no terminal to prompt on.',
		)
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	let answer: string
	try {
		answer = (await rl.question('Inscribe this onto Bitcoin? [y/N] ')).trim()
	} finally {
		rl.close()
	}
	if (!/^y(es)?$/i.test(answer)) {
		throw new CliError('Cancelled. Nothing was inscribed.')
	}
}

async function relayPublished(
	published: { beef?: Uint8Array; txid: string },
	quiet: boolean,
): Promise<
	RelayResult | { state: 'skipped' | 'unavailable' | 'failed'; error?: string }
> {
	if (!published.beef) {
		if (!quiet) {
			console.warn(
				'Warning: the wallet published the draft but returned no Atomic BEEF, so it could not be relayed to 1Sat.',
			)
		}
		return { state: 'unavailable' }
	}
	try {
		const relay = await relayBeef(published.beef, published.txid)
		if (!quiet) {
			console.log(
				relay.state === 'accepted'
					? `Relay:    1Sat accepted (${relay.txStatus})`
					: `Relay:    1Sat is still processing (${relay.txStatus})`,
			)
		}
		return relay
	} catch (error) {
		const failed = {
			state: 'failed' as const,
			error: error instanceof Error ? error.message : String(error),
		}
		console.warn(
			`Warning: the wallet published the draft, but 1Sat relay failed: ${failed.error}`,
		)
		return failed
	}
}
