/**
 * Hosted drafts: the same envelope, stored by bitplan.dev instead of the chain.
 *
 * Auth is a 32-byte secret the CLI mints at create time. The server only ever
 * sees ciphertext and the public envelope header.
 */

import { Buffer } from 'node:buffer'
import { CONTENT_TYPE, HOSTED_API_URL, VIEWER_BASE_URL } from './constants.js'
import { CliError } from './errors.js'

export const HOSTED_ID = /^h_[A-Za-z0-9_-]{20}$/

export function isHostedId(value: string): boolean {
	return HOSTED_ID.test(value)
}

/** 64 hex, 32 random bytes (webcrypto). */
export function newHostedSecret(): string {
	const bytes = new Uint8Array(32)
	globalThis.crypto.getRandomValues(bytes)
	return Buffer.from(bytes).toString('hex')
}

/** `Bearer ${base64url(bytes)}` */
export function hostedAuthHeader(secretHex: string): string {
	const bytes = secretBytes(secretHex)
	return `Bearer ${Buffer.from(bytes).toString('base64url')}`
}

export function hostedViewerUrl(id: string): string {
	return `${VIEWER_BASE_URL}/${id}`
}

export function hostedContentUrl(
	siteUrl: string,
	id: string,
	seq: number,
): string {
	return `${siteOrigin(siteUrl)}/ordfs/content/${id}:${seq}`
}

export function resolveSiteUrl(override?: string): string {
	if (override) return siteOrigin(override)
	return new URL(HOSTED_API_URL).origin
}

function siteOrigin(siteUrl: string): string {
	let url: URL
	try {
		url = new URL(siteUrl)
	} catch {
		throw new CliError(
			`Invalid --site-url: ${JSON.stringify(siteUrl)}. Expected an https origin.`,
		)
	}
	assertHttpsSiteUrl(url)
	return url.origin
}

/**
 * Never send a catalog bearer (or hosted secret) to cleartext remote HTTP.
 * HTTPS is required; plain HTTP is allowed only for explicit loopback
 * development origins: localhost, 127.0.0.1, or ::1.
 */
export function assertHttpsSiteUrl(url: URL): void {
	if (url.protocol === 'https:') return
	if (url.protocol !== 'http:') {
		throw new CliError(
			`Invalid site URL ${JSON.stringify(url.toString())}: expected https.`,
		)
	}
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return
	throw new CliError(
		`Refusing cleartext http site URL for ${JSON.stringify(url.host)}: use https, or http only for localhost development.`,
	)
}

export async function createHostedDraft(
	siteUrl: string,
	secretHex: string,
	envelope: Uint8Array,
): Promise<{ id: string; version: number }> {
	const response = await hostedRequest(hostedApiUrl(siteUrl), {
		method: 'POST',
		headers: {
			'content-type': CONTENT_TYPE,
			authorization: hostedAuthHeader(secretHex),
		},
		body: Buffer.from(envelope),
	})
	const body = await readJson(response)
	if (typeof body.id !== 'string' || !isHostedId(body.id)) {
		throw new CliError('Hosted API returned an invalid hosted id.')
	}
	return { id: body.id, version: requireVersion(body.version) }
}

export async function appendHostedVersion(
	siteUrl: string,
	id: string,
	secretHex: string,
	envelope: Uint8Array,
	baseVersion: number | null,
): Promise<{ version: number }> {
	const headers: Record<string, string> = {
		'content-type': CONTENT_TYPE,
		authorization: hostedAuthHeader(secretHex),
	}
	if (baseVersion !== null) {
		headers['X-Bitplan-Base-Version'] = String(baseVersion)
	}
	const response = await hostedRequest(`${hostedApiUrl(siteUrl)}/${id}`, {
		method: 'POST',
		headers,
		body: Buffer.from(envelope),
	})
	const body = await readJson(response)
	return { version: requireVersion(body.version) }
}

export async function readHostedRecord(
	siteUrl: string,
	id: string,
): Promise<{ versions: number; origin: string | null }> {
	const response = await hostedRequest(`${hostedApiUrl(siteUrl)}/${id}`, {
		method: 'GET',
	})
	const body = await readJson(response)
	if (
		typeof body.versions !== 'number' ||
		!Number.isSafeInteger(body.versions) ||
		body.versions < 1
	) {
		throw new CliError('Hosted API returned an invalid version count.')
	}
	let origin: string | null = null
	if (body.origin !== null && body.origin !== undefined) {
		if (typeof body.origin !== 'string') {
			throw new CliError('Hosted API returned an invalid origin.')
		}
		origin = body.origin
	}
	return { versions: body.versions, origin }
}

export async function markHostedInscribed(
	siteUrl: string,
	id: string,
	secretHex: string,
	origin: string,
): Promise<void> {
	await hostedRequest(`${hostedApiUrl(siteUrl)}/${id}`, {
		method: 'PATCH',
		headers: {
			'content-type': 'application/json',
			authorization: hostedAuthHeader(secretHex),
		},
		body: JSON.stringify({ origin }),
	})
}

function hostedApiUrl(siteUrl: string): string {
	return `${siteOrigin(siteUrl)}/api/hosted`
}

function secretBytes(secretHex: string): Uint8Array {
	if (!/^[0-9a-f]{64}$/i.test(secretHex)) {
		throw new CliError('Hosted draft secret must be 64 hex characters.')
	}
	return Buffer.from(secretHex, 'hex')
}

async function hostedRequest(
	url: string,
	init: RequestInit,
): Promise<Response> {
	let response: Response
	try {
		response = await fetch(url, init)
	} catch (error) {
		throw new CliError(
			`Could not reach hosted API at ${url}: ${errorMessage(error)}`,
		)
	}
	if (!response.ok) await throwHostedError(response)
	return response
}

async function throwHostedError(response: Response): Promise<never> {
	const payload = await readErrorPayload(response)
	if (response.status === 409 && payload.error === 'version-conflict') {
		throw new CliError(
			`Another publish updated this hosted draft (now version ${payload.current}). Fetch it, merge, and publish again.`,
		)
	}
	const parts = [`Hosted API returned ${response.status}`]
	if (payload.error) parts.push(payload.error)
	if (payload.message) parts.push(payload.message)
	throw new CliError(parts.join(': '))
}

async function readErrorPayload(response: Response): Promise<{
	error?: string
	message?: string
	current?: number
}> {
	const text = await response.text()
	if (!text) return {}
	try {
		const body = JSON.parse(text) as Record<string, unknown>
		return {
			error: typeof body.error === 'string' ? body.error : undefined,
			message: typeof body.message === 'string' ? body.message : undefined,
			current: typeof body.current === 'number' ? body.current : undefined,
		}
	} catch {
		return {}
	}
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	try {
		const body: unknown = await response.json()
		if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
			return body as Record<string, unknown>
		}
	} catch {
		// Fall through.
	}
	throw new CliError('Hosted API returned a response that was not JSON.')
}

function requireVersion(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new CliError('Hosted API returned an invalid version.')
	}
	return value
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error)
}
