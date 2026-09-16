# opencode-plugin-bitplan

[gateway.bitplan.dev](https://gateway.bitplan.dev) as a provider inside
[OpenCode](https://opencode.ai), paid from your BRC-100 wallet. Every model on
Vercel AI Gateway and OpenRouter, no API key: the wallet signs a bearer token,
and when the gateway asks for payment (HTTP 402) the wallet pays exactly what
the call needs and the request is retried with the proof.

The plugin never sees a private key. Identity, the token signature and the
payment are wallet calls over the local BRC-100 JSON API, the same calls the
`bitplan gateway` CLI command makes.

## Requirements

- OpenCode (a version whose plugin package exposes the `auth`, `provider` and
  `config` hooks; developed against `@opencode-ai/plugin` 1.18).
- A running BRC-100 wallet on this machine. [BSV
  Desktop](https://desktop.bsvb.tech/) serves the JSON API on
  `127.0.0.1:3321`, which is where the plugin looks by default.

## Install

Add the plugin to `opencode.json` (project) or `~/.config/opencode/opencode.json`
(global). OpenCode installs npm plugins itself at startup.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-plugin-bitplan"]
}
```

Then connect the wallet once:

```
/connect  →  BitPlan Gateway  →  Connect BRC-100 wallet
```

Approve the signature request in the wallet. OpenCode stores the resulting
24-hour token in its auth store (`~/.local/share/opencode/auth.json`) and the
plugin re-signs it through the wallet before it expires. Pick a model with
`/models`; recommended models are marked with a star.

The first call on a fresh account answers 402. The plugin pays the challenge
from the wallet (the wallet asks for approval) and retries the same request
once. Unused reserve stays on the account as credits. You can also fund the
account by sending BSV to its paymail (`bitplan gateway credits` prints it) or
deposit a larger amount with `bitplan gateway deposit`.

## Configuration

Every option is optional. Pass them as the second element of the plugin entry:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-plugin-bitplan",
      {
        "walletUrl": "http://127.0.0.1:3321",
        "gatewayUrl": "https://gateway.bitplan.dev",
        "byok": ["opencode-go"],
        "maxOutputTokens": 8192
      }
    ]
  ]
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `walletUrl` | see below | BRC-100 JSON API endpoint. `https`, or `http` on localhost only. |
| `gatewayUrl` | `https://gateway.bitplan.dev` | Gateway origin. |
| `byok` | `[]` | Gateway BYOK provider ids you have stored a key for (`opencode`, `opencode-go`). Their `byok_only` models are listed only when named here; without the stored key the gateway refuses the call. |
| `maxOutputTokens` | `8192` | Output limit advertised for every model. The gateway sizes its per-call hold by `max_tokens`, so a smaller value keeps holds small. |

The wallet endpoint is resolved in this order, first match wins: the
`walletUrl` option, the `BITPLAN_WALLET_URL` environment variable, `walletUrl`
in `~/.bitplan/config.json` (shared with the `bitplan` CLI), then
`http://127.0.0.1:3321`. A source that is present but wrong is an error; it is
never skipped in favour of the next one.

Provider settings from `opencode.json` still apply. Anything under
`provider.bitplan` (for example `options.timeout`, a `whitelist`, or a model
override) is merged on top of what the plugin injects.

## What the plugin does

- Registers provider `bitplan` ("BitPlan Gateway") on
  `@ai-sdk/openai-compatible` with base URL `https://gateway.bitplan.dev/v1`,
  and fills its model list from `GET /v1/models`: language models only, no
  image models, no BYOK-only models unless configured, recommended models
  first, with context windows and USD-per-million prices (markup included)
  mapped into OpenCode's model shape.
- Adds two connect methods: **Connect BRC-100 wallet** (the wallet signs; nothing
  is typed) and **Paste a gateway token** for a token minted elsewhere, for
  example with `bitplan gateway token`.
- Sends every request with `Authorization: Bearer <current token>` and
  `x-gateway-deposit: exact`, refreshing the token through the wallet 30
  minutes before its 24-hour expiry. If the wallet is not running, a token that
  is still valid keeps working; once it has expired the error says what to do.
- On 402, parses the `bsv-tx-v1` challenge, pays `amount_sats` to the payee
  locking script with `createAction`, and repeats the identical request once
  with `X402-Proof`. A second 402, a wallet refusal, or insufficient funds
  surface as a clear error with the amount and the account's paymail; nothing
  is paid twice.
- Never logs the token, a signature, or a key.

## Without the plugin

Any OpenAI-compatible client works with a static token. Mint one with the CLI
and put it in the environment:

```sh
export BITPLAN_GATEWAY_TOKEN="$(npx bitplan gateway token)"
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "bitplan": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "BitPlan Gateway",
      "options": {
        "baseURL": "https://gateway.bitplan.dev/v1",
        "apiKey": "{env:BITPLAN_GATEWAY_TOKEN}"
      },
      "models": {
        "anthropic/claude-opus-4.8": { "name": "Claude Opus 4.8" },
        "spacexai/grok-4.6": { "name": "Grok 4.6" }
      }
    }
  }
}
```

Model ids come from `GET https://gateway.bitplan.dev/v1/models` (or
`npx bitplan gateway models`). The token lasts 24 hours and this setup cannot
pay a 402, so keep the account funded with `npx bitplan gateway deposit` or by
paymail.

## Develop

```sh
bun install
bun run --cwd packages/opencode-plugin typecheck
bun run --cwd packages/opencode-plugin build
bun test packages/opencode-plugin
```

Tests stub the wallet and the network; nothing is signed with a real key and
no transaction is broadcast.

## License

[MIT](LICENSE)
