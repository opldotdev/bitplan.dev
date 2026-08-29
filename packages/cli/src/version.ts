import { createRequire } from 'node:module'

// Single source of truth for the version: package.json. Both `src/` (bun test)
// and `dist/` (the published bin) sit one level under the package root, so the
// same relative path resolves from either.
const require_ = createRequire(import.meta.url)
const pkg = require_('../package.json') as { version: string }

export const CLI_VERSION: string = pkg.version
