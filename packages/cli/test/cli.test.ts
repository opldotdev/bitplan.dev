import { beforeAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Command } from 'commander'
import { fetchCommand } from '../src/commands/fetch.js'
import {
	estimateFeeSats,
	resolveDescription,
	viewerUrl,
} from '../src/commands/upload.js'
import { isBitplanContentType } from '../src/constants.js'
import { buildProgram, main } from '../src/index.js'
import { originFromReference } from '../src/ordfs.js'
import {
	isOutpoint,
	shortOutpoint,
	toOrdinalOutpoint,
	toWalletOutpoint,
} from '../src/outpoint.js'
import { CLI_VERSION } from '../src/version.js'

const ORIGIN = `${'a'.repeat(64)}_0`

function commandNamed(program: Command, name: string): Command {
	const found = program.commands.find((c) => c.name() === name)
	if (!found) throw new Error(`no ${name} command`)
	return found
}

function flagsOf(command: Command): string[] {
	return command.options.map((o) => o.long ?? o.short ?? '')
}

/** A program that throws on parse errors instead of exiting, output silenced. */
function overridden(): Command {
	const program = buildProgram()
	const silence = { writeErr: () => {}, writeOut: () => {} }
	program.exitOverride().configureOutput(silence)
	for (const command of program.commands) {
		command.exitOverride().configureOutput(silence)
	}
	return program
}

describe('cli surface', () => {
	const program = buildProgram()

	test('is named bitplan and reports the package version', () => {
		expect(program.name()).toBe('bitplan')
		expect(program.version()).toBe(CLI_VERSION)
		expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+/)
	})

	test('exposes the postplan command set plus fetch', () => {
		expect(program.commands.map((c) => c.name())).toEqual([
			'auth',
			'whoami',
			'version',
			'upload',
			'list',
			'fetch',
		])
		const auth = commandNamed(program, 'auth')
		expect(auth.commands.map((c) => c.name())).toEqual(['login'])
	})

	test('bare invocation prints usage, not a silent exit', async () => {
		const chunks: string[] = []
		const orig = process.stdout.write.bind(process.stdout)
		process.stdout.write = ((chunk: string | Uint8Array) => {
			chunks.push(
				typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
			)
			return true
		}) as typeof process.stdout.write
		try {
			await main(['node', 'bitplan'])
		} finally {
			process.stdout.write = orig
		}
		const out = chunks.join('')
		expect(out).toMatch(/Usage: bitplan/)
		expect(out).toMatch(/upload/)
		expect(out).toMatch(/auth/)
	})

	test('upload takes a file and the documented flags', () => {
		const upload = commandNamed(program, 'upload')
		expect(upload.registeredArguments.map((a) => a.name())).toEqual(['file'])
		expect(flagsOf(upload)).toEqual(
			expect.arrayContaining([
				'--draft',
				'--new',
				'--description',
				'--share-with',
				'--private',
				'--no-relay',
				'--yes',
				'--json',
				'--allow-finding',
				'--wallet-url',
			]),
		)
	})

	test('version command prints only the package version', async () => {
		const chunks: string[] = []
		const original = console.log
		console.log = (value?: unknown) => chunks.push(String(value))
		try {
			await main(['node', 'bitplan', 'version'])
		} finally {
			console.log = original
		}
		expect(chunks).toEqual([CLI_VERSION])
	})

	test('list takes json, verbose, and limit flags', () => {
		const list = commandNamed(program, 'list')
		expect(flagsOf(list)).toEqual(
			expect.arrayContaining(['--json', '--verbose', '--limit']),
		)
	})

	test('fetch takes a reference, metadata, and JSON flags', () => {
		const fetch = commandNamed(program, 'fetch')
		expect(fetch.registeredArguments.map((a) => a.name())).toEqual([
			'origin|url',
		])
		expect(flagsOf(fetch)).toEqual(expect.arrayContaining(['--meta', '--json']))
	})

	test('--allow-finding is repeatable', () => {
		const upload = commandNamed(buildProgram(), 'upload')
		let captured: string[] | undefined
		upload.action((_file: string, options: { allowFinding?: string[] }) => {
			captured = options.allowFinding
		})
		upload.exitOverride()
		upload.parse(
			['plan.html', '--allow-finding', 'a-1', '--allow-finding', 'b-2'],
			{ from: 'user' },
		)
		expect(captured).toEqual(['a-1', 'b-2'])
	})

	test('--share-with is repeatable', () => {
		const upload = commandNamed(buildProgram(), 'upload')
		let captured: string[] | undefined
		upload.action((_file: string, options: { shareWith?: string[] }) => {
			captured = options.shareWith
		})
		upload.exitOverride()
		upload.parse(
			['plan.html', '--share-with', 'reader-a', '--share-with', 'reader-b'],
			{ from: 'user' },
		)
		expect(captured).toEqual(['reader-a', 'reader-b'])
	})

	test('an unknown command is an error, not a silent no-op', () => {
		const p = overridden()
		expect(() => p.parse(['nope'], { from: 'user' })).toThrow()
	})

	test('an unknown flag on a subcommand is an error', () => {
		// Regression guard: exitOverride is not inherited by subcommands, so
		// without the loop in main() this would call process.exit() instead.
		const p = overridden()
		expect(() => p.parse(['list', '--not-a-flag'], { from: 'user' })).toThrow()
	})
})

