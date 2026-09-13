/** Portable CLI/browser contract. No config imports: only the CLI projects local data. */
import { PublicKey, type WalletInterface } from '@bsv/sdk'
import { assertSecureHttpUrl, readBoundedResponseBody } from './http'

const PROTOCOL: [2, string] = [2, 'bitplan address book']
const CONTENT_KEY = 'address-book-content-v1'
const MAX_BYTES = 512 * 1024
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/
const KEY = /^(02|03)[0-9a-f]{64}$/
export interface PrivateAddressBook {
	schema: 1
	contacts: Record<string, string>
	teams: Record<string, string[]>
}
type BookWallet = Pick<WalletInterface, 'createHmac' | 'encrypt' | 'decrypt'>
type ReaderWallet = Pick<BookWallet, 'createHmac' | 'decrypt'>

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Strict allowlist prevents config defaults, hosted secrets or reader keys being uploaded. */
export function parseAddressBook(bytes: Uint8Array): PrivateAddressBook {
	if (bytes.length > MAX_BYTES) throw new Error('Address book is too large.')
	const value: unknown = JSON.parse(
		new TextDecoder('utf-8', { fatal: true }).decode(bytes),
	)
	if (
		!record(value) ||
		value.schema !== 1 ||
		Object.keys(value).sort().join(',') !== 'contacts,schema,teams' ||
		!record(value.contacts) ||
		!record(value.teams)
	) {
		throw new Error('Invalid address book schema.')
	}
	if (
		Object.keys(value.contacts).length > 1000 ||
		Object.keys(value.teams).length > 100
	)
		throw new Error('Address book has too many entries.')
	const contacts: Record<string, string> = Object.create(null)
	for (const [name, key] of Object.entries(value.contacts)) {
		if (
			!NAME.test(name) ||
			typeof key !== 'string' ||
			!KEY.test(key) ||
			PublicKey.fromString(key).toString() !== key
		)
			throw new Error('Invalid address book contact.')
		contacts[name] = key
	}
	const teams: Record<string, string[]> = Object.create(null)
	for (const [name, members] of Object.entries(value.teams)) {
		if (
			!NAME.test(name) ||
			Object.hasOwn(contacts, name) ||
			!Array.isArray(members) ||
			members.length > 1000 ||
			members.some(
				(member) =>
					typeof member !== 'string' || !Object.hasOwn(contacts, member),
			) ||
			new Set(members).size !== members.length
		)
			throw new Error('Invalid address book team.')
		teams[name] = members as string[]
	}
	return { schema: 1, contacts, teams }
}

function encode(book: PrivateAddressBook): Uint8Array {
	const bytes = new TextEncoder().encode(JSON.stringify(book))
	parseAddressBook(bytes)
	return bytes
}

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '')
}

/** Same storage service, independent capability + content keys from the draft catalog. */
export async function addressBookLocator(
	wallet: Pick<BookWallet, 'createHmac'>,
): Promise<{ id: string; bearer: string }> {
	const { hmac } = await wallet.createHmac({
		protocolID: PROTOCOL,
		keyID: 'address-book-capability-v1',
		counterparty: 'self',
		data: Array.from(
			new TextEncoder().encode('bitplan address book capability v1'),
		),
	})
	if (
		hmac.length !== 32 ||
		hmac.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
	)
		throw new Error('Invalid wallet capability.')
	const key = await globalThis.crypto.subtle.importKey(
		'raw',
		Uint8Array.from(hmac),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const derive = async (label: string) =>
		base64url(
			new Uint8Array(
				await globalThis.crypto.subtle.sign(
					'HMAC',
					key,
					new TextEncoder().encode(label),
				),
			),
		)
	return {
		id: `c_${await derive('bitplan address book locator v1')}`,
		bearer: await derive('bitplan address book write v1'),
	}
}

function endpoint(site: string, id: string): string {
	const url = new URL(site)
	assertSecureHttpUrl(url, 'address book')
	if (
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== '/'
	)
		throw new Error('Use the BitPlan site origin only.')
	return `${url.origin}/api/catalog/${id}`
}

async function readRemote(
	wallet: ReaderWallet,
	url: string,
	fetcher: typeof fetch,
): Promise<{ book: PrivateAddressBook | null; version: number }> {
	const response = await fetcher(url, {
		cache: 'no-store',
		credentials: 'omit',
		redirect: 'error',
		signal: AbortSignal.timeout(30_000),
	})
	if (response.status === 404) return { book: null, version: 0 }
	if (!response.ok)
		throw new Error(`Could not load address book (${response.status}).`)
	const version = Number(response.headers.get('x-bitplan-catalog-version'))
	if (!Number.isSafeInteger(version) || version < 1)
		throw new Error('Invalid address book version.')
	const ciphertext = await readBoundedResponseBody(
		response,
		600 * 1024,
		'Encrypted address book',
	)
	const { plaintext } = await wallet.decrypt({
		protocolID: PROTOCOL,
		keyID: CONTENT_KEY,
		counterparty: 'self',
		ciphertext: Array.from(ciphertext),
	})
	return { book: parseAddressBook(Uint8Array.from(plaintext)), version }
}

export async function loadAddressBook(
	wallet: ReaderWallet,
	site: string,
	fetcher: typeof fetch = fetch,
): Promise<PrivateAddressBook | null> {
	const { id } = await addressBookLocator(wallet)
	return (await readRemote(wallet, endpoint(site, id), fetcher)).book
}

/** Explicit one-way snapshot sync. Never retries over a concurrent writer or merges silently. */
export async function syncAddressBook(
	wallet: BookWallet,
	site: string,
	book: PrivateAddressBook,
	fetcher: typeof fetch = fetch,
): Promise<void> {
	const plaintext = encode(book)
	const { id, bearer } = await addressBookLocator(wallet)
	const url = endpoint(site, id)
	const remote = await readRemote(wallet, url, fetcher)
	const { ciphertext } = await wallet.encrypt({
		protocolID: PROTOCOL,
		keyID: CONTENT_KEY,
		counterparty: 'self',
		plaintext: Array.from(plaintext),
	})
	if (!ciphertext.length || ciphertext.length > 600 * 1024)
		throw new Error('Invalid encrypted address book size.')
	const response = await fetcher(url, {
		method: 'PUT',
		credentials: 'omit',
		redirect: 'error',
		signal: AbortSignal.timeout(30_000),
		headers: {
			'content-type': 'application/x-bitplan-catalog',
			authorization: `Bearer ${bearer}`,
			'x-bitplan-base-version': String(remote.version),
		},
		body: Uint8Array.from(ciphertext),
	})
	if (response.status === 409)
		throw new Error(
			'Address book changed during sync. Review your local book and sync again.',
		)
	if (!response.ok)
		throw new Error(`Address book sync failed (${response.status}).`)
	const receipt: unknown = JSON.parse(
		new TextDecoder().decode(
			await readBoundedResponseBody(response, 4096, 'Address book receipt'),
		),
	)
	if (
		!record(receipt) ||
		receipt.id !== id ||
		receipt.version !== remote.version + 1
	)
		throw new Error(
			'Could not verify address book sync receipt. Check the hosted book before retrying.',
		)
}
