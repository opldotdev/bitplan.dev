import { Command } from 'commander'
import {
	contactListCommand,
	contactRemoveCommand,
	contactSetCommand,
	teamAddCommand,
	teamDeleteCommand,
	teamListCommand,
	teamRemoveCommand,
	teamSetCommand,
} from './commands/addressBook.js'
import { authCommand } from './commands/auth.js'
import { configCommand } from './commands/config.js'
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
		.command('config')
		.description('Set defaults for new plans.')
		.option(
			'--share-with <reader>',
			'Share every new plan with a key, contact, or team (repeatable)',
			collect,
			[],
		)
		.option('--clear-share-with', 'Stop sharing new plans by default')
		.action((options) => configCommand(options))

	const contact = program
		.command('contact')
		.description('Manage local names for wallet identities.')

	contact
		.command('set')
		.description('Add or update a contact.')
		.argument('<name>', 'Local contact name')
		.argument('<identity-key>', 'Wallet identity public key')
		.action((name, identityKey) => contactSetCommand(name, identityKey))

	contact
		.command('remove')
		.description('Remove an unused contact.')
		.argument('<name>', 'Local contact name')
		.action((name) => contactRemoveCommand(name))

	contact
		.command('list')
		.description('List contacts.')
		.option('--json', 'Print raw JSON')
		.action((options) => contactListCommand(options))

	const team = program
		.command('team')
		.description('Manage local groups of contacts.')

	team
		.command('set')
		.description('Create or replace a team.')
		.argument('<name>', 'Local team name')
		.argument('<contacts...>', 'Contact names')
		.action((name, contacts) => teamSetCommand(name, contacts))

	team
		.command('add')
		.description('Add contacts to a team, creating it if needed.')
		.argument('<name>', 'Local team name')
		.argument('<contacts...>', 'Contact names')
		.action((name, contacts) => teamAddCommand(name, contacts))

	team
		.command('remove')
		.description('Remove contacts from a team.')
		.argument('<name>', 'Local team name')
		.argument('<contacts...>', 'Contact names')
		.action((name, contacts) => teamRemoveCommand(name, contacts))

	team
		.command('delete')
		.description('Delete an unused team.')
		.argument('<name>', 'Local team name')
		.action((name) => teamDeleteCommand(name))

	team
		.command('list')
		.description('List teams or inspect one team.')
		.argument('[name]', 'Local team name')
		.option('--json', 'Print raw JSON')
		.action((name, options) => teamListCommand(name, options))

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
			'--share-with <reader>',
			'Grant access to a key, contact, or team (repeatable)',
			collect,
			[],
		)
		.option(
			'--private',
			'Remove shared readers from the new version (older versions stay shared)',
		)
		.option('-y, --yes', 'Skip the confirmation prompt')
		.option('--json', 'Print the publish result as JSON (requires --yes)')
		.option(
			'--allow-finding <id>',
			'Waive one secret-scanner finding (repeatable)',
			collect,
			[],
		)
		.option('--wallet-url <url>', 'BRC-100 JSON API endpoint')
		.option('--ordfs-url <url>', 'ORDFS gateway base URL')
		.option(
			'--no-relay',
			'Do not notify 1Sat for ORDFS capture after publishing',
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
		.option('--json', 'Print the HTML and metadata as JSON')
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
	for (const command of program.commands) overrideExit(command)

	if (argv.slice(2).length === 0) {
		program.outputHelp()
		return
	}

	await program.parseAsync(argv)
}

function overrideExit(command: Command): void {
	command.exitOverride()
	for (const child of command.commands) overrideExit(child)
}
