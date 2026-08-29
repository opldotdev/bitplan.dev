# Follow-ups

## From the Phase 1 review gate (all minor; 3 of 10 already fixed)

- [x] `upload`: confirm before sealing — wallet's BRC-2 dialog no longer fires pre-confirmation
- [x] `envelope`: wallet encrypt/decrypt refusals surface as CliError, not stack traces
- [x] `htmlPolicy`: attribution carries upstream's actual copyright line (t3dotgg)
- [ ] README: document `-y/--yes` (non-TTY note), `list --json`, `list --limit`
- [ ] `secretScan`: `generic-hex-secret` upper bound mislabels >128-char hex as base64 — use terminator lookahead
- [ ] `outpoint`: `splitOutpoint` accepts trailing junk after vout — validate with `/^([0-9a-f]{64})[._](\d+)$/i`
- [ ] `ordinals`: coin lookup capped at 1000 with no paging; page via `offset` or query by origin tag
- [ ] `upload --new`: warn before discarding a file's existing origin→keyID binding (recoverable via `--draft`)
- [ ] tsconfig: tests aren't typechecked — add `tsconfig.test.json` (`noEmit`) to CI
- [ ] ENVELOPE.md: document the 64 KB header ceiling the implementation enforces

## Phase backlog (from the proposal)

- [ ] Phase 2: bitplan.dev viewer (BRC-100 browser connect, ORDFS reads, client-side decrypt, noindex)
- [ ] Phase 3: `bitplan share --to <pubkey|BAP id>` (BRC-2 re-wrap, Sigma Identity directory)
- [ ] Follow-up tiers: link-fragment unlisted sharing, `--public` cleartext gate, embedded-wallet fallback
