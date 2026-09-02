/**
 * Local state: `~/.bitplan/config.json` and `~/.bitplan/drafts.json`.
 *
 * The directory is 0700, every file 0600. Neither file ever holds key
 * material — the wallet owns all keys, and the per-draft `keyID` recorded here
 * is only a label the wallet derives against. Losing this file loses nothing
 * but convenience: origins are on chain and keyIDs are in the envelope header.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeReaderName } from './addressBook.js'
import { normalizeIdentityKey } from './envelope.js'
import { CliError } from './errors.js'
import { isOutpoint } from './outpoint.js'

export const STATE_DIR_MODE = 0o700
export const STATE_FILE_MODE = 0o600
const COMPRESSED_IDENTITY_KEY = /^(02|03)[0-9a-f]{64}$/i

export interface DraftRecord {
	/** Genesis outpoint of the origin chain, `txid_vout`. */
	origin: string
	/** BRC-2 keyID minted for this draft and reused by every version. */
	keyID: string
	/** Outpoint of the coin holding the newest version, `txid_vout`. */
	latestOutpoint: string
	/** 1 for the genesis inscription; null when adopted without local history. */
	latestVersion: number | null
	updatedAt: string
	title?: string | null
	description?: string | null
	/** Identity public keys authorized on the latest local version. */
	sharedWith?: string[]
	/** Fixed identity keys explicitly attached to this draft. */
	sharedWithRaw?: string[]
	/** Local contact/team names re-resolved before every publish. */
	shareWithRefs?: string[]
	/** Reader link secret, 64 hex. Present while the draft has a link reader. */
	linkKey?: string
}

export interface DraftsFile {
	files: Record<string, DraftRecord>
}

export interface ConfigFile {
	/** BRC-100 JSON API endpoint to talk to. */
	walletUrl?: string
	/** ORDFS gateway base URL. */
	ordfsUrl?: string
	/** Public wallet identities included on every new plan. */
	shareWith?: string[]
	/** Local contact/team names included on every new plan. */
	shareWithRefs?: string[]
	/** Local labels for public wallet identities. */
	contacts?: Record<string, string>
	/** Local groups made only from contact names. */
	teams?: Record<string, string[]>
}

export function stateDir(): string {
	return path.join(os.homedir(), '.bitplan')
}

export function configPath(): string {
	return path.join(stateDir(), 'config.json')
}

export function draftsPath(): string {
	return path.join(stateDir(), 'drafts.json')
}

export function ensureStateDir(dir: string = stateDir()): void {
	fs.mkdirSync(dir, { recursive: true, mode: STATE_DIR_MODE })
	// mkdirSync's mode is subject to the process umask, and does nothing at all
	// when the directory already exists — so set it explicitly either way.
	fs.chmodSync(dir, STATE_DIR_MODE)
}

