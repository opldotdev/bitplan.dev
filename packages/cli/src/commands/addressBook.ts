import { normalizeReaderName, resolveNamedReaders } from '../addressBook.js'
import { normalizeIdentityKey } from '../envelope.js'
import { CliError } from '../errors.js'
import {
	configPath,
	draftsPath,
	readConfig,
	readDrafts,
	writeConfig,
} from '../state.js'

export interface JsonOptions {
	json?: boolean
}

export function contactSetCommand(
	nameValue: string,
	identityKeyValue: string,
	file: string = configPath(),
): void {
	const name = normalizeReaderName(nameValue)
	const identityKey = normalizeIdentityKey(identityKeyValue)
	const config = readConfig(file)
	if (config.teams?.[name]) {
		throw new CliError(`"${name}" is already a team name.`)
	}
	config.contacts = { ...config.contacts, [name]: identityKey }
	writeConfig(config, file)
	console.log(`Saved contact ${name}: ${identityKey}`)
}

export function contactRemoveCommand(
	nameValue: string,
	configFile: string = configPath(),
	draftsFile: string = draftsPath(),
): void {
	const name = normalizeReaderName(nameValue)
	const config = readConfig(configFile)
	if (!config.contacts?.[name]) throw new CliError(`Unknown contact "${name}".`)
	const teams = Object.entries(config.teams ?? {})
		.filter(([, members]) => members.includes(name))
		.map(([team]) => team)
	if (teams.length > 0) {
		throw new CliError(
			`Cannot remove contact "${name}" while used by team${teams.length === 1 ? '' : 's'}: ${teams.join(', ')}.`,
		)
	}
	refuseActiveReference(name, config.shareWithRefs, readDrafts(draftsFile))
	const { [name]: _removed, ...contacts } = config.contacts
	config.contacts = Object.keys(contacts).length > 0 ? contacts : undefined
	writeConfig(config, configFile)
	console.log(`Removed contact ${name}.`)
}

export function contactListCommand(
	options: JsonOptions,
	file: string = configPath(),
): void {
	const contacts = sortedRecord(readConfig(file).contacts ?? {})
	if (options.json) {
		console.log(JSON.stringify({ contacts }, null, 2))
		return
	}
	const entries = Object.entries(contacts)
	if (entries.length === 0) {
		console.log('No contacts.')
		return
	}
	for (const [name, identityKey] of entries) {
		console.log(`${name}  ${identityKey}`)
	}
}

export function teamSetCommand(
	nameValue: string,
	memberValues: string[],
	file: string = configPath(),
): void {
	const name = normalizeReaderName(nameValue)
	const config = readConfig(file)
	if (config.contacts?.[name]) {
		throw new CliError(`"${name}" is already a contact name.`)
	}
	const members = requireContacts(memberValues, config.contacts)
	config.teams = { ...config.teams, [name]: members }
	writeConfig(config, file)
	console.log(`Team ${name}: ${members.join(', ')}`)
}

export function teamAddCommand(
	nameValue: string,
	memberValues: string[],
	file: string = configPath(),
): void {
	const name = normalizeReaderName(nameValue)
	const config = readConfig(file)
	if (config.contacts?.[name]) {
		throw new CliError(`"${name}" is already a contact name.`)
	}
	const added = requireContacts(memberValues, config.contacts)
	const members = [...new Set([...(config.teams?.[name] ?? []), ...added])]
	config.teams = { ...config.teams, [name]: members }
	writeConfig(config, file)
	console.log(`Team ${name}: ${members.join(', ')}`)
}

export function teamRemoveCommand(
	nameValue: string,
	memberValues: string[],
	file: string = configPath(),
): void {
	const name = normalizeReaderName(nameValue)
	const config = readConfig(file)
	const current = config.teams?.[name]
	if (!current) throw new CliError(`Unknown team "${name}".`)
	const removing = requireContacts(memberValues, config.contacts)
	const missing = removing.filter((member) => !current.includes(member))
	if (missing.length > 0) {
		throw new CliError(
			`Team "${name}" does not include: ${missing.join(', ')}.`,
		)
	}
	const members = current.filter((member) => !removing.includes(member))
	config.teams = { ...config.teams, [name]: members }
	writeConfig(config, file)
	console.log(`Team ${name}: ${members.join(', ') || '(empty)'}`)
}

export function teamDeleteCommand(
	nameValue: string,
	configFile: string = configPath(),
	draftsFile: string = draftsPath(),
): void {
	const name = normalizeReaderName(nameValue)
	const config = readConfig(configFile)
	if (!config.teams?.[name]) throw new CliError(`Unknown team "${name}".`)
	refuseActiveReference(name, config.shareWithRefs, readDrafts(draftsFile))
	const { [name]: _removed, ...teams } = config.teams
	config.teams = Object.keys(teams).length > 0 ? teams : undefined
	writeConfig(config, configFile)
	console.log(`Deleted team ${name}.`)
}

export function teamListCommand(
	nameValue: string | undefined,
	options: JsonOptions,
	file: string = configPath(),
): void {
	const config = readConfig(file)
	if (nameValue) {
		const name = normalizeReaderName(nameValue)
		const contacts = config.teams?.[name]
		if (!contacts) throw new CliError(`Unknown team "${name}".`)
		const identityKeys = resolveNamedReaders([name], config)
		if (options.json) {
			console.log(JSON.stringify({ name, contacts, identityKeys }, null, 2))
			return
		}
		console.log(`${name}:`)
		for (const contact of contacts) {
			console.log(`  ${contact}  ${config.contacts?.[contact]}`)
		}
		if (contacts.length === 0) console.log('  (empty)')
		return
	}

	const teams = sortedRecord(config.teams ?? {})
	if (options.json) {
		console.log(JSON.stringify({ teams }, null, 2))
		return
	}
	const entries = Object.entries(teams)
	if (entries.length === 0) {
		console.log('No teams.')
		return
	}
	for (const [name, contacts] of entries) {
		console.log(`${name}: ${contacts.join(', ') || '(empty)'}`)
	}
}

function requireContacts(
	values: readonly string[],
	contacts: Record<string, string> | undefined,
): string[] {
	const names = [...new Set(values.map(normalizeReaderName))]
	for (const name of names) {
		if (!contacts?.[name]) {
			throw new CliError(`Unknown contact "${name}". Add the contact first.`)
		}
	}
	return names
}

function refuseActiveReference(
	name: string,
	defaultRefs: string[] | undefined,
	drafts: ReturnType<typeof readDrafts>,
): void {
	if (defaultRefs?.includes(name)) {
		throw new CliError(
			`Cannot remove "${name}" while it is a default reader. Run bitplan config --clear-share-with first.`,
		)
	}
	const files = Object.entries(drafts.files)
		.filter(([, record]) => record.shareWithRefs?.includes(name))
		.map(([file]) => file)
	if (files.length > 0) {
		throw new CliError(
			`Cannot remove "${name}" while attached to a local draft: ${files.join(', ')}. Publish that draft with --private first.`,
		)
	}
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
	return Object.fromEntries(
		Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
	)
}
