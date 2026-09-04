/**
 * Hosted catalog discovery.
 *
 * A wallet can discover the hosted plans it published on another device
 * without an account or database: the CLI derives a catalog locator and a
 * write bearer through the connected BRC-100 wallet, then syncs a single
 * encrypted catalog blob. The capability, bearer, and plaintext live only in
 * memory — they are never logged or written to local state, and the catalog
 * never contains hosted plan update secrets.
 *
 * Frozen cryptographic contract (see SPEC-BITPLAN-CATALOG-DISCOVERY.md):
 * - protocolID `[2, "bitplan catalog"]`, counterparty `"self"`
 * - HMAC keyID `"catalog-capability-v1"` over UTF-8
 *   `"bitplan catalog capability v1"`
 * - `HMAC-SHA256(capability, "bitplan catalog locator v1")` is the catalog id
 * - `HMAC-SHA256(capability, "bitplan catalog write v1")` is the write bearer
 * - content encryption keyID `"catalog-content-v1"`, counterparty `"self"`
 */

import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'
import type { SecurityLevel, WalletInterface, WalletProtocol } from '@bsv/sdk'
import { CATALOG_CONTENT_TYPE } from './constants.js'
import { CliError } from './errors.js'
import { assertHttpsSiteUrl, isHostedId } from './hosted.js'
import { isOutpoint } from './outpoint.js'
import type { DraftRecord, DraftsFile } from './state.js'

/** Frozen BRC-100 protocol for catalog capability, content, and locator. */
export const CATALOG_PROTOCOL: WalletProtocol = [
	2 as SecurityLevel,
	'bitplan catalog',
]

/** Frozen HMAC keyID the wallet derives the catalog capability with. */
export const CATALOG_HMAC_KEY_ID = 'catalog-capability-v1'

/** Frozen encryption keyID the wallet encrypts catalog plaintext with. */
export const CATALOG_CONTENT_KEY_ID = 'catalog-content-v1'

/** Frozen HMAC input bytes (UTF-8): the catalog capability request. */
export const CATALOG_CAPABILITY_INPUT = 'bitplan catalog capability v1'

/** Frozen locator label bytes (UTF-8). */
export const CATALOG_LOCATOR_LABEL = 'bitplan catalog locator v1'

/** Frozen write-bearer label bytes (UTF-8). */
export const CATALOG_WRITE_LABEL = 'bitplan catalog write v1'

const CATALOG_ID_PATTERN = /^c_[A-Za-z0-9_-]{43}$/

/** `c_` plus the full 32-byte unpadded base64url locator. */
export function isCatalogId(value: string): boolean {
	return CATALOG_ID_PATTERN.test(value)
}

export const CATALOG_SCHEMA_VERSION = 1
export const CATALOG_MAX_ENTRIES = 1000
export const CATALOG_MAX_PLAINTEXT_BYTES = 512 * 1024
export const CATALOG_MAX_TITLE_CHARS = 512
export const CATALOG_MAX_DESCRIPTION_CHARS = 1000
export const CATALOG_MAX_REPO_HOST_CHARS = 253
export const CATALOG_MAX_REPO_ORG_CHARS = 255
export const CATALOG_MAX_REPO_NAME_CHARS = 255

/** Recovery command printed whenever a best-effort catalog write fails. */
export const CATALOG_SYNC_RECOVERY = 'bunx bitplan catalog sync'

export type CatalogEntryState = 'hosted' | 'inscribed'

export interface CatalogEntry {
	id: string
	state: CatalogEntryState
	chainOrigin: string | null
	title: string | null
	description: string | null
	repoHost: string | null
	repoOrg: string | null
	repoName: string | null
	version: number
	updatedAt: string
}

export interface Catalog {
	schema: 1
	entries: CatalogEntry[]
}

export type CatalogWallet = Pick<
	WalletInterface,
	'createHmac' | 'encrypt' | 'decrypt'
>

export interface CatalogLocator {
	/** `c_` plus 43 unpadded-base64url characters. */
	id: string
	/** 43 unpadded-base64url characters. Memory-only. */
	bearer: string
}

