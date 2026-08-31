import { normalizeIdentityKey } from './envelope.js'
import { CliError } from './errors.js'
import type { ConfigFile } from './state.js'

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const IDENTITY_KEY_SHAPE = /^(02|03)[0-9a-f]{64}$/i

export interface ResolvedReaders {
	rawKeys: string[]
	namedRefs: string[]
	keys: string[]
}

export function normalizeReaderName(value: string): string {
	const name = value.trim().toLowerCase()
	if (!NAME_PATTERN.test(name)) {
		throw new CliError(
			`Invalid name "${value}": use 1-64 letters, numbers, dots, dashes, or underscores, starting with a letter or number.`,
		)
	}
	return name
}

export function resolveReaderInputs(
	values: readonly string[],
	config: ConfigFile,
): ResolvedReaders {
	const rawKeys: string[] = []
	const namedRefs: string[] = []
	for (const value of values) {
		if (IDENTITY_KEY_SHAPE.test(value.trim())) {
			rawKeys.push(normalizeIdentityKey(value))
			continue
		}
		const name = normalizeReaderName(value)
		if (!config.contacts?.[name] && !config.teams?.[name]) {
			throw new CliError(
				`Unknown contact or team "${name}". Add it first, or pass a wallet identity key.`,
			)
		}
		namedRefs.push(name)
	}
	const uniqueRaw = [...new Set(rawKeys)]
	const uniqueRefs = [...new Set(namedRefs)]
	return {
		rawKeys: uniqueRaw,
		namedRefs: uniqueRefs,
		keys: [
			...new Set([...uniqueRaw, ...resolveNamedReaders(uniqueRefs, config)]),
		],
	}
}

export function resolveNamedReaders(
	refs: readonly string[],
	config: ConfigFile,
): string[] {
	const keys: string[] = []
	for (const value of refs) {
		const name = normalizeReaderName(value)
		const contact = config.contacts?.[name]
		if (contact) {
			keys.push(normalizeIdentityKey(contact))
			continue
		}
		const team = config.teams?.[name]
		if (!team) {
			throw new CliError(
				`Unknown contact or team "${name}". Update the draft or restore that local name before publishing.`,
			)
		}
		for (const member of team) {
			const identityKey = config.contacts?.[member]
			if (!identityKey) {
				throw new CliError(
					`Team "${name}" references missing contact "${member}".`,
				)
			}
			keys.push(normalizeIdentityKey(identityKey))
		}
	}
	return [...new Set(keys)]
}

export function readerLabel(identityKey: string, config: ConfigFile): string {
	const names = Object.entries(config.contacts ?? {})
		.filter(([, key]) => key === identityKey)
		.map(([name]) => name)
	return names.length > 0 ? names.join(', ') : identityKey
}
