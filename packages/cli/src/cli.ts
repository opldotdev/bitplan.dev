#!/usr/bin/env node
/**
 * Published bin. Always run main(). Do not gate on import.meta.url vs
 * process.argv[1]: npx and bunx both install a symlink at .bin/bitplan, so
 * those paths never match and 0.0.1 exited after loading the bundle with
 * no output.
 */
import { CliError } from './errors.js'
import { main } from './index.js'

main(process.argv).catch((error: unknown) => {
	if (error instanceof CliError) {
		console.error(error.message)
		process.exit(1)
	}
	const code = (error as { code?: string } | null)?.code
	if (code === 'commander.helpDisplayed' || code === 'commander.version') {
		process.exit(0)
	}
	if (typeof code === 'string' && code.startsWith('commander.')) {
		console.error((error as Error).message)
		process.exit(1)
	}
	console.error(error instanceof Error ? error.stack : String(error))
	process.exit(1)
})