const TOP_LEVEL_KEYS = new Set(['schema', 'entries'])
const ENTRY_KEYS = new Set([
	'id',
	'state',
	'chainOrigin',
	'title',
	'description',
	'repoHost',
	'repoOrg',
	'repoName',
	'version',
	'updatedAt',
])

function hmacSha256(key: Uint8Array, label: string): Buffer {
	return createHmac('sha256', Buffer.from(key)).update(label, 'utf8').digest()
}

/**
 * Pure second half of the frozen derivation: 32-byte wallet HMAC output in,
 * catalog id and write bearer out. Kept separate so the fixed public test
 * vector exercises the byte math without a wallet.
 */
export function deriveCatalogParts(rootCapability: Uint8Array): CatalogLocator {
	if (rootCapability.length !== 32) {
		throw new CliError(
			'The wallet returned an invalid catalog capability: expected 32 bytes.',
		)
	}
	const idBytes = hmacSha256(rootCapability, CATALOG_LOCATOR_LABEL)
	const writeBytes = hmacSha256(rootCapability, CATALOG_WRITE_LABEL)
	return {
		id: `c_${idBytes.toString('base64url')}`,
		bearer: writeBytes.toString('base64url'),
	}
}

/**
 * Derive the catalog locator and write bearer through the wallet using only
 * the frozen inputs. The originator the transport authenticates with must not
 * affect the derived bytes.
 */
export async function deriveCatalogLocator(
	wallet: CatalogWallet,
): Promise<CatalogLocator> {
	let hmac: number[]
	try {
		const result = await wallet.createHmac({
			protocolID: CATALOG_PROTOCOL,
			keyID: CATALOG_HMAC_KEY_ID,
			counterparty: 'self',
			data: Array.from(Buffer.from(CATALOG_CAPABILITY_INPUT, 'utf8')),
		})
		hmac = result.hmac
	} catch (error) {
		throw new CliError(
			`The wallet refused catalog derivation: ${errorMessage(error)}`,
		)
	}
	const capability = Uint8Array.from(hmac)
	if (capability.length !== 32) {
		throw new CliError(
			'The wallet returned an invalid catalog capability: expected 32 bytes.',
		)
	}
	const locator = deriveCatalogParts(capability)
	if (!isCatalogId(locator.id)) {
		throw new CliError('Derived an invalid catalog id.')
	}
	return locator
}

/** Strict catalog validation: exact schema, bounded fields, no unknown keys. */
export function parseCatalogJson(text: string): Catalog {
	if (Buffer.byteLength(text, 'utf8') > CATALOG_MAX_PLAINTEXT_BYTES) {
		throw new CliError(
			`Invalid catalog: plaintext exceeds ${CATALOG_MAX_PLAINTEXT_BYTES} bytes.`,
		)
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		throw new CliError('Invalid catalog: plaintext is not valid JSON.')
	}
	return assertCatalog(parsed)
}

export function assertCatalog(value: unknown): Catalog {
	if (!isRecord(value))
		throw new CliError('Invalid catalog: expected an object.')
	for (const key of Object.keys(value)) {
		if (!TOP_LEVEL_KEYS.has(key)) {
			throw new CliError(`Invalid catalog: unknown key ${JSON.stringify(key)}.`)
		}
	}
	if (value.schema !== CATALOG_SCHEMA_VERSION) {
		throw new CliError('Invalid catalog: schema must be 1.')
	}
	if (!Array.isArray(value.entries)) {
		throw new CliError('Invalid catalog: entries must be an array.')
	}
	if (value.entries.length > CATALOG_MAX_ENTRIES) {
		throw new CliError(
			`Invalid catalog: at most ${CATALOG_MAX_ENTRIES} entries allowed.`,
		)
	}
	const entries = value.entries.map((entry, index) =>
		assertCatalogEntry(entry, index),
	)
	const seen = new Set<string>()
	for (const entry of entries) {
		if (seen.has(entry.id)) {
			throw new CliError(
				`Invalid catalog: duplicate hosted id ${JSON.stringify(entry.id)}.`,
			)
		}
		seen.add(entry.id)
	}
	return { schema: 1, entries }
}

