import { readConfig, writeConfig } from '../state.js'
import { connectWallet } from '../wallet.js'

export interface AuthOptions {
	walletUrl?: string
}

/**
 * Connects to a BRC-100 wallet. `--wallet-url` is remembered in
 * ~/.bitplan/config.json.
 */
export async function authCommand(options: AuthOptions): Promise<void> {
	const { url, version } = await connectWallet(options.walletUrl)

	if (options.walletUrl) {
		writeConfig({ ...readConfig(), walletUrl: options.walletUrl })
		console.log(`Saved walletUrl to ~/.bitplan/config.json`)
	}

	console.log(`Wallet:  ${url} (connected)`)
	console.log(`Version: ${version}`)
}
