/**
 * Secret scanner.
 *
 * A bounded, deliberately boring regex set. It runs on the *plaintext* — the
 * HTML document and its metadata — even though everything bitplan publishes is
 * encrypted. Two reasons: the ciphertext is public forever, so any future break
 * in AES-256-GCM or in the wallet's key wrap exposes whatever was inside; and
 * an inscription cannot be recalled once it is mined.
 *
 * Each pattern is narrow enough to name its finding precisely. Anything that
 * matches blocks the upload; `--allow-finding <id>` waives exactly one finding,
 * identified by a hash of (source, pattern, matched text) so the id survives
 * edits elsewhere in the document.
 */

import { createHash } from 'node:crypto'

export interface SecretPattern {
	/** Stable, human-readable pattern id. */
	id: string
	/** What a match means, phrased for someone deciding whether to waive it. */
	description: string
	regex: RegExp
}

/**
 * Ordered so the most specific credential shapes report first. Every regex is
 * global + multiline; none of them backtrack catastrophically (no nested
 * unbounded quantifiers).
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
	{
		id: 'private-key-block',
		description: 'PEM private key block',
		regex: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
	},
	{
		id: 'wif-private-key',
		description: 'Bitcoin WIF private key',
		regex: /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/g,
	},
	{
		id: 'aws-access-key-id',
		description: 'AWS access key id',
		regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
	},
	{
		id: 'aws-secret-access-key',
		description: 'AWS secret access key',
		regex: /\baws_secret_access_key\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
	},
	{
		id: 'gcp-service-account-key',
		description: 'Google Cloud service account private key',
		regex: /"type"\s*:\s*"service_account"/g,
	},
	{
		id: 'gcp-api-key',
		description: 'Google API key',
		regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
	},
	{
		id: 'github-token',
		description: 'GitHub personal access / app token',
		regex: /\bgh[pousr]_[0-9A-Za-z]{36,255}\b/g,
	},
	{
		id: 'stripe-secret-key',
		description: 'Stripe secret or restricted key',
		regex: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,99}\b/g,
	},
	{
		id: 'slack-token',
		description: 'Slack token',
		regex: /\bxox[abposr]-[0-9A-Za-z-]{10,250}\b/g,
	},
	{
		id: 'slack-webhook',
		description: 'Slack incoming webhook URL',
		regex: /https:\/\/hooks\.slack\.com\/services\/[0-9A-Za-z/+]{20,200}/g,
	},
	{
		id: 'jwt',
		description: 'JSON Web Token',
		regex:
			/\beyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/g,
	},
	{
		id: 'postgres-url-credentials',
		description: 'PostgreSQL connection URL with credentials',
		regex: /\bpostgres(?:ql)?:\/\/[^\s:/@'"]+:[^\s:/@'"]+@[^\s'"]+/gi,
	},
	{
		id: 'mysql-url-credentials',
		description: 'MySQL connection URL with credentials',
		regex: /\bmysql:\/\/[^\s:/@'"]+:[^\s:/@'"]+@[^\s'"]+/gi,
	},
	{
		id: 'mongodb-url-credentials',
		description: 'MongoDB connection URL with credentials',
		regex: /\bmongodb(?:\+srv)?:\/\/[^\s:/@'"]+:[^\s:/@'"]+@[^\s'"]+/gi,
	},
	{
		id: 'redis-url-credentials',
		description: 'Redis connection URL with credentials',
		regex: /\brediss?:\/\/[^\s:/@'"]*:[^\s:/@'"]+@[^\s'"]+/gi,
	},
	{
		id: 'generic-hex-secret',
		description: 'Long hex value assigned to a key/token/secret name',
		regex:
			/\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[=:]\s*["']?([0-9a-f]{32,})\b/gi,
	},
	{
		id: 'generic-base64-secret',
		description: 'Long base64 value assigned to a key/token/secret name',
		// The lookahead skips values that are pure hex — those are
		// already reported by `generic-hex-secret`, and one finding per secret
		// means one waiver per secret.
		regex:
			/\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[=:]\s*["']?(?![0-9a-f]{32,}(?:["'\s,;]|$))([A-Za-z0-9+/]{32,}={0,2})(?=["'\s,;]|$)/gi,
	},
	{
		id: 'home-path-macos',
		description: 'Absolute macOS home directory path',
		regex: /\/Users\/[A-Za-z0-9._-]+(?:\/|\b)/g,
	},
	{
		id: 'home-path-linux',
		description: 'Absolute Linux home directory path',
		regex: /\/home\/[A-Za-z0-9._-]+(?:\/|\b)/g,
	},
]

export interface SecretFinding {
	/** Stable waiver id: `<pattern>-<12 hex>`. */
	id: string
	pattern: string
	description: string
	/** Which document the match came from. */
	source: string
	line: number
	/** Redacted excerpt — enough to recognize, not enough to leak. */
	excerpt: string
}

export interface ScanTarget {
	source: string
	text: string
}

/** Scan one or more named documents. Findings are deduplicated by waiver id. */
export function scanForSecrets(targets: ScanTarget[]): SecretFinding[] {
	const findings = new Map<string, SecretFinding>()

	for (const target of targets) {
		const lineStarts = computeLineStarts(target.text)
		for (const pattern of SECRET_PATTERNS) {
			// Fresh RegExp per scan: the shared literals carry /g state.
			const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
			let match = regex.exec(target.text)
			while (match !== null) {
				const matched = match[0]
				const finding: SecretFinding = {
					id: findingId(target.source, pattern.id, matched),
					pattern: pattern.id,
					description: pattern.description,
					source: target.source,
					line: lineOf(lineStarts, match.index),
					excerpt: redact(matched),
				}
				if (!findings.has(finding.id)) findings.set(finding.id, finding)
				// Zero-length matches are impossible here, but guard anyway so a
				// future pattern edit cannot spin this loop forever.
				if (match.index === regex.lastIndex) regex.lastIndex++
				match = regex.exec(target.text)
			}
		}
	}

	return [...findings.values()].sort(
		(a, b) => a.source.localeCompare(b.source) || a.line - b.line,
	)
}

function findingId(source: string, pattern: string, matched: string): string {
	const digest = createHash('sha256')
		.update(`${source}\u0000${pattern}\u0000${matched}`)
		.digest('hex')
	return `${pattern}-${digest.slice(0, 12)}`
}

/** Keep the first 4 and last 2 characters; blank the middle. */
function redact(matched: string): string {
	const flat = matched.replace(/\s+/g, ' ')
	if (flat.length <= 10) return flat
	return `${flat.slice(0, 4)}...${flat.slice(-2)} (${flat.length} chars)`
}

function computeLineStarts(text: string): number[] {
	const starts = [0]
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') starts.push(i + 1)
	}
	return starts
}

function lineOf(lineStarts: number[], index: number): number {
	let low = 0
	let high = lineStarts.length - 1
	while (low < high) {
		const mid = Math.ceil((low + high) / 2)
		if ((lineStarts[mid] ?? 0) <= index) low = mid
		else high = mid - 1
	}
	return low + 1
}
