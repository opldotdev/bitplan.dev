import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { bestEffortCatalogInscribed } from '../catalog.js'
import { CliError } from '../errors.js'
import {
	estimatePayloadCostAtNetworkFloorForPayloadsOrNull,
	fetchArcadeMiningFee,
	type MiningFeePolicy,
} from '../fee.js'
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
import { isOutpoint } from '../outpoint.js'
import type { RelayResult } from '../relay.js'
import { relayBeef } from '../relay.js'
import {
	type DraftRecord,
	findDraftByFile,
	findDraftByHostedOrigin,
	findDraftByOrigin,
	readConfig,
	saveDraftRecord,
} from '../state.js'
import { connectWallet } from '../wallet.js'
import { viewerUrl } from './upload.js'

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

	// Redirect recovery: a local record that already carries a chain origin,
	// the original hosted id, and the hosted secret means chain publication
	// succeeded earlier but the hosted redirect still needs repair. Repair
	// only the redirect; never fetch envelopes, publish, or relay again.
	const localRecord = target.record
	if (
		localRecord &&
		localRecord.hostedOrigin === target.id &&
		isOutpoint(localRecord.origin)
	) {
		const secret = localRecord.hostedSecret
		if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/i.test(secret)) {
			if (hosted.origin) {
				throw new CliError(`Already on the chain at ${hosted.origin}.`)
			}
			throw new CliError(
				`Already inscribed at ${localRecord.origin}. Refusing to reinscribe.`,
			)
		}
		await repairHostedRedirect({
			site,
			hostedId: target.id,
			record: localRecord,
			filePath: target.filePath,
			initialRemote: hosted,
			json: options.json === true,
		})
		return
	}

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
	const networkFee = options.json ? null : await fetchArcadeMiningFee()
	const networkFloorSats =
		networkFee === null
			? null
			: estimatePayloadCostAtNetworkFloorForPayloadsOrNull(
					envelopes.map((envelope) => envelope.length),
					networkFee,
				)

	await confirmInscribe({
		id: target.id,
		versionsToWrite: envelopes.length,
		allVersions: options.allVersions === true,
		totalVersions: hosted.versions,
		envelopeBytes: totalBytes,
		networkFloorSats,
		networkFee,
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
	// After irreversible chain publication, redirect, local-state save, and
	// catalog transition are independent bookkeeping attempts. Each failure
	// warns without skipping the others, and the command always reports the
	// published origin. Warnings go to stderr so --json stdout stays pure.
	let redirectRecorded = false
	let redirectError: string | null = null
	if (target.record?.hostedSecret) {
		try {
			await markHostedInscribed(
				site,
				target.id,
				target.record.hostedSecret,
				genesis.origin,
			)
			redirectRecorded = true
		} catch (error) {
			redirectError = error instanceof Error ? error.message : String(error)
		}
	}

	let saveError: string | null = null
	let pendingSaved = false
	if (target.filePath && target.record) {
		const rest = { ...target.record }
		// Only drop the credential once the redirect is confirmed against
		// this same chain origin. On redirect failure the secret is retained
		// alongside hostedOrigin and the chain origin so a later rerun of
		// this same command can repair only the redirect.
		if (redirectRecorded) {
			delete rest.hostedSecret
		}
		const record: DraftRecord = {
			...rest,
			origin: genesis.origin,
			hostedOrigin: target.id,
			latestOutpoint: latest.outpoint,
			latestVersion: versionsWritten,
			updatedAt: new Date().toISOString(),
		}
		try {
			saveDraftRecord(target.filePath, record)
			pendingSaved = true
		} catch (error) {
			saveError = error instanceof Error ? error.message : String(error)
		}
	}

	if (redirectError) {
		if (pendingSaved) {
			console.warn(
				`Warning: the inscription succeeded at ${genesis.origin} but the hosted redirect could not be recorded: ${redirectError}. Do not reinscribe; the chain publication is already permanent. To repair the hosted redirect, rerun \`bunx bitplan inscribe ${target.id}\`.`,
			)
		} else if (saveError) {
			console.warn(
				`Warning: the inscription succeeded at ${genesis.origin} but the hosted redirect could not be recorded: ${redirectError}. Local state was also not saved: ${saveError}. Do not rerun the inscription command because this machine did not record the chain origin; keep the origin above and fix local state (disk/permissions) before repairing the hosted redirect.`,
			)
		} else {
			console.warn(
				`Warning: the inscription succeeded at ${genesis.origin} but the hosted redirect could not be recorded: ${redirectError}. Local state was also not saved. Do not rerun the inscription command because this machine did not record the chain origin; keep the origin above and fix local state (disk/permissions) before repairing the hosted redirect.`,
			)
		}
	} else if (!target.record?.hostedSecret) {
		console.warn(
			'Note: the hosted redirect could not be recorded (no local secret).',
		)
	} else if (saveError) {
		console.warn(
			`Warning: the inscription succeeded at ${genesis.origin} and the hosted link now redirects to it, but local state was not saved: ${saveError}. Keep the origin above and do not reinscribe; check disk and permissions.`,
		)
	}

	// Inscription ordering: publish/redirect -> safe local state ->
	// best-effort catalog transition. The catalog keeps the original hosted
	// id, flips the entry to inscribed, and records the chain origin. A
	// catalog failure must never turn a successful inscription into a failure.
	await bestEffortCatalogInscribed(wallet, {
		siteUrl: site,
		hostedId: target.id,
		chainOrigin: genesis.origin,
		fallback: {
			title: target.record?.title ?? null,
			description: target.record?.description ?? null,
			repoHost: target.record?.repoHost ?? null,
			repoOrg: target.record?.repoOrg ?? null,
			repoName: target.record?.repoName ?? null,
			version: versionsWritten,
			updatedAt: new Date().toISOString(),
		},
	})

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
		if (found) {
			return {
				id: trimmed,
				filePath: found.filePath,
				record: found.record,
			}
		}
		const byHosted = findDraftByHostedOrigin(trimmed)
		if (byHosted && isOutpoint(byHosted.record.origin)) {
			return {
				id: trimmed,
				filePath: byHosted.filePath,
				record: byHosted.record,
			}
		}
		return {
			id: trimmed,
			filePath: undefined,
			record: undefined,
		}
	}

	if (/^https?:\/\//i.test(trimmed)) {
		const origin = originFromReference(trimmed)
		if (!isHostedId(origin)) {
			throw new CliError(`That URL is not a hosted draft: ${reference}`)
		}
		const found = findDraftByOrigin(origin)
		if (found) {
			return {
				id: origin,
				filePath: found.filePath,
				record: found.record,
			}
		}
		const byHosted = findDraftByHostedOrigin(origin)
		if (byHosted && isOutpoint(byHosted.record.origin)) {
			return {
				id: origin,
				filePath: byHosted.filePath,
				record: byHosted.record,
			}
		}
		return {
			id: origin,
			filePath: undefined,
			record: undefined,
		}
	}

	const resolved = path.resolve(trimmed)
	if (fs.existsSync(resolved)) {
		const record = findDraftByFile(resolved)
		if (record && isHostedId(record.origin)) {
			return { id: record.origin, filePath: resolved, record }
		}
		if (
			record &&
			typeof record.hostedOrigin === 'string' &&
			isHostedId(record.hostedOrigin) &&
			isOutpoint(record.origin)
		) {
			return { id: record.hostedOrigin, filePath: resolved, record }
		}
		throw new CliError(`That file is not mapped to a hosted draft: ${resolved}`)
	}

	throw new CliError(
		`Not a hosted draft id, viewer URL, or local file: ${reference}`,
	)
}

