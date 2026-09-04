import { DEFAULT_ARCADE_POLICY_URL } from './constants.js'

export interface MiningFeePolicy {
	satoshis: number
	bytes: number
}

export type PolicyFetcher = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>

export interface FetchMiningFeeOptions {
	endpoint?: string
	fetcher?: PolicyFetcher
	timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 2_000

/**
 * Read Arcade's current public mining-fee floor. A missing, malformed, or
 * unreachable policy is deliberately represented as null so publishing can
 * continue without inventing a wallet fee.
 */
export async function fetchArcadeMiningFee(
	options: FetchMiningFeeOptions = {},
): Promise<MiningFeePolicy | null> {
	const endpoint = options.endpoint ?? DEFAULT_ARCADE_POLICY_URL
	const fetcher = options.fetcher ?? globalThis.fetch
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const controller = new AbortController()
	let timer: ReturnType<typeof setTimeout> | undefined

	try {
		const readPolicy = async (): Promise<MiningFeePolicy | null> => {
			const response = await fetcher(endpoint, {
				cache: 'no-store',
				headers: { accept: 'application/json' },
				signal: controller.signal,
			})
			if (!response.ok) return null

			const body: unknown = await response.json()
			return parseMiningFeePolicy(body)
		}
		const response = await Promise.race([
			readPolicy(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					controller.abort()
					reject(new Error('Arcade policy request timed out.'))
				}, timeoutMs)
			}),
		])
		return response
	} catch {
		return null
	} finally {
		if (timer !== undefined) clearTimeout(timer)
		controller.abort()
	}
}

/** Validate the exact numeric shape required by Arcade's policy response. */
function parseMiningFeePolicy(body: unknown): MiningFeePolicy | null {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null
	const policy = (body as { policy?: unknown }).policy
	if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
		return null
	}
	const miningFee = (policy as { miningFee?: unknown }).miningFee
	if (!miningFee || typeof miningFee !== 'object' || Array.isArray(miningFee)) {
		return null
	}
	const { satoshis, bytes } = miningFee as {
		satoshis?: unknown
		bytes?: unknown
	}
	if (
		typeof satoshis !== 'number' ||
		!Number.isSafeInteger(satoshis) ||
		satoshis < 0 ||
		typeof bytes !== 'number' ||
		!Number.isSafeInteger(bytes) ||
		bytes <= 0
	) {
		return null
	}
	return { satoshis, bytes }
}

/**
 * Estimate only the encrypted payload's cost at the current network floor.
 * This intentionally excludes transaction overhead and wallet-specific fees.
 */
export function estimatePayloadCostAtNetworkFloor(
	payloadBytes: number,
	miningFee: MiningFeePolicy,
): number {
	assertPayloadBytes(payloadBytes)
	assertMiningFee(miningFee)

	// BigInt keeps the ceiling exact when a policy uses a non-1000-byte unit or
	// when a large payload would lose precision in number multiplication.
	const numerator = BigInt(payloadBytes) * BigInt(miningFee.satoshis)
	const denominator = BigInt(miningFee.bytes)
	const rounded = (numerator + denominator - 1n) / denominator
	const result = Number(rounded)
	if (!Number.isSafeInteger(result)) {
		throw new RangeError('Estimated payload cost exceeds safe integer range.')
	}
	return result
}

/** Sum independently rounded envelope estimates for multi-version writes. */
export function estimatePayloadCostAtNetworkFloorForPayloads(
	payloads: readonly number[],
	miningFee: MiningFeePolicy,
): number {
	let total = 0
	for (const payloadBytes of payloads) {
		const next =
			total + estimatePayloadCostAtNetworkFloor(payloadBytes, miningFee)
		if (!Number.isSafeInteger(next)) {
			throw new RangeError('Estimated payload cost exceeds safe integer range.')
		}
		total = next
	}
	return total
}

/** Return null when a valid policy cannot be represented as a safe estimate. */
export function estimatePayloadCostAtNetworkFloorOrNull(
	payloadBytes: number,
	miningFee: MiningFeePolicy,
): number | null {
	try {
		return estimatePayloadCostAtNetworkFloor(payloadBytes, miningFee)
	} catch {
		return null
	}
}

/** Null-safe multi-envelope estimate for confirmation display. */
export function estimatePayloadCostAtNetworkFloorForPayloadsOrNull(
	payloads: readonly number[],
	miningFee: MiningFeePolicy,
): number | null {
	try {
		return estimatePayloadCostAtNetworkFloorForPayloads(payloads, miningFee)
	} catch {
		return null
	}
}

function assertPayloadBytes(value: number): asserts value is number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError('Payload size must be a safe nonnegative integer.')
	}
}

function assertMiningFee(value: MiningFeePolicy): void {
	if (
		!value ||
		!Number.isSafeInteger(value.satoshis) ||
		value.satoshis < 0 ||
		!Number.isSafeInteger(value.bytes) ||
		value.bytes <= 0
	) {
		throw new RangeError('Mining fee policy is invalid.')
	}
}
