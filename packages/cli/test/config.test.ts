import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configCommand } from '../src/commands/config.js'
import { readConfig, writeConfig } from '../src/state.js'

const READER =
	'02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'

let dir: string
let file: string

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-config-test-'))
	file = path.join(dir, 'config.json')
	spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
	fs.rmSync(dir, { force: true, recursive: true })
})

describe('configCommand', () => {
	test('sets and clears default readers', () => {
		configCommand({ shareWith: [READER.toUpperCase()] }, file)
		expect(readConfig(file).shareWith).toEqual([READER])

		configCommand({ clearShareWith: true }, file)
		expect(readConfig(file).shareWith).toBeUndefined()
	})

	test('stores names as re-resolved references, not copied keys', () => {
		writeConfig(
			{
				contacts: { alice: READER },
				teams: { dev: ['alice'] },
			},
			file,
		)
		configCommand({ shareWith: ['DEV'] }, file)
		expect(readConfig(file)).toMatchObject({
			shareWith: undefined,
			shareWithRefs: ['dev'],
		})

		configCommand({ clearShareWith: true }, file)
		expect(readConfig(file).shareWithRefs).toBeUndefined()
	})
})