function assertCatalogEntry(value: unknown, index: number): CatalogEntry {
	const where = `Invalid catalog entry ${index}`
	if (!isRecord(value)) throw new CliError(`${where}: expected an object.`)
	for (const key of Object.keys(value)) {
		if (!ENTRY_KEYS.has(key)) {
			throw new CliError(`${where}: unknown key ${JSON.stringify(key)}.`)
		}
	}
	for (const key of ENTRY_KEYS) {
		if (!(key in value)) {
			throw new CliError(`${where}: missing key ${JSON.stringify(key)}.`)
		}
	}
	const id = value.id
	if (typeof id !== 'string' || !isHostedId(id)) {
		throw new CliError(`${where}: id must be a hosted draft id.`)
	}
	const state = value.state
	if (state !== 'hosted' && state !== 'inscribed') {
		throw new CliError(`${where}: state must be "hosted" or "inscribed".`)
	}
	const chainOrigin = value.chainOrigin
	if (state === 'hosted') {
		if (chainOrigin !== null) {
			throw new CliError(`${where}: a hosted entry must have null chainOrigin.`)
		}
	} else if (typeof chainOrigin !== 'string' || !isOutpoint(chainOrigin)) {
		throw new CliError(
			`${where}: an inscribed entry must carry a txid_vout chainOrigin.`,
		)
	}
	return {
		id,
		state,
		chainOrigin: chainOrigin as string | null,
		title: assertBoundedString(
			value.title,
			'title',
			CATALOG_MAX_TITLE_CHARS,
			where,
		),
		description: assertBoundedString(
			value.description,
			'description',
			CATALOG_MAX_DESCRIPTION_CHARS,
			where,
		),
		repoHost: assertBoundedString(
			value.repoHost,
			'repoHost',
			CATALOG_MAX_REPO_HOST_CHARS,
			where,
		),
		repoOrg: assertBoundedString(
			value.repoOrg,
			'repoOrg',
			CATALOG_MAX_REPO_ORG_CHARS,
			where,
		),
		repoName: assertBoundedString(
			value.repoName,
			'repoName',
			CATALOG_MAX_REPO_NAME_CHARS,
			where,
		),
		version: assertEntryVersion(value.version, where),
		updatedAt: assertTimestamp(value.updatedAt, where),
	}
}

function assertBoundedString(
	value: unknown,
	field: string,
	maxChars: number,
	where: string,
): string | null {
	if (value === null) return null
	if (typeof value !== 'string') {
		throw new CliError(`${where}: ${field} must be a string or null.`)
	}
	if ([...value].length > maxChars) {
		throw new CliError(
			`${where}: ${field} must be at most ${maxChars} characters.`,
		)
	}
	return value
}

/**
 * Truncate a catalog projection to its schema bound by Unicode code points.
 * Stored plan metadata is never mutated; only the catalog copy is bounded so
 * pre-existing overlong local fields cannot poison a strict sync.
 */
export function truncateCatalogString(
	value: string | null | undefined,
	maxChars: number,
): string | null {
	if (value === null || value === undefined) return null
	const points = [...value]
	if (points.length <= maxChars) return value
	return points.slice(0, maxChars).join('')
}

function assertEntryVersion(value: unknown, where: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new CliError(`${where}: version must be an integer >= 1.`)
	}
	return value
}

function assertTimestamp(value: unknown, where: string): string {
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw new CliError(`${where}: updatedAt must be a valid ISO timestamp.`)
	}
	return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deterministic serialization: entries sorted by hosted id so equivalent
 * catalogs encrypt to comparable bytes. Validates before serializing.
 */
export function serializeCatalog(catalog: Catalog): string {
	const validated = assertCatalog({
		schema: catalog.schema,
		entries: catalog.entries,
	})
	const sorted = [...validated.entries].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	)
	const text = JSON.stringify({ schema: 1 as const, entries: sorted })
	if (Buffer.byteLength(text, 'utf8') > CATALOG_MAX_PLAINTEXT_BYTES) {
		throw new CliError(
			`Invalid catalog: plaintext exceeds ${CATALOG_MAX_PLAINTEXT_BYTES} bytes.`,
		)
	}
	return text
}

