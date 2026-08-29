# Changelog

## 0.0.2

### Fixed

- `npx bitplan` and `bunx bitplan` with no arguments print usage. 0.0.1 loaded the bundle and exited because the bin gated on `import.meta.url === argv[1]`, which fails on the `.bin` symlink both tools install.

### Added

- `bitplan auth` / `bitplan auth login` connect to a BRC-100 wallet. `--wallet-url` is stored in `~/.bitplan/config.json`.
- Command descriptions match postplan (`upload`, `list`, `whoami`, plus `fetch`).
