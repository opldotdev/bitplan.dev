import { describe, expect, test } from 'bun:test'
import { SECRET_PATTERNS, scanForSecrets } from '../src/secretScan.js'

function patterns(text: string): string[] {
	return scanForSecrets([{ source: 'doc.html', text }]).map((f) => f.pattern)
}

describe('secret scanner — true positives', () => {
	const cases: Array<[string, string]> = [
		[
			'private-key-block',
			'-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
		],
		['private-key-block', '-----BEGIN PRIVATE KEY-----'],
		['wif-private-key', 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ'],
		['aws-access-key-id', 'AKIAIOSFODNN7EXAMPLE'],
		[
			'aws-secret-access-key',
			'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
		],
		[
			'gcp-service-account-key',
			'{ "type": "service_account", "project_id": "x" }',
		],
		['gcp-api-key', 'AIzaSyD-1234567890abcdefghijklmnopqrstu'],
		['github-token', 'ghp_1234567890abcdefghijklmnopqrstuvwxyzAB'],
		['stripe-secret-key', 'sk_live_51H1234567890abcdefghij'],
		['stripe-secret-key', 'rk_test_51H1234567890abcdefghij'],
		['slack-token', 'xoxb-123456789012-123456789012-abcdefghijklmnopqrstuvwx'],
		[
			'slack-webhook',
			'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
		],
		[
			'jwt',
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
		],
		[
			'postgres-url-credentials',
			'postgres://admin:hunter2@db.internal:5432/app',
		],
		['postgresql-scheme', 'postgresql://admin:hunter2@db.internal:5432/app'],
		['mysql-url-credentials', 'mysql://root:toor@127.0.0.1:3306/app'],
		[
			'mongodb-url-credentials',
			'mongodb+srv://user:pass@cluster0.mongodb.net/test',
		],
		['redis-url-credentials', 'redis://default:sekret@cache.internal:6379'],
		['generic-hex-secret', 'api_key = "0123456789abcdef0123456789abcdef"'],
		[
			'generic-base64-secret',
			'SECRET: "Zm9vYmFyYmF6cXV1eENvcnJlY3RIb3JzZUJhdHRlcnk="',
		],
		['home-path-macos', 'see /Users/satchmo/code/bitplan.dev for details'],
		['home-path-linux', 'see /home/deploy/app/config for details'],
	]

	for (const [expected, text] of cases) {
		test(`${expected}: ${text.slice(0, 42)}`, () => {
			const found = patterns(text)
			expect(found.length).toBeGreaterThan(0)
			// The postgresql:// case is caught by the postgres pattern.
			const wanted =
				expected === 'postgresql-scheme' ? 'postgres-url-credentials' : expected
			expect(found).toContain(wanted)
		})
	}
})

describe('secret scanner — false positives', () => {
	const clean: Array<[string, string]> = [
		['ordinary prose', 'We will migrate the database next quarter.'],
		['a relative path', 'Open ./src/index.ts and change the port.'],
		['a public https URL', 'Docs live at https://example.com/guide/setup'],
		[
			'a database URL with no credentials',
			'postgres://db.internal:5432/app is the read replica',
		],
		[
			'a redis URL with no credentials',
			'redis://cache.internal:6379 holds the session store',
		],
		['a short hex value', 'commit abc1234 fixed it'],
		['a bare 40-char sha', `the sha is ${'a'.repeat(40)}`],
		['a token word with a short value', 'token = "abc123"'],
		['an uppercase constant', 'AKIA is the prefix AWS uses'],
		['a users path without a name', 'the /Users directory holds home folders'],
		['html markup', '<div class="secret-sauce">token pricing</div>'],
	]

	for (const [name, text] of clean) {
		test(`${name} is not a finding`, () => {
			expect(patterns(text)).toEqual([])
		})
	}
})

describe('secret scanner — findings', () => {
	const doc = [
		'<p>line one</p>',
		'<p>line two</p>',
		'<p>AKIAIOSFODNN7EXAMPLE</p>',
	].join('\n')

	test('reports the line the match is on', () => {
		const [finding] = scanForSecrets([{ source: 'plan.html', text: doc }])
		expect(finding?.line).toBe(3)
		expect(finding?.source).toBe('plan.html')
	})

	test('redacts the matched text', () => {
		const [finding] = scanForSecrets([{ source: 'plan.html', text: doc }])
		expect(finding?.excerpt).not.toContain('AKIAIOSFODNN7EXAMPLE')
		expect(finding?.excerpt).toContain('AKIA')
	})

	test('the waiver id is stable across unrelated edits', () => {
		const a = scanForSecrets([{ source: 'plan.html', text: doc }])
		const b = scanForSecrets([
			{ source: 'plan.html', text: `<h1>new heading</h1>\n${doc}` },
		])
		expect(a[0]?.id).toBe(b[0]?.id ?? '')
		expect(a[0]?.line).not.toBe(b[0]?.line ?? -1)
	})

	test('the waiver id changes when the secret changes', () => {
		const a = scanForSecrets([{ source: 'x', text: 'AKIAIOSFODNN7EXAMPLE' }])
		const b = scanForSecrets([{ source: 'x', text: 'AKIAIOSFODNN7EXAMPLF' }])
		expect(a[0]?.id).not.toBe(b[0]?.id)
	})

	test('the same secret twice is one finding', () => {
		const findings = scanForSecrets([
			{ source: 'x', text: 'AKIAIOSFODNN7EXAMPLE and AKIAIOSFODNN7EXAMPLE' },
		])
		expect(findings).toHaveLength(1)
	})

	test('scans every target it is given', () => {
		const findings = scanForSecrets([
			{ source: 'doc', text: 'clean' },
			{ source: 'metadata', text: '/Users/satchmo/plans' },
		])
		expect(findings.map((f) => f.source)).toEqual(['metadata'])
	})

	test('a pure-hex secret produces one finding, not two', () => {
		const findings = scanForSecrets([
			{ source: 'x', text: 'api_key = "0123456789abcdef0123456789abcdef"' },
		])
		expect(findings.map((f) => f.pattern)).toEqual(['generic-hex-secret'])
	})
})

describe('secret scanner — pattern set', () => {
	test('every pattern is global so all matches are found', () => {
		for (const pattern of SECRET_PATTERNS) {
			expect(pattern.regex.flags).toContain('g')
		}
	})

	test('pattern ids are unique', () => {
		const ids = SECRET_PATTERNS.map((p) => p.id)
		expect(new Set(ids).size).toBe(ids.length)
	})
})
