import type { SpawnSyncReturns } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { CliError } from '../errors.js'

export const SKILL_INSTALL_COMMAND = 'npx'
export const SKILL_INSTALL_ARGS: readonly string[] = [
	'--yes',
	'skills',
	'add',
	'opldotdev/bitplan.dev',
	'--skill',
	'bitplan',
	'-g',
]
export const SKILL_INSTALL_FALLBACK =
	'npx skills add opldotdev/bitplan.dev --skill bitplan -g'

type SkillSpawnSync = typeof spawnSync

export interface SkillLauncher {
	file: string
	args: string[]
}

export interface SkillLauncherOptions {
	platform?: NodeJS.Platform
	execPath?: string
}

/**
 * Select how to launch the Skills CLI without a shell.
 *
 * POSIX can spawn `npx` directly. On Windows npm exposes npx as `npx.cmd`,
 * which Node cannot spawn without a shell, so instead run the resolved
 * `npx-cli.js` through the current Node executable (`process.execPath`).
 * The `npx-cli.js` sits beside Node at
 * `<node-dir>/node_modules/npm/bin/npx-cli.js` in a standard install.
 * `path.win32` is used deliberately so Windows selection is unit-testable
 * from any host OS.
 */
export function resolveSkillInstallLauncher(
	options: SkillLauncherOptions = {},
): SkillLauncher {
	const platform: NodeJS.Platform = options.platform ?? process.platform
	if (platform !== 'win32') {
		return { file: SKILL_INSTALL_COMMAND, args: [...SKILL_INSTALL_ARGS] }
	}
	const execPath = options.execPath ?? process.execPath
	const npxCli = path.win32.join(
		path.win32.dirname(execPath),
		'node_modules',
		'npm',
		'bin',
		'npx-cli.js',
	)
	return { file: execPath, args: [npxCli, ...SKILL_INSTALL_ARGS] }
}

/**
 * Install the BitPlan agent skill with the Skills CLI.
 *
 * Runs without a shell so the real installer stays interactive and visible.
 * This command never touches a wallet and never handles secrets.
 */
export async function skillInstallCommand(
	injected?: unknown,
	launcherOptions: SkillLauncherOptions = {},
): Promise<void> {
	const run: SkillSpawnSync =
		typeof injected === 'function' ? (injected as SkillSpawnSync) : spawnSync
	const launcher = resolveSkillInstallLauncher(launcherOptions)

	let result: SpawnSyncReturns<Buffer>
	try {
		result = run(launcher.file, launcher.args, {
			stdio: 'inherit',
			// Never use a shell: the child must stay interactive and visible,
			// and shell execution would change quoting/lookup behavior.
			shell: false,
		})
	} catch {
		throw new CliError(
			`Could not start the skill installer. Run this command directly: ${SKILL_INSTALL_FALLBACK}`,
		)
	}

	if (result.error) {
		throw new CliError(
			`Could not start the skill installer. Run this command directly: ${SKILL_INSTALL_FALLBACK}`,
		)
	}

	if (result.status !== 0) {
		throw new CliError(
			`The skill installer did not finish. Run this command directly: ${SKILL_INSTALL_FALLBACK}`,
		)
	}
}
