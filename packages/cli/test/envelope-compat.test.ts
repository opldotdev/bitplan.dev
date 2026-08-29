import { describe, expect, test } from 'bun:test'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'

import { openEnvelope as openWebEnvelope } from '../../../apps/web/src/lib/envelope'
import { type DraftPlaintext, sealEnvelope } from '../src/envelope.js'

const PLAINTEXT: DraftPlaintext = {
	html: '<!doctype html><title>Cross-reader fixture</title>',
	meta: {
		cliVersion: 'test',
		createdAt: '2026-08-29T00:00:00.000Z',
		description: null,
		fileSha256: '00',
		gitBranch: null,
		gitCommitSha: null,
		gitCommitSubject: null,
		gitDirty: null,
		repoHost: null,
		repoName: null,
		repoOrg: null,
		title: 'Cross-reader fixture',
	},
}

describe('CLI and website envelope compatibility', () => {
	test('the website opens private and shared envelopes produced by the CLI', async () => {
		const owner = new ProtoWallet(new PrivateKey(21))
		const recipient = new ProtoWallet(new PrivateKey(22))
		const recipientIdentity = (
			await recipient.getPublicKey({ identityKey: true })
		).publicKey

		const privateEnvelope = await sealEnvelope(
			owner,
			PLAINTEXT,
			'private-fixture',
		)
		const sharedEnvelope = await sealEnvelope(
			owner,
			PLAINTEXT,
			'shared-fixture',
			[recipientIdentity],
		)

		expect((await openWebEnvelope(owner, privateEnvelope)).plaintext).toEqual(
			PLAINTEXT,
		)
		expect(
			(await openWebEnvelope(recipient, sharedEnvelope)).plaintext,
		).toEqual(PLAINTEXT)
	})
})
