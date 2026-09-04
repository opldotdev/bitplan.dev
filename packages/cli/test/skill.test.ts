import { describe, expect, test } from 'bun:test'
import type { spawnSync } from 'node:child_process'
import type { Command } from 'commander'
import {
	resolveSkillInstallLauncher,
	SKILL_INSTALL_ARGS,
	SKILL_INSTALL_FALLBACK,
	skillInstallCommand,
} from '../src/commands/skill.js'
import { CliError } from '../src/errors.js'
import { buildProgram } from '../src/index.js'

type Spawn = typeof spawnSync

function commandNamed(program: Command, name: string): Command {
	const found = program.commands.find((command) => command.name() === name)
	if (!found) throw new Error(`no ${name} command`)
	return found
}

function recordingSpawn(status = 0) {
	const calls: Array<{
		file: string
		args: string[]
		options: { stdio?: unknown; shell?: unknown }
	}> = []
	const spawn = ((file: string, args: string[], options: unknown) => {
		calls.push({
			file,
			args,
			options: options as { stdio?: unknown; shell?: unknown },
		})
		return { status, error: undefined }
	}) as unknown as Spawn
	return { calls, spawn }
}

describe('skill install', () => {
	test('is exposed as a nested CLI command', () => {
		const skill = commandNamed(buildProgram(), 'skill')
		expect(skill.commands.map((command) => command.name())).toEqual(['install'])
	})

	test('runs the exact installer with attached terminal I/O on POSIX', async () => {
		const { calls, spawn } = recordingSpawn()

		await skillInstallCommand(spawn, { platform: 'linux' })

		expect(calls).toEqual([
			{
				file: 'npx',
				args: [...SKILL_INSTALL_ARGS],
				options: { stdio: 'inherit', shell: false },
			},
		])
	})

	test('uses Node and npx-cli.js without a shell on Windows', async () => {
		const execPath = 'C:\\Program Files\\nodejs\\node.exe'
		const { calls, spawn } = recordingSpawn()

		await skillInstallCommand(spawn, { platform: 'win32', execPath })

		expect(calls).toEqual([
			{
				file: execPath,
				args: [
					'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
					...SKILL_INSTALL_ARGS,
				],
				options: { stdio: 'inherit', shell: false },
			},
		])
	})

	test('resolves platform launchers without running them', () => {
		expect(resolveSkillInstallLauncher({ platform: 'darwin' })).toEqual({
			file: 'npx',
			args: [...SKILL_INSTALL_ARGS],
		})
		expect(
			resolveSkillInstallLauncher({
				platform: 'win32',
				execPath: 'C:\\nodejs\\node.exe',
			}),
		).toEqual({
			file: 'C:\\nodejs\\node.exe',
			args: [
				'C:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
				...SKILL_INSTALL_ARGS,
			],
		})
	})

	test('turns launch and installer failures into actionable CLI errors', async () => {
		const failures: Spawn[] = [
			(() => {
				throw new Error('spawn failed')
			}) as unknown as Spawn,
			(() => ({
				status: null,
				error: new Error('spawn failed'),
			})) as unknown as Spawn,
			recordingSpawn(1).spawn,
		]

		for (const spawn of failures) {
			const error = await skillInstallCommand(spawn).catch(
				(caught: unknown) => caught,
			)
			expect(error).toBeInstanceOf(CliError)
			expect(String((error as Error).message)).toContain(SKILL_INSTALL_FALLBACK)
		}
	})
})
