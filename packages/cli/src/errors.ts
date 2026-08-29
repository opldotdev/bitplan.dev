/**
 * A failure the user can act on. Printed as a bare message with exit code 1;
 * anything else is an unexpected bug and prints its stack.
 */
export class CliError extends Error {
	override readonly name = 'CliError'
}

export function cliError(message: string): CliError {
	return new CliError(message)
}