interface RepairRedirectInput {
	site: string
	hostedId: string
	record: DraftRecord
	filePath?: string
	initialRemote: { versions: number; origin: string | null }
	json: boolean
}

/**
 * Idempotent hosted-redirect repair for an already-published local record.
 * Never publishes, fetches envelopes, or relays. Never overwrites a
 * conflicting remote origin and never exposes the hosted secret.
 */
async function repairHostedRedirect(input: RepairRedirectInput): Promise<void> {
	const localOrigin = input.record.origin
	const secret = input.record.hostedSecret
	if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/i.test(secret)) {
		throw new CliError(
			`Already inscribed at ${localOrigin}. Refusing to reinscribe.`,
		)
	}
	let remote = input.initialRemote

	if (remote.origin !== null && remote.origin !== localOrigin) {
		throw new CliError(
			`The hosted draft ${input.hostedId} already points at ${remote.origin}, which does not match the local chain origin ${localOrigin}. Refusing to overwrite the hosted redirect and refusing to reinscribe. The local secret was retained; rerun \`bunx bitplan inscribe ${input.hostedId}\` after resolving the conflict. No new inscription was made.`,
		)
	}

	if (remote.origin === null) {
		try {
			await markHostedInscribed(input.site, input.hostedId, secret, localOrigin)
		} catch (error) {
			let reread: { versions: number; origin: string | null }
			try {
				reread = await readHostedRecord(input.site, input.hostedId)
			} catch {
				throw new CliError(
					`Could not repair the hosted redirect for ${input.hostedId}: ${error instanceof Error ? error.message : String(error)}. The local secret was retained; rerun \`bunx bitplan inscribe ${input.hostedId}\` to retry. No new inscription was made.`,
				)
			}
			if (reread.origin === localOrigin) {
				remote = reread
			} else if (reread.origin === null) {
				throw new CliError(
					`Could not repair the hosted redirect for ${input.hostedId}: ${error instanceof Error ? error.message : String(error)}. The hosted redirect is still empty and the local secret was retained; rerun \`bunx bitplan inscribe ${input.hostedId}\` to retry. No new inscription was made.`,
				)
			} else {
				throw new CliError(
					`The hosted draft ${input.hostedId} already points at ${reread.origin}, which does not match the local chain origin ${localOrigin}. Refusing to overwrite the hosted redirect and refusing to reinscribe. The local secret was retained; rerun \`bunx bitplan inscribe ${input.hostedId}\` after resolving the conflict. No new inscription was made.`,
				)
			}
		}
	}

	if (!input.filePath) {
		throw new CliError(
			`The hosted redirect for ${input.hostedId} points at ${localOrigin} but there is no local record to clean up. No new inscription was made.`,
		)
	}

	const cleaned: DraftRecord = {
		...input.record,
		updatedAt: new Date().toISOString(),
	}
	delete cleaned.hostedSecret
	try {
		saveDraftRecord(input.filePath, cleaned)
	} catch (error) {
		throw new CliError(
			`The hosted redirect now points at ${localOrigin} but local cleanup failed: ${error instanceof Error ? error.message : String(error)}. The local secret was retained; rerun \`bunx bitplan inscribe ${input.hostedId}\` to retry. No new inscription was made.`,
		)
	}

	if (input.json) {
		console.log(
			JSON.stringify(
				{
					repaired: true,
					hostedId: input.hostedId,
					origin: localOrigin,
					outpoint: input.record.latestOutpoint,
					viewer: viewerUrl(localOrigin),
				},
				null,
				2,
			),
		)
		return
	}

	console.log(
		`Repaired the hosted redirect to ${localOrigin}. No new inscription was made.`,
	)
}

interface ConfirmInscribeInput {
	id: string
	versionsToWrite: number
	allVersions: boolean
	totalVersions: number
	envelopeBytes: number
	networkFloorSats: number | null
	networkFee: MiningFeePolicy | null
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
		`Size:     ${input.envelopeBytes.toLocaleString('en-US')} bytes of encrypted payload`,
	)
	console.log(
		input.networkFloorSats === null || input.networkFee === null
			? 'Network floor: unavailable (Arcade policy could not be fetched).'
			: `Network floor: ~${input.networkFloorSats.toLocaleString('en-US')} sats for ${input.versionsToWrite === 1 ? 'payload' : `${input.versionsToWrite} payloads`} at ${input.networkFee.satoshis} sats / ${input.networkFee.bytes} bytes`,
	)
	console.log('Excludes transaction overhead; your wallet may charge more.')
	console.log(
		'Fee:      Set by your wallet; review the amount in its approval prompt.',
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
