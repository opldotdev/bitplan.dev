import { resolveReaderInputs } from '../addressBook.js'
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
		delete config.shareWithRefs
		writeConfig(config, file)
	} else if ((options.shareWith?.length ?? 0) > 0) {
		const readers = resolveReaderInputs(options.shareWith ?? [], config)
		config.shareWith = readers.rawKeys.length > 0 ? readers.rawKeys : undefined
		config.shareWithRefs =
			readers.namedRefs.length > 0 ? readers.namedRefs : undefined
		writeConfig(config, file)
	}

	const rawReaders = config.shareWith ?? []
	const namedReaders = config.shareWithRefs ?? []
	if (rawReaders.length === 0 && namedReaders.length === 0) {
		console.log('Default readers: none')
		return
	}

	console.log('New plans are shared with:')
	for (const name of namedReaders) console.log(name)
	for (const identityKey of rawReaders) console.log(identityKey)
}