export function readJsonFile<T>(file: string, fallback: T): T {
	let raw: string
	try {
		raw = fs.readFileSync(file, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
		throw new CliError(
			`Could not read local state at ${file}: ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	try {
		return JSON.parse(raw) as T
	} catch {
		throw new CliError(
			`Local state at ${file} is corrupt JSON. Repair it or move it aside and try again.`,
		)
	}
}

export function writeJsonFile(file: string, value: unknown): void {
	const dir = path.dirname(file)
	ensureStateDir(dir)
	const temporary = path.join(
		dir,
		`.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
	)
	let descriptor: number | undefined
	try {
		descriptor = fs.openSync(temporary, 'wx', STATE_FILE_MODE)
		fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`)
		fs.fchmodSync(descriptor, STATE_FILE_MODE)
		fs.fsyncSync(descriptor)
		fs.closeSync(descriptor)
		descriptor = undefined
		fs.renameSync(temporary, file)
		fs.chmodSync(file, STATE_FILE_MODE)
		fsyncDirectory(dir)
	} catch (error) {
		if (descriptor !== undefined) fs.closeSync(descriptor)
		try {
			fs.unlinkSync(temporary)
		} catch (cleanupError) {
			if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT')
				throw cleanupError
		}
		throw error
	}
}

export function readConfig(file: string = configPath()): ConfigFile {
	const parsed = readJsonFile<unknown>(file, {})
	if (!isObject(parsed)) throw invalidState(file, 'expected a JSON object')
	if (parsed.walletUrl !== undefined && typeof parsed.walletUrl !== 'string') {
		throw invalidState(file, 'walletUrl must be a string')
	}
	if (parsed.ordfsUrl !== undefined && typeof parsed.ordfsUrl !== 'string') {
		throw invalidState(file, 'ordfsUrl must be a string')
	}
	const shareWith = validateIdentityKeys(parsed.shareWith, file, 'shareWith')
	const contacts = validateContacts(parsed.contacts, file)
	const teams = validateTeams(parsed.teams, contacts, file)
	const shareWithRefs = validateReaderRefs(
		parsed.shareWithRefs,
		contacts,
		teams,
		file,
		'shareWithRefs',
	)
	return {
		walletUrl: parsed.walletUrl as string | undefined,
		ordfsUrl: parsed.ordfsUrl as string | undefined,
		shareWith,
		shareWithRefs,
		contacts,
		teams,
	}
}

export function writeConfig(
	config: ConfigFile,
	file: string = configPath(),
): void {
	writeJsonFile(file, config)
}

export function readDrafts(file: string = draftsPath()): DraftsFile {
	const parsed = readJsonFile<unknown>(file, { files: {} })
	if (!isObject(parsed)) throw invalidState(file, 'expected a JSON object')
	if (parsed.files === undefined) return { files: {} }
	if (!isObject(parsed.files)) {
		throw invalidState(file, 'files must be an object keyed by local file path')
	}
	const files: Record<string, DraftRecord> = {}
	for (const [filePath, value] of Object.entries(parsed.files)) {
		files[filePath] = validateDraftRecord(value, file, filePath)
	}
	return { files }
}

function fsyncDirectory(dir: string): void {
	let descriptor: number | undefined
	try {
		descriptor = fs.openSync(dir, 'r')
		fs.fsyncSync(descriptor)
	} catch (error) {
		if (!isUnsupportedDirectoryFsyncError(error)) throw error
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor)
	}
}

export function isUnsupportedDirectoryFsyncError(
	error: unknown,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (platform !== 'win32') return false
	const code = (error as NodeJS.ErrnoException | null)?.code
	return (
		code === 'EISDIR' ||
		code === 'EINVAL' ||
		code === 'ENOTSUP' ||
		code === 'EPERM'
	)
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidState(file: string, reason: string): CliError {
	return new CliError(
		`Local state at ${file} has an invalid structure: ${reason}. Repair it or move it aside and try again.`,
	)
}

function validateDraftRecord(
	value: unknown,
	file: string,
	filePath: string,
): DraftRecord {
	if (!isObject(value)) {
		throw invalidState(
			file,
			`record for ${JSON.stringify(filePath)} is not an object`,
		)
	}
	if (typeof value.origin !== 'string' || !isOutpoint(value.origin)) {
		throw invalidState(
			file,
			`record for ${JSON.stringify(filePath)} has an invalid origin`,
		)
	}
	if (
		typeof value.latestOutpoint !== 'string' ||
		!isOutpoint(value.latestOutpoint)
	) {
		throw invalidState(
			file,
			`record for ${JSON.stringify(filePath)} has an invalid latestOutpoint`,
		)
	}
	if (typeof value.keyID !== 'string' || value.keyID.length === 0) {
		throw invalidState(
			file,
			`record for ${JSON.stringify(filePath)} has no keyID`,
		)
	}
	if (
		value.latestVersion !== null &&
		(!Number.isSafeInteger(value.latestVersion) ||
			Number(value.latestVersion) < 1)
	) {
		throw invalidState(
			file,
			`record for ${JSON.stringify(filePath)} has an invalid latestVersion`,
		)
	}
	if (
		typeof value.updatedAt !== 'string' ||
		Number.isNaN(Date.parse(value.updatedAt))
	) {
		throw invalidState(
			file,
			`record for ${JSON.stringify(filePath)} has an invalid updatedAt`,
		)
	}
	for (const field of ['title', 'description'] as const) {
		if (
			value[field] !== undefined &&
			value[field] !== null &&
			typeof value[field] !== 'string'
		) {
			throw invalidState(
				file,
				`record for ${JSON.stringify(filePath)} has a non-string ${field}`,
			)
		}
	}
	for (const field of ['sharedWith', 'sharedWithRaw'] as const) {
		try {
			validateIdentityKeys(
				value[field],
				file,
				`record for ${JSON.stringify(filePath)} ${field}`,
			)
		} catch {
			throw invalidState(
				file,
				`record for ${JSON.stringify(filePath)} has invalid ${field} identity keys`,
			)
		}
	}
	if (value.shareWithRefs !== undefined) {
		if (!Array.isArray(value.shareWithRefs)) {
			throw invalidState(
				file,
				`record for ${JSON.stringify(filePath)} has invalid shareWithRefs`,
			)
		}
		for (const ref of value.shareWithRefs) {
			if (typeof ref !== 'string' || normalizeStoredName(ref) === null) {
				throw invalidState(
					file,
					`record for ${JSON.stringify(filePath)} has invalid shareWithRefs`,
				)
			}
		}
	}
	if (
		typeof value.linkKey === 'string' &&
		/^[0-9a-f]{64}$/i.test(value.linkKey)
	) {
		value.linkKey = value.linkKey.toLowerCase()
	} else {
		delete value.linkKey
	}
	return value as unknown as DraftRecord
}

function validateIdentityKeys(
	value: unknown,
	file: string,
	field: string,
): string[] | undefined {
	if (value === undefined) return undefined
	if (!Array.isArray(value)) {
		throw invalidState(file, `${field} must contain identity public keys`)
	}
	const keys: string[] = []
	for (const identityKey of value) {
		if (
			typeof identityKey !== 'string' ||
			!COMPRESSED_IDENTITY_KEY.test(identityKey)
		) {
			throw invalidState(file, `${field} must contain identity public keys`)
		}
		try {
			keys.push(normalizeIdentityKey(identityKey))
		} catch {
			throw invalidState(file, `${field} must contain identity public keys`)
		}
	}
	return [...new Set(keys)]
}

function validateContacts(
	value: unknown,
	file: string,
): Record<string, string> | undefined {
	if (value === undefined) return undefined
	if (!isObject(value)) throw invalidState(file, 'contacts must be an object')
	const contacts: Record<string, string> = {}
	for (const [name, identityKey] of Object.entries(value)) {
		if (normalizeStoredName(name) === null || typeof identityKey !== 'string') {
			throw invalidState(
				file,
				'contacts contains an invalid name or identity key',
			)
		}
		try {
			contacts[name] = normalizeIdentityKey(identityKey)
		} catch {
			throw invalidState(
				file,
				`contact ${JSON.stringify(name)} has an invalid identity key`,
			)
		}
	}
	return contacts
}

function validateTeams(
	value: unknown,
	contacts: Record<string, string> | undefined,
	file: string,
): Record<string, string[]> | undefined {
	if (value === undefined) return undefined
	if (!isObject(value)) throw invalidState(file, 'teams must be an object')
	const teams: Record<string, string[]> = {}
	for (const [name, members] of Object.entries(value)) {
		if (normalizeStoredName(name) === null || contacts?.[name]) {
			throw invalidState(
				file,
				`team ${JSON.stringify(name)} has an invalid or conflicting name`,
			)
		}
		if (!Array.isArray(members)) {
			throw invalidState(
				file,
				`team ${JSON.stringify(name)} must contain contact names`,
			)
		}
		const normalized: string[] = []
		for (const member of members) {
			if (
				typeof member !== 'string' ||
				normalizeStoredName(member) === null ||
				!contacts?.[member]
			) {
				throw invalidState(
					file,
					`team ${JSON.stringify(name)} contains an unknown contact`,
				)
			}
			normalized.push(member)
		}
		teams[name] = [...new Set(normalized)]
	}
	return teams
}

function validateReaderRefs(
	value: unknown,
	contacts: Record<string, string> | undefined,
	teams: Record<string, string[]> | undefined,
	file: string,
	field: string,
): string[] | undefined {
	if (value === undefined) return undefined
	if (!Array.isArray(value))
		throw invalidState(file, `${field} must be an array`)
	const refs: string[] = []
	for (const ref of value) {
		if (
			typeof ref !== 'string' ||
			normalizeStoredName(ref) === null ||
			(!contacts?.[ref] && !teams?.[ref])
		) {
			throw invalidState(file, `${field} contains an unknown contact or team`)
		}
		refs.push(ref)
	}
	return [...new Set(refs)]
}

function normalizeStoredName(value: string): string | null {
	try {
		return normalizeReaderName(value) === value ? value : null
	} catch {
		return null
	}
}

export function writeDrafts(
	drafts: DraftsFile,
	file: string = draftsPath(),
): void {
	writeJsonFile(file, drafts)
}

/** Record (or update) the draft bound to a local file path. */
export function saveDraftRecord(
	filePath: string,
	record: DraftRecord,
	file: string = draftsPath(),
): DraftsFile {
	const drafts = readDrafts(file)
	drafts.files[filePath] = record
	writeDrafts(drafts, file)
	return drafts
}

/** Look up the draft bound to a local file path. */
export function findDraftByFile(
	filePath: string,
	file: string = draftsPath(),
): DraftRecord | undefined {
	return readDrafts(file).files[filePath]
}

/** Look up any local record for an origin, whichever file produced it. */
export function findDraftByOrigin(
	origin: string,
	file: string = draftsPath(),
): { filePath: string; record: DraftRecord } | undefined {
	for (const [filePath, record] of Object.entries(readDrafts(file).files)) {
		if (record.origin === origin) return { filePath, record }
	}
	return undefined
}