describe('npx and bunx bin runners', () => {
	const cliSrc = path.join(import.meta.dir, '../src/cli.ts')
	const wrapper = path.join(import.meta.dir, '../bin/bitplan.mjs')
	const dist = path.join(import.meta.dir, '../dist/bitplan.js')

	// The wrapper tests exercise the real published artifact, so build it
	// when absent (fresh clone). CI builds beforehand and skips this.
	beforeAll(() => {
		if (fs.existsSync(dist)) return
		const result = Bun.spawnSync(['bun', 'run', 'build'], {
			cwd: path.join(import.meta.dir, '..'),
			stderr: 'pipe',
			stdout: 'pipe',
		})
		if (result.exitCode !== 0) {
			throw new Error(
				`bun run build failed:\n${result.stdout.toString()}${result.stderr.toString()}`,
			)
		}
	}, 120_000)

	function run(runtime: 'bun' | 'node', file: string): string {
		const result = Bun.spawnSync([runtime, file], {
			stderr: 'pipe',
			stdout: 'pipe',
		})
		const out = `${result.stdout.toString()}${result.stderr.toString()}`
		expect(result.exitCode).toBe(0)
		expect(out).toMatch(/Usage: bitplan/)
		expect(out).not.toMatch(/\(outputHelp\)/)
		expect(out).not.toMatch(/localStorage is not available/)
		expect(out).not.toMatch(/ExperimentalWarning/)
		return out
	}

	test('the published bin is the unbundled wrapper', () => {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(import.meta.dir, '../package.json'), 'utf8'),
		) as { bin: { bitplan: string } }
		expect(pkg.bin.bitplan).toBe('./bin/bitplan.mjs')
		expect(fs.existsSync(wrapper)).toBe(true)
	})

	test('bun src/cli.ts prints usage', () => {
		run('bun', cliSrc)
	})

	test('node and bun print usage through the published wrapper', () => {
		if (!fs.existsSync(dist)) {
			throw new Error(
				'dist/bitplan.js missing; run bun run --filter bitplan build',
			)
		}
		run('node', wrapper)
		run('bun', wrapper)
	})

	test('node and bun print usage through a .bin-style symlink', () => {
		if (!fs.existsSync(dist)) {
			throw new Error(
				'dist/bitplan.js missing; run bun run --filter bitplan build',
			)
		}
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitplan-bin-'))
		const link = path.join(dir, 'bitplan')
		try {
			fs.symlinkSync(wrapper, link)
			run('node', link)
			run('bun', link)
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe('viewer urls and fees', () => {
	test('the viewer url url-encodes the outpoint', () => {
		expect(viewerUrl(ORIGIN)).toBe(`https://bitplan.dev/d/${ORIGIN}`)
		expect(viewerUrl('a b')).toBe('https://bitplan.dev/d/a%20b')
	})

	test('the fee estimate is 1 sat per KB, rounded up', () => {
		expect(estimateFeeSats(1)).toBe(1)
		expect(estimateFeeSats(1000)).toBe(1)
		expect(estimateFeeSats(1001)).toBe(2)
		expect(estimateFeeSats(45_000)).toBe(45)
	})
})

describe('strict CLI values', () => {
	test('outpoints reject trailing or oversized output indexes', () => {
		expect(() => toOrdinalOutpoint(`${'a'.repeat(64)}_1junk`)).toThrow()
		expect(() => toOrdinalOutpoint(`${'a'.repeat(64)}_4294967296`)).toThrow()
		expect(toOrdinalOutpoint(`${'a'.repeat(64)}.4294967295`)).toBe(
			`${'a'.repeat(64)}_4294967295`,
		)
	})

	test('fetch rejects a version with trailing characters before doing I/O', async () => {
		await expect(fetchCommand(ORIGIN, { version: '2abc' })).rejects.toThrow(
			/--version must be a positive version number/,
		)
	})

	test('content type matching accepts parameters but not prefix lookalikes', () => {
		expect(isBitplanContentType('application/x-bitplan')).toBe(true)
		expect(isBitplanContentType('Application/X-Bitplan; charset=binary')).toBe(
			true,
		)
		expect(isBitplanContentType('application/x-bitplanevil')).toBe(false)
	})

	test('upload preserves an existing description when the flag is omitted', () => {
		const existing = {
			origin: ORIGIN,
			keyID: 'key',
			latestOutpoint: ORIGIN,
			latestVersion: 1,
			updatedAt: '2026-08-29T16:00:00.000Z',
			description: 'Keep me',
		}
		expect(resolveDescription(undefined, existing)).toBe('Keep me')
		expect(resolveDescription('Replace me', existing)).toBe('Replace me')
		expect(resolveDescription(undefined, undefined)).toBeNull()
	})
})

describe('outpoint spellings', () => {
	test('converts between wallet and ordinal forms', () => {
		expect(toOrdinalOutpoint(`${'a'.repeat(64)}.3`)).toBe(`${'a'.repeat(64)}_3`)
		expect(toWalletOutpoint(`${'a'.repeat(64)}_3`)).toBe(`${'a'.repeat(64)}.3`)
		expect(toOrdinalOutpoint(`${'a'.repeat(64)}_3`)).toBe(`${'a'.repeat(64)}_3`)
	})

	test('shortens a 64-char txid to 1234...7890_vout', () => {
		const txid =
			'5a524804ff938d69cf7cc1cb78da03633aadce2ad216d0af87bc296eb2c0d813'
		expect(shortOutpoint(`${txid}_0`)).toBe('5a52...d813_0')
		expect(shortOutpoint(`${txid}.12`)).toBe('5a52...d813_12')
	})

	test('rejects things that are not outpoints', () => {
		expect(isOutpoint('nope')).toBe(false)
		expect(isOutpoint('a'.repeat(64))).toBe(false)
		expect(isOutpoint(`${'z'.repeat(64)}_0`)).toBe(false)
		expect(isOutpoint(`${'a'.repeat(64)}_x`)).toBe(false)
		expect(isOutpoint(`${'a'.repeat(64)}_0`)).toBe(true)
	})
})

describe('draft references', () => {
	test('accepts a bare outpoint in either spelling', () => {
		expect(originFromReference(ORIGIN)).toBe(ORIGIN)
		expect(originFromReference(`${'a'.repeat(64)}.0`)).toBe(ORIGIN)
	})

	test('accepts a viewer url', () => {
		expect(originFromReference(`https://bitplan.dev/d/${ORIGIN}`)).toBe(ORIGIN)
		expect(
			originFromReference(
				`https://bitplan.dev/d/${encodeURIComponent(ORIGIN)}`,
			),
		).toBe(ORIGIN)
	})

	test('rejects anything else', () => {
		expect(() => originFromReference('')).toThrow(/No draft reference/)
		expect(() => originFromReference('hello')).toThrow(/Not an outpoint/)
		expect(() => originFromReference('https://bitplan.dev/d/hello')).toThrow(
			/Not an outpoint/,
		)
	})
})
