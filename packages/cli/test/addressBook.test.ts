import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveReaderInputs } from '../src/addressBook.js'
import {
	contactListCommand,
	contactRemoveCommand,
	contactSetCommand,
	teamAddCommand,
	teamDeleteCommand,
	teamListCommand,
	teamRemoveCommand,
	teamSetCommand,
} from '../src/commands/addressBook.js'
import { type DraftRecord, readConfig, writeDrafts } from '../src/state.js'

const ALICE_KEY =
	'0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const BOB_KEY =
	'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
const RECORD: DraftRecord = {
	origin: `${'a'.repeat(64)}_0`,
	keyID: 'draft-key',
	latestOutpoint: `${'b'.repeat(64)}_0`,
	latestVersion: 2,
	updatedAt: '2026-08-31T00:00:00.000Z',
}

let dir: string
let configFile: string
let draftsFile: string

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-address-book-'))
	configFile = path.join(dir, 'config.json')
	draftsFile = path.join(dir, 'drafts.json')
	spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true })
})

describe('local contacts and teams', () => {
	test('sets normalized contacts and lists them as JSON', () => {
		contactSetCommand(' Alice ', ALICE_KEY.toUpperCase(), configFile)
		contactSetCommand('bob', BOB_KEY, configFile)

		expect(readConfig(configFile).contacts).toEqual({
			alice: ALICE_KEY,
			bob: BOB_KEY,
		})
		contactListCommand({ json: true }, configFile)
		expect(console.log).toHaveBeenLastCalledWith(
			JSON.stringify({ contacts: { alice: ALICE_KEY, bob: BOB_KEY } }, null, 2),
		)
	})

	test('creates, replaces, adds, removes, and resolves teams', () => {
		contactSetCommand('alice', ALICE_KEY, configFile)
		contactSetCommand('bob', BOB_KEY, configFile)
		teamSetCommand('DEV', ['alice'], configFile)
		teamAddCommand('dev', ['bob', 'alice'], configFile)

		let config = readConfig(configFile)
		expect(config.teams).toEqual({ dev: ['alice', 'bob'] })
		expect(resolveReaderInputs(['dev'], config)).toEqual({
			rawKeys: [],
			namedRefs: ['dev'],
			keys: [ALICE_KEY, BOB_KEY],
		})

		teamRemoveCommand('dev', ['bob'], configFile)
		config = readConfig(configFile)
		expect(resolveReaderInputs(['dev'], config).keys).toEqual([ALICE_KEY])
		teamListCommand('dev', { json: true }, configFile)
		expect(console.log).toHaveBeenLastCalledWith(
			JSON.stringify(
				{ name: 'dev', contacts: ['alice'], identityKeys: [ALICE_KEY] },
				null,
				2,
			),
		)
	})

	test('keeps contact and team names unambiguous and rejects nesting', () => {
		contactSetCommand('dev', ALICE_KEY, configFile)
		expect(() => teamSetCommand('DEV', ['dev'], configFile)).toThrow(
			'already a contact name',
		)
		expect(() => teamSetCommand('ops', ['missing'], configFile)).toThrow(
			'Unknown contact',
		)
	})

	test('refuses to remove names still used by teams, defaults, or drafts', () => {
		contactSetCommand('alice', ALICE_KEY, configFile)
		teamSetCommand('dev', ['alice'], configFile)
		expect(() => contactRemoveCommand('alice', configFile, draftsFile)).toThrow(
			'used by team',
		)

		const config = readConfig(configFile)
		config.shareWithRefs = ['dev']
		fs.writeFileSync(configFile, `${JSON.stringify(config)}\n`)
		expect(() => teamDeleteCommand('dev', configFile, draftsFile)).toThrow(
			'default reader',
		)

		delete config.shareWithRefs
		fs.writeFileSync(configFile, `${JSON.stringify(config)}\n`)
		writeDrafts(
			{
				files: {
					'/plan.html': { ...RECORD, shareWithRefs: ['dev'] },
				},
			},
			draftsFile,
		)
		expect(() => teamDeleteCommand('dev', configFile, draftsFile)).toThrow(
			'attached to a local draft',
		)
	})
})
