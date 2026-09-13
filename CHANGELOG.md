# Changelog

## Unreleased

### Added

- Hosted inline text editing with encrypted per-passage updates, conflict
  recovery, and reload persistence. This edits text leaves, not arbitrary rich text.
- Inline annotation replies and room-profile mentions, plus curated stickers
  and pending image-generation requests for an agent to fulfill.
- A Decision starter alongside refreshed Brief, Terminal, and Blank templates.

- Package the canonical BitPlan skill as a Claude Code, Codex, and Grok plugin
  so external catalogs can install it without copying the skill.
- Wire Lisa’s accepted BitPlan emblem into the Codex plugin as `composerIcon`
  and `logo` (`assets/icon.png` and `assets/logo.png`, same 512×512 bytes).

### Changed

- Added internal encrypted annotation checkpoint parsing/replay and no-send
  multi-output signing helpers. These are not yet connected to native Publish;
  transaction journaling, lineage verification, and verified handles remain pending.
- Decrypted plans start collaboration automatically after loading a character.
  Existing invitations are preserved; failed connections can be retried.
- Publishing options distinguish hosted encryption senders from wallets holding
  the latest ordinal and copy a public-plan-ID-only agent handoff.
- Starter actions say “Start with {plan name}”; templates lead with project
  questions and a public-ID-only agent prompt. Live collaboration reads include
  materialized text edits; whole-document writes require the observed cursor.
- Document the wallet selection contract: prefer an existing BRC-100 wallet
  and do not present the current 1Sat wallet-storage server as a compatible
  BitPlan fallback.

## 0.0.17 — 2026-09-04

### Fixed

- Keep a hosted plan's reader key in the browser URL when the plan moves to
  the chain, so the same link still opens without a wallet.
- Make `bitplan fetch <plan> --version <n>` fetch the requested plan version.

## 0.0.16 — 2026-09-04

### Added

- Add `bitplan catalog sync` and best-effort encrypted catalog updates after hosted uploads and inscriptions.
- Save repository metadata and hosted-origin provenance needed for cross-device discovery and recovery.

### Fixed

- Keep the hosted write credential when an on-chain publication succeeds but its hosted redirect fails, then let the same `bitplan inscribe h_…` command repair the redirect without publishing again.
- Refuse remote cleartext HTTP site URLs while retaining loopback HTTP for local development.
