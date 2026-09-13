import { syncAddressBook } from '../address-book-sync.js'
import { CliError } from '../errors.js'
import { resolveSiteUrl } from '../hosted.js'
import { readConfig } from '../state.js'
import { connectWallet } from '../wallet.js'

export async function addressBookSyncCommand(options: {
	yes?: boolean
	walletUrl?: string
	siteUrl?: string
}): Promise<void> {
	if (!options.yes)
		throw new CliError(
			'This uploads an owner-encrypted snapshot of your contacts and teams, replacing your previous synced book. Review bitplan contact list and bitplan team list, then run bitplan contacts sync --yes. It does not share your book with any plan.',
		)
	const config = readConfig()
	const { wallet } = await connectWallet(options.walletUrl)
	await syncAddressBook(
		wallet,
		resolveSiteUrl(options.siteUrl ?? config.siteUrl),
		{ schema: 1, contacts: config.contacts ?? {}, teams: config.teams ?? {} },
	)
	console.log(
		'Contacts synced privately. Open Share → Your contacts with the same wallet. No plan access changed.',
	)
}
