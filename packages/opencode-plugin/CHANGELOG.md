# Changelog

## 0.0.4

- A 402 the wallet cannot pay now says how to continue: the exact amount,
  the account's paymail from the gateway's `fund` field, and the card page,
  with a note not to pick a cheaper model or shrink the request instead.

## 0.0.3

- Pays the gateway's 402 with x402 protocol version 2: the requirements are
  read from the `PAYMENT-REQUIRED` header (or the body) and the signed
  transaction goes back in `PAYMENT-SIGNATURE`; the legacy `X402-Proof`
  header is no longer sent.

## 0.0.2

- Default output limit lowered from 32,000 to 8,192 tokens so the gateway's
  up-front reserve for a first call stays at cents.
- When the wallet cannot pay a reserve, the error now says how much it is
  short by and how to fund it, instead of dumping the wallet call.

## 0.0.1

- First release: gateway.bitplan.dev as an OpenCode provider (`bitplan`).
- Connect a BRC-100 wallet from OpenCode's connect dialog; the wallet signs
  the 24-hour bearer and the plugin re-signs it before expiry.
- Every model call pays a 402 challenge from the wallet and retries once,
  with `x-gateway-deposit: exact` so only the shortfall is paid.
- Models come from `GET /v1/models`, recommended first; image models and
  BYOK-only models (unless opted in) are skipped.
