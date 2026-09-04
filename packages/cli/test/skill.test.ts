import { describe, expect, test } from 'bun:test'
import type { Command } from 'commander'
import {
	resolveSkillInstallLauncher,
	SKILL_INSTALL_ARGS,
	SKILL_INSTALL_COMMAND,
	SKILL_INSTALL_FALLBACK,
	skillInstallCommand,
} from '../src/commands/skill.js'
import { CliError } from '../src/errors.js'
import { buildProgram } from '../src/index.js'

function commandNamed(program: Command, name: string): Command {
	const found = program.commands.find((c) => c.name() === name)
	if (!found) throw new Error(`no ${name} command`)
	return found
}

describe('skill install', () => {
	test('nested skill install command exists', () => {
		const program = buildProgram()
		const skill = commandNamed(program, 'skill')
		expect(skill.commands.map((c) => c.name())).toEqual(['install'])
	})

	test('runs the Skills CLI with the exact executable and arguments', async () => {
		const calls: Array<{
			command: string
			args: string[]
			options: unknown
		}> = []
		const fake = ((command: string, args: string[], options: unknown) => {
			calls.push({ command, args, options })
			return { status: 0, error: undefined }
		}) as unknown as Parameters<typeof skillInstallCommand>[0] extends never
			? never
			: typeof import('node:child_process').spawnSync

		await skillInstallCommand(fake)

		expect(SKILL_INSTALL_COMMAND).toBe('npx')
		expect([...SKILL_INSTALL_ARGS]).toEqual([
			'--yes',
			'skills',
			'add',
			'opldotdev/bitplan.dev',
			'--skill',
			'bitplan',
			'-g',
		])
		expect(calls).toHaveLength(1)
		expect(calls[0]?.command).toBe('npx')
		expect(calls[0]?.args).toEqual([
			'--yes',
			'skills',
			'add',
			'opldotdev/bitplan.dev',
			'--skill',
			'bitplan',
			'-g',
		])
	})

	test('keeps terminal I/O attached', async () => {
		let seen: unknown
		const fake = ((...args: unknown[]) => {
			seen = args[2]
			return { status: 0, error: undefined }
		}) as unknown as typeof import('node:child_process').spawnSync

		await skillInstallCommand(fake)

		expect(seen).toMatchObject({ stdio: 'inherit' })
	})

	test('non-zero exit is a CliError with the direct command', async () => {
		const fake = (() => {
			return { status: 1, error: undefined }
		}) as unknown as typeof import('node:child_process').spawnSync

		const error = await skillInstallCommand(fake).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CliError)
		expect(String((error as Error).message)).toContain(SKILL_INSTALL_FALLBACK)
		expect(String((error as Error).message)).toContain(
			'npx skills add opldotdev/bitplan.dev --skill bitplan -g',
		)
	})

	test('launch failure is a CliError with the direct command', async () => {
		const throwing = (() => {
			throw new Error('spawn npx ENOENT')
		}) as unknown as typeof import('node:child_process').spawnSync
		const thrown = await skillInstallCommand(throwing).catch((e: unknown) => e)
		expect(thrown).toBeInstanceOf(CliError)
		expect(String((thrown as Error).message)).toContain(SKILL_INSTALL_FALLBACK)

		const errorResult = (() => {
			return { status: null, error: new Error('spawn npx ENOENT') }
		}) as unknown as typeof import('node:child_process').spawnSync
		const failed = await skillInstallCommand(errorResult).catch(
			(e: unknown) => e,
		)
		expect(failed).toBeInstanceOf(CliError)
		expect(String((failed as Error).message)).toContain(SKILL_INSTALL_FALLBACK)
	})

	describe('platform-aware launcher (shell-free)', () => {
		test('POSIX resolves to npx directly', () => {
			for (const platform of ['linux', 'darwin'] as const) {
				const launcher = resolveSkillInstallLauncher({ platform })
				expect(launcher.file).toBe('npx')
				expect(launcher.args).toEqual([
					'--yes',
					'skills',
					'add',
					'opldotdev/bitplan.dev',
					'--skill',
					'bitplan',
					'-g',
				])
			}
		})

		test('Windows resolves npx-cli.js through the Node executable', () => {
			const execPath = 'C:\\Program Files\\nodejs\\node.exe'
			const launcher = resolveSkillInstallLauncher({
				platform: 'win32',
				execPath,
			})
			expect(launcher.file).toBe(execPath)
			expect(launcher.args[0]).toBe(
				'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
			)
			expect(launcher.args.slice(1)).toEqual([
				'--yes',
				'skills',
				'add',
				'opldotdev/bitplan.dev',
				'--skill',
				'bitplan',
				'-g',
			])
			expect(launcher.args[0]).not.toMatch(/\.cmd$/i)
		})

		test('skill install uses the POSIX launcher without a shell', async () => {
			const calls: Array<{
				file: string
				args: string[]
				options: { stdio?: unknown; shell?: unknown }
			}> = []
			const fake = ((file: string, args: string[], options: unknown) => {
				calls.push({
					file,
					args,
					options: options as { stdio?: unknown; shell?: unknown },
				})
				return { status: 0, error: undefined }
			}) as unknown as typeof import('node:child_process').spawnSync

			await skillInstallCommand(fake, { platform: 'linux' })

			expect(calls).toHaveLength(1)
			expect(calls[0]?.file).toBe('npx')
			expect(calls[0]?.args).toEqual([
				'--yes',
				'skills',
				'add',
				'opldotdev/bitplan.dev',
				'--skill',
				'bitplan',
				'-g',
			])
			expect(calls[0]?.options).toMatchObject({
				stdio: 'inherit',
				shell: false,
			})
		})

		test('skill install uses the Windows launcher without a shell', async () => {
			const execPath = 'C:\\Program Files\\nodejs\\node.exe'
			const calls: Array<{
				file: string
				args: string[]
				options: { stdio?: unknown; shell?: unknown }
			}> = []
			const fake = ((file: string, args: string[], options: unknown) => {
				calls.push({
					file,
					args,
					options: options as { stdio?: unknown; shell?: unknown },
				})
				return { status: 0, error: undefined }
			}) as unknown as typeof import('node:child_process').spawnSync

			await skillInstallCommand(fake, { platform: 'win32', execPath })

			expect(calls).toHaveLength(1)
			expect(calls[0]?.file).toBe(execPath)
			expect(calls[0]?.args[0]).toBe(
				'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
			)
			expect(calls[0]?.args.slice(1)).toEqual([...SKILL_INSTALL_ARGS])
			expect(calls[0]?.options).toMatchObject({
				stdio: 'inherit',
				shell: false,
			})
		})
	})
})
