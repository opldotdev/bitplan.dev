/**
 * Local state: `~/.bitplan/config.json` and `~/.bitplan/drafts.json`.
 *
 * The directory is 0700, every file 0600. Neither file ever holds key
 * material — the wallet owns all keys, and the per-draft `keyID` recorded here
 * is only a label the wallet derives against. Losing this file loses nothing
 * but convenience: origins are on chain and keyIDs are in the envelope header.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const STATE_DIR_MODE = 0o700
export const STATE_FILE_MODE = 0o600

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
}

export interface DraftsFile {
	files: Record<string, DraftRecord>
}

export interface ConfigFile {
	/** BRC-100 JSON API endpoint to talk to. */
	walletUrl?: string
	/** ORDFS gateway base URL. */
	ordfsUrl?: string
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
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8')) as T
	} catch {
		return fallback
	}
}

export function writeJsonFile(file: string, value: unknown): void {
	ensureStateDir(path.dirname(file))
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
		mode: STATE_FILE_MODE,
	})
	// writeFileSync only applies `mode` when it creates the file; chmod covers
	// the rewrite case so a pre-existing world-readable file gets tightened.
	fs.chmodSync(file, STATE_FILE_MODE)
}

export function readConfig(file: string = configPath()): ConfigFile {
	return readJsonFile<ConfigFile>(file, {})
}

export function readDrafts(file: string = draftsPath()): DraftsFile {
	const parsed = readJsonFile<Partial<DraftsFile>>(file, {})
	return { files: parsed.files ?? {} }
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