/** Encrypt strict catalog JSON through the wallet with the frozen content key. */
export async function encryptCatalog(
	wallet: CatalogWallet,
	catalog: Catalog,
): Promise<Uint8Array> {
	const text = serializeCatalog(catalog)
	let ciphertext: number[]
	try {
		const result = await wallet.encrypt({
			protocolID: CATALOG_PROTOCOL,
			keyID: CATALOG_CONTENT_KEY_ID,
			counterparty: 'self',
			plaintext: Array.from(Buffer.from(text, 'utf8')),
		})
		ciphertext = result.ciphertext
	} catch (error) {
		throw new CliError(
			`The wallet refused to encrypt the catalog: ${errorMessage(error)}`,
		)
	}
	return Uint8Array.from(ciphertext)
}

/** Decrypt catalog bytes through the wallet and strictly validate the result. */
export async function decryptCatalog(
	wallet: CatalogWallet,
	ciphertext: Uint8Array,
): Promise<Catalog> {
	let plaintext: number[]
	try {
		const result = await wallet.decrypt({
			protocolID: CATALOG_PROTOCOL,
			keyID: CATALOG_CONTENT_KEY_ID,
			counterparty: 'self',
			ciphertext: Array.from(ciphertext),
		})
		plaintext = result.plaintext
	} catch (error) {
		throw new CliError(
			`The wallet refused to decrypt the catalog: ${errorMessage(error)}`,
		)
	}
	return parseCatalogJson(Buffer.from(plaintext).toString('utf8'))
}

/** One locally known hosted draft as a catalog entry. Never includes secrets. */
export function localEntryForRecord(record: DraftRecord): CatalogEntry | null {
	if (isHostedId(record.origin)) {
		return {
			id: record.origin,
			state: 'hosted',
			chainOrigin: null,
			title: truncateCatalogString(
				record.title ?? null,
				CATALOG_MAX_TITLE_CHARS,
			),
			description: truncateCatalogString(
				record.description ?? null,
				CATALOG_MAX_DESCRIPTION_CHARS,
			),
			repoHost: truncateCatalogString(
				record.repoHost ?? null,
				CATALOG_MAX_REPO_HOST_CHARS,
			),
			repoOrg: truncateCatalogString(
				record.repoOrg ?? null,
				CATALOG_MAX_REPO_ORG_CHARS,
			),
			repoName: truncateCatalogString(
				record.repoName ?? null,
				CATALOG_MAX_REPO_NAME_CHARS,
			),
			version: record.latestVersion ?? 1,
			updatedAt: record.updatedAt,
		}
	}
	// An inscribed chain record keeps its hosted provenance so an ordinary
	// sync can repair a failed best-effort transition.
	if (
		typeof record.hostedOrigin === 'string' &&
		isHostedId(record.hostedOrigin) &&
		isOutpoint(record.origin)
	) {
		return {
			id: record.hostedOrigin,
			state: 'inscribed',
			chainOrigin: record.origin,
			title: truncateCatalogString(
				record.title ?? null,
				CATALOG_MAX_TITLE_CHARS,
			),
			description: truncateCatalogString(
				record.description ?? null,
				CATALOG_MAX_DESCRIPTION_CHARS,
			),
			repoHost: truncateCatalogString(
				record.repoHost ?? null,
				CATALOG_MAX_REPO_HOST_CHARS,
			),
			repoOrg: truncateCatalogString(
				record.repoOrg ?? null,
				CATALOG_MAX_REPO_ORG_CHARS,
			),
			repoName: truncateCatalogString(
				record.repoName ?? null,
				CATALOG_MAX_REPO_NAME_CHARS,
			),
			version: record.latestVersion ?? 1,
			updatedAt: record.updatedAt,
		}
	}
	return null
}

/**
 * Every locally known hosted record as catalog entries. When several local
 * files map to the same hosted id, the newest record wins.
 */
export function buildLocalEntries(drafts: DraftsFile): CatalogEntry[] {
	const byId = new Map<string, CatalogEntry>()
	for (const record of Object.values(drafts.files)) {
		const entry = localEntryForRecord(record)
		if (!entry) continue
		const current = byId.get(entry.id)
		if (
			!current ||
			entry.updatedAt > current.updatedAt ||
			(entry.updatedAt === current.updatedAt && entry.version > current.version)
		) {
			byId.set(entry.id, entry)
		}
	}
	return [...byId.values()].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	)
}

