# Changelog

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
