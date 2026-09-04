import { syncCatalog } from '../catalog.js'
import { resolveSiteUrl } from '../hosted.js'
import { readConfig } from '../state.js'
import { connectWallet } from '../wallet.js'

export interface CatalogSyncOptions {
	json?: boolean
	walletUrl?: string
	siteUrl?: string
}

export async function catalogSyncCommand(
	options: CatalogSyncOptions,
): Promise<void> {
	const config = readConfig()
	const site = resolveSiteUrl(options.siteUrl ?? config.siteUrl)
	const { wallet } = await connectWallet(options.walletUrl)

	const result = await syncCatalog(wallet, { siteUrl: site })

	if (options.json) {
		console.log(
			JSON.stringify(
				{
					synced: true,
					id: result.id,
					version: result.version,
					created: result.created,
					entries: result.entries,
				},
				null,
				2,
			),
		)
		return
	}

	console.log(
		`Catalog synced: ${result.id}  version ${result.version}  (${result.entries} ${result.entries === 1 ? 'entry' : 'entries'})`,
	)
}