/**
 * Merge remote entries with locally known hosted records. Local entries
 * replace matching hosted ids; remote-only entries remain. No deletion.
 */
export function mergeCatalogEntries(
	remote: CatalogEntry[],
	local: CatalogEntry[],
): CatalogEntry[] {
	const merged = new Map<string, CatalogEntry>()
	for (const entry of remote) merged.set(entry.id, entry)
	for (const entry of local) merged.set(entry.id, entry)
	return [...merged.values()].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	)
}

export class CatalogConflictError extends CliError {}

type FetchImpl = typeof fetch

interface FetchedRemote {
	found: boolean
	catalog: Catalog
	/** Exact base version for the next PUT, 0 after a confirmed 404. */
	baseVersion: number
}

function catalogApiUrl(siteUrl: string, id: string): string {
	return `${siteUrl.replace(/\/+$/, '')}/api/catalog/${id}`
}

/**
 * Never send the catalog bearer over cleartext remote HTTP. The narrow seam
 * is the hosted site-URL validator: HTTPS always, HTTP only for loopback.
 */
function assertCatalogSiteUrl(siteUrl: string): void {
	let url: URL
	try {
		url = new URL(siteUrl)
	} catch {
		throw new CliError(
			`Invalid catalog site URL: ${JSON.stringify(siteUrl)}. Expected an https origin.`,
		)
	}
	assertHttpsSiteUrl(url)
}

/**
 * GET the remote catalog. Only a confirmed 404 means an empty remote catalog;
 * every other failure aborts so the caller never uploads an empty catalog
 * over a real one.
 */
async function getRemoteCatalog(
	fetchImpl: FetchImpl,
	siteUrl: string,
	id: string,
	wallet: CatalogWallet,
): Promise<FetchedRemote> {
	const url = catalogApiUrl(siteUrl, id)
	let response: Response
	try {
		response = await fetchImpl(url, { method: 'GET' })
	} catch (error) {
		throw new CliError(
			`Could not reach the catalog API at ${url}: ${errorMessage(error)}`,
		)
	}
	if (response.status === 404)
		return { found: false, catalog: { schema: 1, entries: [] }, baseVersion: 0 }
	if (!response.ok) {
		throw new CliError(
			`Catalog API returned ${response.status}${response.statusText ? ` ${response.statusText}` : ''} for ${id}. Local data is unchanged.`,
		)
	}
	const versionHeader = response.headers.get('X-BitPlan-Catalog-Version')
	const version = versionHeader === null ? Number.NaN : Number(versionHeader)
	if (!Number.isSafeInteger(version) || version < 1) {
		throw new CliError(
			'Catalog API returned an invalid catalog version. Local data is unchanged.',
		)
	}
	const bytes = new Uint8Array(await response.arrayBuffer())
	let catalog: Catalog
	try {
		catalog = await decryptCatalog(wallet, bytes)
	} catch (error) {
		if (error instanceof CliError) throw error
		throw new CliError(
			`Could not decrypt the catalog: ${errorMessage(error)} Local data is unchanged.`,
		)
	}
	return { found: true, catalog, baseVersion: version }
}

interface PutResult {
	version: number
	created: boolean
}

async function putRemoteCatalog(
	fetchImpl: FetchImpl,
	siteUrl: string,
	id: string,
	bearer: string,
	baseVersion: number,
	body: Uint8Array,
): Promise<PutResult> {
	const url = catalogApiUrl(siteUrl, id)
	let response: Response
	try {
		response = await fetchImpl(url, {
			method: 'PUT',
			headers: {
				'content-type': CATALOG_CONTENT_TYPE,
				authorization: `Bearer ${bearer}`,
				'X-BitPlan-Base-Version': String(baseVersion),
			},
			body: Buffer.from(body),
		})
	} catch (error) {
		throw new CliError(
			`Could not reach the catalog API at ${url}: ${errorMessage(error)}`,
		)
	}
	if (response.status === 409) {
		throw new CatalogConflictError(
			'The catalog changed on the server while syncing (version conflict).',
		)
	}
	if (!response.ok) {
		throw new CliError(
			`Catalog API returned ${response.status}${response.statusText ? ` ${response.statusText}` : ''} for ${id}. Local data is unchanged.`,
		)
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(await response.text())
	} catch {
		throw new CliError('Catalog API returned a response that was not JSON.')
	}
	if (!isRecord(parsed)) {
		throw new CliError('Catalog API returned an invalid sync response.')
	}
	const version = parsed.version
	if (
		typeof version !== 'number' ||
		!Number.isSafeInteger(version) ||
		version < 1
	) {
		throw new CliError('Catalog API returned an invalid catalog version.')
	}
	const created =
		typeof parsed.created === 'boolean'
			? parsed.created
			: response.status === 201
	return { version, created }
}

