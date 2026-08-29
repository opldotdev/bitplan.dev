import { ORIGINATOR } from '../constants.js'
import { connectWallet, errorMessage, identityKey } from '../wallet.js'

export interface WhoamiOptions {
	json?: boolean
	walletUrl?: string
}

export async function whoamiCommand(options: WhoamiOptions): Promise<void> {
	const { wallet, url, version } = await connectWallet(options.walletUrl)

	const key = await identityKey(wallet)

	let network: string | null = null
	try {
		network = (await wallet.getNetwork({})).network
	} catch (error) {
		// A wallet that answers getVersion but not getNetwork is unusual but
		// not fatal — the identity key is what this command is really for.
		network = `unavailable (${errorMessage(error)})`
	}

	if (options.json) {
		console.log(
			JSON.stringify(
				{
					connected: true,
					walletUrl: url,
					walletVersion: version,
					network,
					identityKey: key,
					originator: ORIGINATOR,
				},
				null,
				2,
			),
		)
		return
	}

	console.log(`Wallet:       ${url} (connected)`)
	console.log(`Version:      ${version}`)
	console.log(`Network:      ${network}`)
	console.log(`Identity key: ${key}`)
	console.log(`Originator:   ${ORIGINATOR}`)
}
