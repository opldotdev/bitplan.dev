#!/usr/bin/env bun
/**
 * Mint a self-signed bearer token for gateway.bitplan.dev from a WIF.
 * Prints the token and nothing else. Never prints the key.
 *
 *   bun token.ts --wif <WIF>                       # session token, 24 h, all /v1/* routes
 *   bun token.ts --wif <WIF> --origin https://...  # session token for another origin
 *   bun token.ts --wif <WIF> --path /v1/account    # per-request token, 5 min
 *
 * Run `bun install` in this directory once.
 */
import { getAuthToken } from "bitcoin-auth"

function flag(name: string): string | undefined {
	const argv = process.argv.slice(2)
	const i = argv.indexOf(`--${name}`)
	if (i === -1) return undefined
	const value = argv[i + 1]
	if (value === undefined || value.startsWith("--"))
		throw new Error(`--${name} requires a value`)
	return value
}

const wif = flag("wif")
if (!wif) throw new Error("--wif is required")
const path = flag("path")
const origin = flag("origin") ?? "https://gateway.bitplan.dev"
const requestPath = path ?? `${origin}/v1`

process.stdout.write(
	`${getAuthToken({ privateKeyWif: wif, requestPath, scheme: "brc77" })}\n`,
)
