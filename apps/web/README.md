# BitPlan web

The Next.js viewer and documentation site for BitPlan.

The site resolves encrypted BitPlan inscriptions through OrdFS. The connected
BSV wallet decrypts private drafts or unwraps a shared document key; shared
payload decryption then runs locally with `@bsv/sdk`. Plaintext drafts are not
sent to or stored by the application server.

## Development

From the repository root:

```bash
bun install
bun run --cwd apps/web dev
```

The development server is normally available at <http://localhost:3000>.
Do not start another server if one is already running.

## Checks

```bash
bun run --cwd apps/web check
bun run --cwd apps/web build
bun test apps/web/src
```

The files in `src/components/ui` are stock shadcn registry components. Product
components should compose those primitives rather than duplicating them.

## Important boundaries

- Draft routes are under `/d/<origin>`.
- `/ordfs/*` is a read-only rewrite to `https://api.1sat.app`.
- Identity-key cryptography belongs to BRC-100 wallet APIs. Shared payloads use
  `@bsv/sdk`'s `SymmetricKey`; the web app must not implement its own cipher.
- Publishing is permanent. Never add a cleartext publishing path.
