#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import { fetchCommand } from './commands/fetch.js'
import { listCommand } from './commands/list.js'
import { uploadCommand } from './commands/upload.js'
import { whoamiCommand } from './commands/whoami.js'
import { CliError } from './errors.js'
import { CLI_VERSION } from './version.js'

export function buildProgram(): Command {
	const program = new Command()

	program
		.name('bitplan')
		.description(
			'Publish plan documents to Bitcoin as 1Sat Ordinals. Encrypted by default.',
		)
		.version(CLI_VERSION)

	program
		.command('upload')
		.description('Publish an HTML document, or a new version of one.')
		.argument('<file>', 'HTML file path')
		.option('--draft <origin>', 'Publish a new version of this draft origin')
		.option('--new', 'Always start a new draft, ignoring local history')
		.option('--description <text>', 'Short description stored with the draft')
		.option('-y, --yes', 'Skip the confirmation prompt')
		.option(
			'--allow-finding <id>',
			'Waive one secret-scanner finding (repeatable)',
			collect,
			[],
		)
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.option('--ordfs-url <url>', 'ORDFS gateway base URL')
		.action(uploadCommand)

	program
		.command('list')
		.description('List the bitplan drafts this wallet holds.')
		.option('--json', 'Print raw JSON')
		.option('--limit <n>', 'Maximum drafts to return (default 100)')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.action(listCommand)

	program
		.command('whoami')
		.description('Show wallet connection status and identity key.')
		.option('--json', 'Print raw JSON')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.action(whoamiCommand)

	program
		.command('fetch')
		.description('Download and decrypt a published draft.')
		.argument('<origin|url>', 'Draft origin outpoint or viewer URL')
		.option('--meta', 'Print draft metadata to stderr')
		.option('--version <n>', 'Fetch a specific version (default: latest)')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.option('--ordfs-url <url>', 'ORDFS gateway base URL')
		.action(fetchCommand)

	return program
}

function collect(value: string, previous: string[]): string[] {
	return [...previous, value]
}

export async function main(argv: string[]): Promise<void> {
	const program = buildProgram()
	// exitOverride is per-command and is not inherited by subcommands, so a
	// bad flag on `bitplan list` would otherwise call process.exit() from
	// inside commander and skip the error handling below.
	program.exitOverride()
	for (const command of program.commands) command.exitOverride()
	await program.parseAsync(argv)
}

// Only run when invoked as the bin, not when imported by tests.
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main(process.argv).catch((error: unknown) => {
		if (error instanceof CliError) {
			console.error(error.message)
			process.exit(1)
		}
		const code = (error as { code?: string } | null)?.code
		if (code === 'commander.helpDisplayed' || code === 'commander.version') {
			process.exit(0)
		}
		if (typeof code === 'string' && code.startsWith('commander.')) {
			console.error((error as Error).message)
			process.exit(1)
		}
		console.error(error instanceof Error ? error.stack : String(error))
		process.exit(1)
	})
}
