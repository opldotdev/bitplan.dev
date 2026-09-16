# Changelog

## 0.0.1

- First release: gateway.bitplan.dev as an OpenCode provider (`bitplan`).
- Connect a BRC-100 wallet from OpenCode's connect dialog; the wallet signs
  the 24-hour bearer and the plugin re-signs it before expiry.
- Every model call pays a 402 challenge from the wallet and retries once,
  with `x-gateway-deposit: exact` so only the shortfall is paid.
- Models come from `GET /v1/models`, recommended first; image models and
  BYOK-only models (unless opted in) are skipped.
