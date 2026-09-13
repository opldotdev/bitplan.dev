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

### Hosted collaboration (preview)

Set `NEXT_PUBLIC_CONVEX_URL` to the deployed collaboration backend. Opening a
decrypted plan starts a room automatically once a character is selected or loaded.
An existing invitation joins its room; a document-only link starts a separate
room and cannot reveal annotations from another room. Share the full invitation
to collaborate together. Failed connections offer Retry in the character menu.
Right-click the document → **Add Annotation** → type at the anchor → **Save**.
Saved notes stream through Convex to connected clients and survive reloads.
Text/element-relative anchors follow scrolling and responsive layout; a small
pin preserves the exact target when an edge forces the note card to flip.
Notes remain bound to their original document content hash, not silently moved
to an edited version. HTML and image annotations remain available in the panel.

Actual document clicks (including agent-browser clicks) update an encrypted
session location and click counter. The latest location and last click are
retained in Convex; this is not a complete click-history log. Presence reports
connection status separately, and disconnected locations are labeled “last seen.”
No location is invented before a session interacts. These hosted operations
do not inscribe anything or prove that an agent is still executing.

Focused checks:

```sh
bun test apps/web/src/lib/annotation-bridge.test.ts apps/web/src/lib/annotation-position.test.ts
NEXT_PUBLIC_CONVEX_URL=https://wary-wildebeest-416.convex.cloud bun apps/web/scripts/collaboration-smoke.ts
```

The second check creates a small encrypted development room and verifies
cross-client updates, authorization, stale-write rejection, and retained click
locations after disconnect. It refuses to run against another deployment.

### Document and wallet boundaries

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
