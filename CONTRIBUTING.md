# Contributing to BitPlan

Thank you for helping improve BitPlan.

## Before you start

- Search existing issues before opening a new one.
- Use an issue for changes that alter the envelope format, wallet protocols,
  on-chain behavior, or public CLI commands.
- Never include wallet databases, credentials, private keys, decrypted drafts,
  or real user transaction data in an issue, fixture, commit, or screenshot.

## Development setup

Install [Bun](https://bun.sh/) 1.3.14, then run:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test
bun run build
```

Node.js 22.12 or newer is also required to exercise the packaged CLI exactly
as users run it.

## Project rules

- Keep encryption, identity private keys, transaction signing, and funding in
  the BRC-100 wallet.
- There is no cleartext publishing mode. Encrypted publishing must still run
  the secret scanner because ciphertext is permanent.
- Treat a successful wallet publish as authoritative. A secondary relay or
  local-state failure must not encourage users to publish the same version
  again accidentally.
- Render decrypted HTML only in the sandboxed viewer iframe.
- Compose the stock shadcn components in `apps/web/src/components/ui`; do not
  replace registry components with lookalike primitives.
- Do not run a real publish as part of automated testing. Wallet and network
  boundaries should be mocked unless an irreversible smoke test has been
  explicitly approved.

## Pull requests

Keep changes focused and explain any user-visible or compatibility impact. A
pull request should include relevant tests and pass all repository checks:

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

If a change affects the CLI package, update its README and changelog. If it
changes the envelope, update both implementations, the envelope specification,
and the cross-runtime compatibility tests in the same pull request.

## Security reports

Use GitHub private vulnerability reporting for security issues. Do not include
real private keys, wallet databases, decrypted plans, or live credentials.
