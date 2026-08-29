import { Command } from 'commander'
import { authCommand } from './commands/auth.js'
import { fetchCommand } from './commands/fetch.js'
import { listCommand } from './commands/list.js'
import { uploadCommand } from './commands/upload.js'
import { whoamiCommand } from './commands/whoami.js'
import { CLI_VERSION } from './version.js'

export function buildProgram(): Command {
	const program = new Command()

	program
		.name('bitplan')
		.description(
			'Publish plan documents to Bitcoin as 1Sat Ordinals. Encrypted by default.',
		)
		.version(CLI_VERSION)

	const auth = program
		.command('auth')
		.description('Connect to a BRC-100 wallet.')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.action(authCommand)

	auth
		.command('login')
		.description('Connect to a BRC-100 wallet.')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.action(authCommand)

	program
		.command('whoami')
		.description('Check the connected wallet.')
		.option('--json', 'Print raw JSON')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.action(whoamiCommand)

	program
		.command('version')
		.description('Print the installed bitplan version.')
		.action(() => {
			console.log(CLI_VERSION)
		})

	program
		.command('upload')
		.description('Upload or update an HTML draft.')
		.argument('<file>', 'HTML file path')
		.option('--draft <origin>', 'Update a specific draft origin')
		.option('--new', 'Always create a new draft')
		.option('--description <text>', 'Set a short description for the draft')
		.option(
			'--share-with <identity-key>',
			'Grant read access to an identity key (repeatable)',
			collect,
			[],
		)
		.option(
			'--private',
			'Remove shared readers from the new version (older versions stay shared)',
		)
		.option('-y, --yes', 'Skip the confirmation prompt')
		.option(
			'--allow-finding <id>',
			'Waive one secret-scanner finding (repeatable)',
			collect,
			[],
		)
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.option('--ordfs-url <url>', 'ORDFS gateway base URL')
		.option(
			'--relay',
			'Relay wallet BEEF through 1Sat; may speed ORDFS availability',
		)
		.action(uploadCommand)

	program
		.command('list')
		.description('List the drafts this wallet holds.')
		.option('--json', 'Print raw JSON')
		.option('-v, --verbose', 'Show one detailed block per draft')
		.option('--limit <n>', 'Maximum drafts to return (default 100)')
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.action(listCommand)

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
	program.exitOverride()
	for (const command of program.commands) command.exitOverride()

	if (argv.slice(2).length === 0) {
		program.outputHelp()
		return
	}

	await program.parseAsync(argv)
}
