import { describe, expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import type { DraftPlaintext } from '../src/envelope.js'
import { openEnvelope, sealEnvelope } from '../src/envelope.js'
import {
	linkFragment,
	linkIdentityKey,
	linkUrl,
	linkWallet,
	newLinkSecret,
	parseLinkFragment,
} from '../src/link.js'

const PLAINTEXT: DraftPlaintext = {
	meta: {
		title: 'Reader link plan',
		description: null,
		repoOrg: null,
		repoName: null,
		repoHost: null,
		gitBranch: null,
		gitCommitSha: null,
		gitCommitSubject: null,
		gitDirty: null,
		cliVersion: '0.0.1',
		fileSha256: 'b'.repeat(64),
		createdAt: '2026-01-01T00:00:00.000Z',
	},
	html: '<!doctype html><title>Reader link plan</title><p>hello</p>',
}

describe('reader links', () => {
	test('round-trips a secret through the fragment', () => {
		const secret = newLinkSecret()
		expect(secret).toMatch(/^[0-9a-f]{64}$/)
		const fragment = linkFragment(secret)
		expect(fragment.startsWith('k=')).toBe(true)
		expect(fragment.slice(2)).toHaveLength(43)

		expect(parseLinkFragment(fragment)).toBe(secret)
		expect(parseLinkFragment(`#${fragment}`)).toBe(secret)
		expect(
			parseLinkFragment(
				`https://bitplan.dev/d/${'a'.repeat(64)}_0#${fragment}`,
			),
		).toBe(secret)
		expect(
			parseLinkFragment(linkUrl('https://bitplan.dev/d/origin', secret)),
		).toBe(secret)
	})

	test('parseLinkFragment rejects payloads that are not 32 bytes', () => {
		const tooShort = Buffer.alloc(31).toString('base64url')
		const tooLong = Buffer.alloc(33).toString('base64url')
		expect(parseLinkFragment(`k=${tooShort}`)).toBeNull()
		expect(parseLinkFragment(`k=${tooLong}`)).toBeNull()
		expect(parseLinkFragment(`#k=${tooShort}`)).toBeNull()
	})

	test('parseLinkFragment returns null for a URL without #k=', () => {
		expect(
			parseLinkFragment(`https://bitplan.dev/d/${'a'.repeat(64)}_0`),
		).toBeNull()
		expect(parseLinkFragment('k=')).toBeNull()
		expect(parseLinkFragment('not-a-link')).toBeNull()
	})

	test('linkWallet identity matches linkIdentityKey', async () => {
		const secret = newLinkSecret()
		const { publicKey } = await linkWallet(secret).getPublicKey({
			identityKey: true,
		})
		expect(publicKey).toBe(linkIdentityKey(secret))
	})

	test('linkWallet opens an envelope sealed for the link identity', async () => {
		const owner = new ProtoWallet(new PrivateKey(1))
		const secret = newLinkSecret()
		const envelope = await sealEnvelope(owner, PLAINTEXT, 'link-key', [
			linkIdentityKey(secret),
		])
		const opened = await openEnvelope(
			linkWallet(secret) as WalletInterface,
			envelope,
		)
		expect(opened.plaintext).toEqual(PLAINTEXT)
	})
})
