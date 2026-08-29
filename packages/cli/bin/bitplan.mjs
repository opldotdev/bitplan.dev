#!/usr/bin/env node
/**
 * Published bin. Unbundled on purpose: bun inlines @bsv/sdk into dist/bitplan.js,
 * and that SDK reads `localStorage` at module init. Node 25+ enables Web Storage
 * by default and warns (or later throws) without `--localstorage-file`.
 *
 * This file relaunches Node with the feature disabled *before* importing the
 * bundle. The CLI does not use Web Storage. Bun has no such getter; skip there.
 *
 * Do not gate on import.meta.url vs argv[1]: npx and bunx install a .bin symlink
 * whose path never matches, which is why 0.0.1 exited with no output.
 */
import { spawnSync } from 'node:child_process'

const DISABLE_FLAGS = ['--no-experimental-webstorage', '--no-webstorage']

function alreadyDisabled() {
	return process.execArgv.some(
		(arg) =>
			arg === '--no-experimental-webstorage' || arg === '--no-webstorage',
	)
}

function storageFileProvided() {
	return process.execArgv.some(
		(arg) =>
			arg === '--localstorage-file' || arg.startsWith('--localstorage-file='),
	)
}

function nodeMajor() {
	return Number.parseInt(process.versions.node, 10)
}

function flagIsSupported(flag) {
	const probe = spawnSync(process.execPath, [flag, '--eval', ''], {
		encoding: 'utf8',
		stdio: ['ignore', 'ignore', 'pipe'],
	})
	return probe.status === 0
}

function relaunchWithoutWebStorage() {
	if (process.versions.bun) return
	if (nodeMajor() < 25) return
	if (alreadyDisabled()) return
	if (storageFileProvided()) return

	const flag = DISABLE_FLAGS.find(flagIsSupported)
	if (!flag) return

	const result = spawnSync(
		process.execPath,
		[...process.execArgv, flag, ...process.argv.slice(1)],
		{ stdio: 'inherit' },
	)
	if (result.error) {
		console.error(result.error.message)
		process.exit(1)
	}
	process.exit(result.status ?? 1)
}

relaunchWithoutWebStorage()

await import(new URL('../dist/bitplan.js', import.meta.url))
