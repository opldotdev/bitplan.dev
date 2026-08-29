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

Copy `.env.example` to `.env.local` only when overriding the canonical site or
OrdFS gateway. Both defaults work without environment variables.

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
- `/ordfs/content/<origin>:<sequence>` is a GET/HEAD-only Route Handler. It
  validates the pointer, content type, envelope, and size before returning
  inert attachment bytes from the configured OrdFS gateway.
- Identity-key cryptography belongs to BRC-100 wallet APIs. Shared payloads use
  `@bsv/sdk`'s `SymmetricKey`; the web app must not implement its own cipher.
- Publishing is permanent. Never add a cleartext publishing path.

## Deployment

The production Vercel project uses `apps/web` as its Root Directory. Install
from the repository lockfile and run the package's normal build command:

```sh
bun install --frozen-lockfile
bun run build
```

Set `NEXT_PUBLIC_SITE_URL` to the public origin and
`NEXT_PUBLIC_ORDFS_GATEWAY_URL` to the OrdFS gateway when they differ from the
defaults in `.env.example`. Sponsorship checkout also needs a private Vercel
Blob store connected to the project. Vercel supplies the server-only
`BLOB_READ_WRITE_TOKEN`.

For self-hosting, build as above and run `bun run start`. The application needs
outbound HTTPS access to the configured OrdFS gateway.