export interface SyncCatalogOptions {
	siteUrl: string
	fetchFn?: FetchImpl
	localEntries?: CatalogEntry[]
}

export interface SyncCatalogResult {
	id: string
	version: number
	created: boolean
	entries: number
}

/**
 * Full sync: derive, GET (404 means empty; anything else aborts), merge local
 * hosted records over remote entries, PUT with the exact base version, and on
 * one 409 refetch/remerge/retry once. A second conflict preserves local data
 * and reports that sync is still needed.
 */
export async function syncCatalog(
	wallet: CatalogWallet,
	options: SyncCatalogOptions,
): Promise<SyncCatalogResult> {
	assertCatalogSiteUrl(options.siteUrl)
	const locator = await deriveCatalogLocator(wallet)
	const fetchImpl = options.fetchFn ?? fetch
	// Local drafts load lazily so importing this module never requires the
	// state store (unit and orchestration tests stub it out).
	const local =
		options.localEntries ??
		buildLocalEntries((await import('./state.js')).readDrafts())

	const remote = await getRemoteCatalog(
		fetchImpl,
		options.siteUrl,
		locator.id,
		wallet,
	)
	const merged = mergeCatalogEntries(remote.catalog.entries, local)
	const body = await encryptCatalog(wallet, { schema: 1, entries: merged })
	try {
		const saved = await putRemoteCatalog(
			fetchImpl,
			options.siteUrl,
			locator.id,
			locator.bearer,
			remote.baseVersion,
			body,
		)
		return {
			id: locator.id,
			version: saved.version,
			created: saved.created,
			entries: merged.length,
		}
	} catch (error) {
		if (!(error instanceof CatalogConflictError)) throw error
	}

	const refetched = await getRemoteCatalog(
		fetchImpl,
		options.siteUrl,
		locator.id,
		wallet,
	)
	const remerged = mergeCatalogEntries(refetched.catalog.entries, local)
	const retryBody = await encryptCatalog(wallet, {
		schema: 1,
		entries: remerged,
	})
	try {
		const saved = await putRemoteCatalog(
			fetchImpl,
			options.siteUrl,
			locator.id,
			locator.bearer,
			refetched.baseVersion,
			retryBody,
		)
		return {
			id: locator.id,
			version: saved.version,
			created: saved.created,
			entries: remerged.length,
		}
	} catch (error) {
		if (error instanceof CatalogConflictError) {
			throw new CliError(
				'The catalog changed again while syncing; local data is unchanged. Run `bunx bitplan catalog sync` again.',
			)
		}
		throw error
	}
}

export interface MarkCatalogInscribedOptions {
	siteUrl: string
	hostedId: string
	chainOrigin: string
	/** Fallback entry fields when the remote catalog has no entry yet. */
	fallback?: Omit<CatalogEntry, 'id' | 'state' | 'chainOrigin'>
	fetchFn?: FetchImpl
}

/**
 * Catalog transition after an inscription: keep the original hosted id,
 * switch the entry to inscribed, and record the chain origin. Shares the
 * one-refetch/retry conflict policy with sync.
 */
