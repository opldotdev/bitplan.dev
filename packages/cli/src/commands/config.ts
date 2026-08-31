import { normalizeIdentityKey } from '../envelope.js'
import { CliError } from '../errors.js'
import { readConfig, writeConfig } from '../state.js'

export interface ConfigOptions {
	clearShareWith?: boolean
	shareWith?: string[]
}

export function configCommand(options: ConfigOptions, file?: string): void {
	if (options.clearShareWith && (options.shareWith?.length ?? 0) > 0) {
		throw new CliError(
			'--share-with and --clear-share-with cannot be used together.',
		)
	}

	const config = readConfig(file)
	if (options.clearShareWith) {
		delete config.shareWith
		writeConfig(config, file)
	} else if ((options.shareWith?.length ?? 0) > 0) {
		config.shareWith = [
			...new Set((options.shareWith ?? []).map(normalizeIdentityKey)),
		]
		writeConfig(config, file)
	}

	const readers = config.shareWith ?? []
	if (readers.length === 0) {
		console.log('Default readers: none')
		return
	}

	console.log('New plans are shared with:')
	for (const identityKey of readers) console.log(identityKey)
}
