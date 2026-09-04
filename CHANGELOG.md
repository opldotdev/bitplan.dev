# Changelog

## Unreleased

### Added

- Package the canonical BitPlan skill as a Claude Code, Codex, and Grok plugin
  so external catalogs can install it without copying the skill.

### Changed

- Document the wallet selection contract: prefer an existing BRC-100 wallet
  and do not present the current 1Sat wallet-storage server as a compatible
  BitPlan fallback.

## 0.0.17 — 2026-09-04

### Added

- Add `bitplan skill install`, a small wrapper that installs the official
  BitPlan agent skill through the Skills CLI. It does not connect to a wallet
  or handle wallet keys.

## 0.0.16 — 2026-09-04

### Added

- Add `bitplan catalog sync` and best-effort encrypted catalog updates after hosted uploads and inscriptions.
- Save repository metadata and hosted-origin provenance needed for cross-device discovery and recovery.

### Fixed

- Keep the hosted write credential when an on-chain publication succeeds but its hosted redirect fails, then let the same `bitplan inscribe h_…` command repair the redirect without publishing again.
- Refuse remote cleartext HTTP site URLs while retaining loopback HTTP for local development.