export async function markCatalogInscribed(
	wallet: CatalogWallet,
	options: MarkCatalogInscribedOptions,
): Promise<SyncCatalogResult> {
	if (!isHostedId(options.hostedId)) {
		throw new CliError(`Not a hosted draft id: ${options.hostedId}.`)
	}
	if (!isOutpoint(options.chainOrigin)) {
		throw new CliError(
			`Cannot record the inscription: ${JSON.stringify(options.chainOrigin)} is not a txid_vout origin.`,
		)
	}
	assertCatalogSiteUrl(options.siteUrl)
	const locator = await deriveCatalogLocator(wallet)
	const fetchImpl = options.fetchFn ?? fetch

	const applyTransition = (entries: CatalogEntry[]): CatalogEntry[] => {
		const existing = entries.find((entry) => entry.id === options.hostedId)
		const updated: CatalogEntry = existing
			? {
					...existing,
					state: 'inscribed',
					chainOrigin: options.chainOrigin,
					updatedAt: new Date().toISOString(),
				}
			: {
					id: options.hostedId,
					state: 'inscribed',
					chainOrigin: options.chainOrigin,
					title: truncateCatalogString(
						options.fallback?.title ?? null,
						CATALOG_MAX_TITLE_CHARS,
					),
					description: truncateCatalogString(
						options.fallback?.description ?? null,
						CATALOG_MAX_DESCRIPTION_CHARS,
					),
					repoHost: truncateCatalogString(
						options.fallback?.repoHost ?? null,
						CATALOG_MAX_REPO_HOST_CHARS,
					),
					repoOrg: truncateCatalogString(
						options.fallback?.repoOrg ?? null,
						CATALOG_MAX_REPO_ORG_CHARS,
					),
					repoName: truncateCatalogString(
						options.fallback?.repoName ?? null,
						CATALOG_MAX_REPO_NAME_CHARS,
					),
					version: options.fallback?.version ?? 1,
					updatedAt: new Date().toISOString(),
				}
		return mergeCatalogEntries(entries, [updated])
	}

	const remote = await getRemoteCatalog(
		fetchImpl,
		options.siteUrl,
		locator.id,
		wallet,
	)
	const merged = applyTransition(remote.catalog.entries)
	const body = await encryptCatalog(wallet, { schema: 1, entries: merged })
	try {
		const saved = await putRemoteCatalog(
			fetchImpl,
			options.siteUrl,
			locator.id,
			locator.bearer,
			remote.baseVersion,
			body,
		)
		return {
			id: locator.id,
			version: saved.version,
			created: saved.created,
			entries: merged.length,
		}
	} catch (error) {
		if (!(error instanceof CatalogConflictError)) throw error
	}

	const refetched = await getRemoteCatalog(
		fetchImpl,
		options.siteUrl,
		locator.id,
		wallet,
	)
	const remerged = applyTransition(refetched.catalog.entries)
	const retryBody = await encryptCatalog(wallet, {
		schema: 1,
		entries: remerged,
	})
	try {
		const saved = await putRemoteCatalog(
			fetchImpl,
			options.siteUrl,
			locator.id,
			locator.bearer,
			refetched.baseVersion,
			retryBody,
		)
		return {
			id: locator.id,
			version: saved.version,
			created: saved.created,
			entries: remerged.length,
		}
	} catch (error) {
		if (error instanceof CatalogConflictError) {
			throw new CliError(
				'The catalog changed again while recording the inscription; local data is unchanged. Run `bunx bitplan catalog sync` again.',
			)
		}
		throw error
	}
}

function catalogFailureWarning(action: string, error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error)
	return `Warning: ${action} failed (${detail}). Run \`${CATALOG_SYNC_RECOVERY}\` to retry.`
}

/** Best-effort sync after a hosted upload: never fails the upload. */
export async function bestEffortCatalogSync(
	wallet: CatalogWallet,
	siteUrl: string,
): Promise<void> {
	try {
		await syncCatalog(wallet, { siteUrl })
	} catch (error) {
		console.warn(catalogFailureWarning('catalog sync', error))
	}
}

/** Best-effort transition after an inscription: never fails the inscription. */
export async function bestEffortCatalogInscribed(
	wallet: CatalogWallet,
	options: Omit<MarkCatalogInscribedOptions, 'fetchFn'>,
): Promise<void> {
	try {
		await markCatalogInscribed(wallet, options)
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error)
		console.warn(
			`Warning: catalog transition failed (${detail}). The inscription is already published at ${options.chainOrigin}; do not reinscribe. Run \`${CATALOG_SYNC_RECOVERY}\` to retry.`,
		)
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error)
}
