import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	type DraftRecord,
	ensureStateDir,
	findDraftByFile,
	findDraftByOrigin,
	isUnsupportedDirectoryFsyncError,
	readConfig,
	readDrafts,
	STATE_DIR_MODE,
	STATE_FILE_MODE,
	saveDraftRecord,
	writeConfig,
	writeDrafts,
	writeJsonFile,
} from '../src/state.js'

let dir: string
let draftsFile: string

const RECORD: DraftRecord = {
	origin: `${'a'.repeat(64)}_0`,
	keyID: 'a2f0b6b1-0000-4000-8000-000000000000',
	latestOutpoint: `${'b'.repeat(64)}_0`,
	latestVersion: 2,
	updatedAt: '2026-01-01T00:00:00.000Z',
	title: 'Migration plan',
	description: null,
}

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-state-'))
	draftsFile = path.join(dir, 'drafts.json')
})

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true })
})

function modeOf(file: string): number {
	return fs.statSync(file).mode & 0o777
}

describe('state store', () => {
	test('only ignores known unsupported directory fsync errors on Windows', () => {
		for (const code of ['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM']) {
			expect(
				isUnsupportedDirectoryFsyncError(
					Object.assign(new Error(code), { code }),
					'win32',
				),
			).toBe(true)
		}
		expect(
			isUnsupportedDirectoryFsyncError(
				Object.assign(new Error('disk failure'), { code: 'EIO' }),
				'win32',
			),
		).toBe(false)
		expect(
			isUnsupportedDirectoryFsyncError(
				Object.assign(new Error('not supported'), { code: 'ENOTSUP' }),
				'linux',
			),
		).toBe(false)
	})

	test('writes drafts.json 0600 inside a 0700 directory', () => {
		const nested = path.join(dir, 'nested')
		const file = path.join(nested, 'drafts.json')
		writeJsonFile(file, { files: {} })

		expect(modeOf(file)).toBe(STATE_FILE_MODE)
		expect(modeOf(nested)).toBe(STATE_DIR_MODE)
	})

	test('tightens permissions on an existing loose file', () => {
		fs.writeFileSync(draftsFile, '{}', { mode: 0o644 })
		fs.chmodSync(draftsFile, 0o644)
		expect(modeOf(draftsFile)).toBe(0o644)

		writeJsonFile(draftsFile, { files: {} })
		expect(modeOf(draftsFile)).toBe(STATE_FILE_MODE)
	})

	test('tightens permissions on an existing loose directory', () => {
		const loose = path.join(dir, 'loose')
		fs.mkdirSync(loose, { mode: 0o755 })
		fs.chmodSync(loose, 0o755)

		ensureStateDir(loose)
		expect(modeOf(loose)).toBe(STATE_DIR_MODE)
	})

	test('round-trips a draft record', () => {
		const record = {
			...RECORD,
			sharedWith: [
				'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
			],
		}
		saveDraftRecord('/plans/one.html', record, draftsFile)
		expect(findDraftByFile('/plans/one.html', draftsFile)).toEqual(record)
	})

	test('rejects malformed shared identity keys', () => {
		fs.writeFileSync(
			draftsFile,
			JSON.stringify({
				files: {
					'/plans/one.html': { ...RECORD, sharedWith: ['not-a-public-key'] },
				},
			}),
		)
		expect(() => readDrafts(draftsFile)).toThrow(/sharedWith/)
	})

	test('finds a draft by origin, whichever file wrote it', () => {
		saveDraftRecord('/plans/one.html', RECORD, draftsFile)
		const found = findDraftByOrigin(RECORD.origin, draftsFile)
		expect(found?.filePath).toBe('/plans/one.html')
		expect(found?.record.keyID).toBe(RECORD.keyID)
	})

	test('returns nothing for an unknown file or origin', () => {
		expect(findDraftByFile('/plans/missing.html', draftsFile)).toBeUndefined()
		expect(findDraftByOrigin('nope', draftsFile)).toBeUndefined()
	})

	test('a missing drafts file reads as empty, not as an error', () => {
		expect(readDrafts(path.join(dir, 'nothing.json'))).toEqual({ files: {} })
	})

	test('a corrupt drafts file is surfaced instead of silently reading empty', () => {
		fs.writeFileSync(draftsFile, 'not json{{{')
		expect(() => readDrafts(draftsFile)).toThrow(/corrupt JSON/)
	})

	test('an invalid drafts structure is surfaced with the broken field', () => {
		fs.writeFileSync(
			draftsFile,
			JSON.stringify({
				files: { '/plans/one.html': { ...RECORD, origin: 'bad' } },
			}),
		)
		expect(() => readDrafts(draftsFile)).toThrow(/invalid origin/)
	})

	test('a failed atomic write preserves the previous file', () => {
		writeDrafts({ files: { '/plans/one.html': RECORD } }, draftsFile)
		const before = fs.readFileSync(draftsFile, 'utf8')
		const circular: { self?: unknown } = {}
		circular.self = circular

		expect(() => writeJsonFile(draftsFile, circular)).toThrow()
		expect(fs.readFileSync(draftsFile, 'utf8')).toBe(before)
		expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual(
			[],
		)
	})

	test('a second draft does not clobber the first', () => {
		saveDraftRecord('/plans/one.html', RECORD, draftsFile)
		saveDraftRecord(
			'/plans/two.html',
			{ ...RECORD, origin: `${'c'.repeat(64)}_0` },
			draftsFile,
		)
		expect(Object.keys(readDrafts(draftsFile).files)).toEqual([
			'/plans/one.html',
			'/plans/two.html',
		])
	})

	test('writeConfig round-trips walletUrl at 0600', () => {
		const file = path.join(dir, 'config.json')
		writeConfig({ walletUrl: 'http://127.0.0.1:3321' }, file)
		expect(readConfig(file)).toEqual({ walletUrl: 'http://127.0.0.1:3321' })
		expect(modeOf(file)).toBe(STATE_FILE_MODE)
	})

	test('no key material is ever written', () => {
		saveDraftRecord('/plans/one.html', RECORD, draftsFile)
		const raw = fs.readFileSync(draftsFile, 'utf8')
		// keyID is a label the wallet derives against, never a key.
		const parsed = JSON.parse(raw) as { files: Record<string, DraftRecord> }
		const stored = parsed.files['/plans/one.html']
		expect(Object.keys(stored ?? {}).sort()).toEqual([
			'description',
			'keyID',
			'latestOutpoint',
			'latestVersion',
			'origin',
			'title',
			'updatedAt',
		])
	})

	test('writeDrafts replaces the whole file', () => {
		saveDraftRecord('/plans/one.html', RECORD, draftsFile)
		writeDrafts({ files: {} }, draftsFile)
		expect(readDrafts(draftsFile).files).toEqual({})
	})
})
