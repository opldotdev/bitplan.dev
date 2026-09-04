# Changelog

## Unreleased

### Added

- Package the canonical BitPlan skill as a Claude Code, Codex, and Grok plugin
  so external catalogs can install it without copying the skill.

### Changed

- Document the wallet selection contract: prefer an existing BRC-100 wallet
  and do not present the current 1Sat wallet-storage server as a compatible
  BitPlan fallback.

### Fixed

- Search every wallet-output page when BitPlan needs to find a plan, instead
  of stopping after the first 1,000 results.
- Warn before `--new` connects an existing file to a different draft. The
  earlier plan is not deleted and remains available by its origin.

## 0.0.16 — 2026-09-04

### Added

- Add `bitplan catalog sync` and best-effort encrypted catalog updates after hosted uploads and inscriptions.
- Save repository metadata and hosted-origin provenance needed for cross-device discovery and recovery.

### Fixed

- Keep the hosted write credential when an on-chain publication succeeds but its hosted redirect fails, then let the same `bitplan inscribe h_…` command repair the redirect without publishing again.
- Refuse remote cleartext HTTP site URLs while retaining loopback HTTP for local development.
