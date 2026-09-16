/**
 * A failure the person can act on: wallet not running, wallet declined, token
 * expired, gateway refused the proof. The message never contains a token, a
 * signature, or a key.
 */
export class GatewayError extends Error {
	override readonly name = 'GatewayError'
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error)
}
