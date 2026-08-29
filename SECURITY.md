# Security policy

## Supported versions

Security fixes target the current `master` branch and the latest `bitplan`
release on npm. Older prerelease versions may not receive fixes.

## Reporting a vulnerability

Do not open a public GitHub issue or publish an on-chain demonstration.

Use GitHub's private vulnerability reporting from the repository's **Security**
tab. If that option is unavailable, contact the maintainers through the
[OPL GitHub organization](https://github.com/opldotdev) and request a private
reporting channel before sharing details.

Please include:

- the affected component and version;
- impact and prerequisites;
- minimal reproduction steps using mock data;
- suggested remediation, if known.

Wallet permission bypasses, private-key exposure, incorrect encryption,
cross-recipient decryption, secret-scanner bypasses, unsafe HTML execution, and
transaction-signing confusion are considered security-sensitive.

Never include real private keys, wallet databases, decrypted plans, or live
credentials in a report.
