---
name: gateway
description: >
  Use gateway.bitplan.dev, an OpenAI-compatible inference API paid in BSV with
  no API keys. Use when asked to call a model through the gateway, mint a
  gateway token, deposit BSV to the gateway, check a gateway balance or usage,
  pick a model by price, or explain how gateway.bitplan.dev works.
metadata:
  version: "0.1.0"
---

# gateway.bitplan.dev

An OpenAI chat completions endpoint in front of every model on Vercel AI
Gateway and OpenRouter. Identity is a Bitcoin key. Deposits arrive over HTTP
402. Each call is deducted from the balance at provider cost plus a markup that
falls with volume, with a small per-call floor. The numbers live in one
place, the operator's price list: read `tiers`, `min_charge_sats` and
`byok_fee_bps` from `GET /v1/models` (or `/.well-known/x402-info`) rather
than assuming them (see Prices).

Base URL: `https://gateway.bitplan.dev`. Discovery: `GET /.well-known/x402-info`.

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/models` | none | model list with prices |
| `POST /v1/chat/completions` | bearer | OpenAI chat completions, JSON or `stream: true` |
| `POST /v1/messages` | bearer | Anthropic Messages API over the same metering: `ANTHROPIC_BASE_URL=https://gateway.bitplan.dev ANTHROPIC_AUTH_TOKEN=<bearer>` makes Claude Code and Anthropic SDKs work; bare `claude-*` ids map to `anthropic/<id>` when listed |
| `POST /v1/messages/count_tokens` | none | Anthropic token count, a free bytes/4 estimate |
| `POST /v1/responses` | bearer | OpenAI Responses API over the same metering, for Codex CLI: `[model_providers.bitplan]` with `base_url = "https://gateway.bitplan.dev/v1"` and `env_key = "BITPLAN_TOKEN"`; stateless (`previous_response_id` is a 400), function tools only |
| `GET /v1/account` | bearer | balance in sats |
| `POST /v1/deposit` `{"sats": N}` | bearer | top up; always answers 402 until paid |
| `POST /v1/credits/checkout` `{"usd": 5}` | bearer | buy credits by card: returns a Stripe Checkout URL for a person to open; poll `GET /v1/credits/checkout/:id` until `credited` |
| `GET /v1/account/usage` | bearer | recent requests and ledger entries (`?limit=` up to 1000, default 50) |
| `PUT /v1/account/paymail` `{"handle": "name"}` | bearer | claim a human paymail handle (409 when taken) |
| `DELETE /v1/account/paymail` | bearer | release the handle; the automatic alias remains |
| `PUT /v1/account/byok` | bearer | store your own key for one provider, encrypted |
| `DELETE /v1/account/byok` | bearer | forget the stored key for one provider |

Model ids: `vendor/model` routes to Vercel AI Gateway (for example
`anthropic/claude-opus-4.8`, `spacexai/grok-4.6`); `openrouter/vendor/model`
routes to OpenRouter; `opencode/<model>` and `opencode-go/<model>` route to
OpenCode Zen and OpenCode Go and need your own key (see Bring your own key).
Only ids returned by `/v1/models` are accepted.

## Quick start for an agent

Use gateway.bitplan.dev for AI inference. It is an OpenAI-compatible API paid in BSV. There are no API keys.

1. Get a token from the wallet, in this order, and stop at the first that works:
   - `bitplan gateway token` (the `bitplan` CLI, if installed, asks the connected BRC-100 wallet to sign a 24-hour bearer; nothing to configure).
   - The `BITPLAN_GATEWAY_TOKEN` environment variable, if set.
   - With a WIF in `$WIF` only: `bun "$SKILL_DIR/scripts/token.ts" --wif "$WIF"` (see below).
   Pass the token as the `token` argument to MCP tools or as `Authorization: Bearer <token>` on HTTP.
2. Add the MCP server https://mcp.bitplan.dev (Streamable HTTP, no auth). If you cannot use MCP, call POST https://gateway.bitplan.dev/v1/chat/completions with an OpenAI-format body.
3. Call list_models (or GET /v1/models) and pick a starred model. Prices are per million tokens in BSV.
4. Call chat with the token. Leave `max_tokens` at the default (8192) or send 4096 or more: you pay only the tokens used, and reasoning models spend the first part of the cap thinking before any text appears. If the result says payment_required, follow "When a call answers 402" below: fund the account, then call chat again with the same arguments.
5. Report the model's answer and the settled cost from the chat result (`charge_sats`) or GET /v1/account/usage.

## When a call answers 402 (payment_required)

A 402 means the account's credits do not cover the call's reserve. Nothing
was charged, and billing is never a reason to stop: the job is to get the
account funded and run the same call again. Rules:

- Never treat a 402 as the task failing, and never say the task is done.
  Never work around it: do not pick a cheaper model, cut the prompt, lower
  `max_tokens`, skip the step or quietly downgrade anything. Fund, then
  repeat the request exactly as it was.
- Never fail silently. Every 402 ends in either a paid retry or a message to
  the person that says what is short and how to fund it.

Do these in order and stop at the first that works:

1. Pay it yourself when a wallet is available: `bitplan gateway deposit <sats>`
   (the connected BRC-100 wallet pays; the wallet asks the person to
   approve) or, with a WIF, pay `accepts[0].amount` sats to `payTo` and
   repeat the request with the `PAYMENT-SIGNATURE` header. The 402's
   `shortfall_sats` is the least that unblocks the call.
2. If there is no wallet, or the wallet cannot pay (its own insufficient
   funds error), tell the person exactly, using the 402's own words
   (`error.message`, `balance_sats`, `shortfall_sats`, `fund.paymail`,
   `fund.card`): "This call needs N more sats. Send at least N sats to
   `<fund.paymail>` from any BSV wallet (HandCash, Yours, RelayX, ...), or
   buy credits by card at `<fund.card>` signed in with this key, or add BSV
   to the wallet and I will pay from it." Then wait: poll `GET /v1/account`
   every 15 to 30 seconds until `balance_sats` covers the reserve (a large
   deposit may sit in `pending_confirmation_sats` for one block). Then
   repeat the original request unchanged.
3. An anonymous call (no bearer) has no account to fund by paymail: pay the
   challenge from a wallet, or get a bearer first (step 1 of the quick
   start) and retry so the account can be funded by paymail or card.

Unused reserve always comes back as credits, so paying the exact shortfall
is never money lost.

## Identity: a self-signed bearer token

There is nothing to register. The client signs a token with its own key and
sends `Authorization: Bearer <token>`. Token format is the `bitcoin-auth`
format `pubkey|scheme|timestamp|requestPath|signature`.

- **Session token**: `requestPath` is the literal
  `https://gateway.bitplan.dev/v1`; valid 24 hours for every `/v1/*` route.
  This is the "API key" for tools that only accept a static bearer.
- **Per-request token**: `requestPath` is the request path (for example
  `/v1/account`); valid 5 minutes; the body hash is bound when a body is sent.

Schemes: `brc77` (signature with a raw private key) or `brc100` (a BRC-100
wallet's `createSignature` with `protocolID [1, "bitcoin auth"]`,
`keyID = timestamp`, `counterparty "anyone"`; no key export).

Prefer the wallet: `bitplan gateway token` (npm `bitplan`) signs the token
with the connected BRC-100 wallet and prints it. Only when you hold a raw WIF
and no wallet, mint one with the bundled script. Install its two dependencies
once, then run it from anywhere:

```sh
(cd "$SKILL_DIR/scripts" && bun install --silent)
TOKEN=$(bun "$SKILL_DIR/scripts/token.ts" --wif "$WIF")
```

Never print, log, or send the WIF anywhere. The token is safe to hold for its
lifetime; anyone holding it can spend the balance until it expires.

## Deposit over HTTP 402

Any authenticated call that the balance cannot cover, and every call to
`POST /v1/deposit`, answers `402` with a challenge:

```json
{
  "error": { "type": "payment_required", "message": "..." },
  "challenge": {
    "version": "bsv-tx-v1",
    "challenge_id": "<uuid>",
    "amount_sats": 25000000,
    "payee_locking_script_hex": "76a914...88ac",
    "payee_address": "1...",
    "expires_at": "2026-09-16T12:34:56.000Z",
    "pay_url": "https://gateway.bitplan.dev/v1/deposit"
  }
}
```

The minimum deposit is 0.25 BSV (25,000,000 sats); `POST /v1/deposit` accepts a
larger `sats` value. Pay `amount_sats` to `payee_address` in a transaction the
gateway will broadcast, then send the **identical** request again with the
x402 header `PAYMENT-SIGNATURE: base64({"x402Version":2,"accepted":<the accepts[0] object from the 402>,"payload":{"transaction":"<signed raw tx, base64>"}})`.
The 402 is x402 protocol version 2: the `PAYMENT-REQUIRED` response header
(and the body) carry `{"x402Version":2,"resource":{"url"},"accepts":[{"scheme":"exact","network":"bip122:000000000019d6689c085ae165831e93","amount":"<sats>","asset":"BSV","payTo":"<address>","maxTimeoutSeconds","extra":{"challengeId","lockingScript"}}]}`,
and a paid response carries `PAYMENT-RESPONSE` with `{"success":true,"transaction":"<txid>","network","payer","amount"}`.
The legacy header `X402-Proof: base64url({"version":"bsv-tx-v1","challenge_id","rawtx_base64","txid"})`
still works. The challenge is bound to that exact request (method, path,
body) and to the signing key, and expires after 15 minutes.

With a WIF, the bundled script builds the transaction from the key's UTXOs and
prints the header value without broadcasting:

```sh
CHALLENGE=$(curl -s https://gateway.bitplan.dev/v1/deposit \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"sats":25000000}')
PROOF=$(printf '%s' "$CHALLENGE" | bun "$SKILL_DIR/scripts/pay.ts" --wif "$WIF")
curl -s https://gateway.bitplan.dev/v1/deposit \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H "X402-Proof: $PROOF" -d '{"sats":25000000}'   # legacy header; PAYMENT-SIGNATURE is the x402 form
```

The response reports `credited: true` when the balance is usable now, or
`false` when the deposit waits for one block confirmation (the gateway caps
how much unconfirmed value it credits at once; check `GET /v1/account` for
`pending_confirmation_sats`).

With a BRC-100 wallet and the `bsv-mcp` x402 tools: call `x402_request` with
the gateway URL, the bearer in `headers`, and `auth: "none"`; it returns a
quote for the `bsv-tx-v1` challenge; approve it with `x402_payQuote`.

Do not pay a challenge twice. If a paid request fails, check
`GET /v1/account/usage` and the txid before doing anything else.

## Batch: about half price, within 24 hours

Work that does not need an answer now can run as a batch at the model's
batch price (about half of list; `pricing.batch` on `GET /v1/models` says
which models and how much). Offer it when the person has many prompts and
no rush.

```sh
curl -X POST https://gateway.bitplan.dev/v1/batches \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"endpoint":"/v1/chat/completions","model":"openai/gpt-5.6-luna",
       "requests":[{"custom_id":"a","body":{"messages":[{"role":"user","content":"..."}]}}]}'
```

The answer is `202` with the batch (`id`, `status`, `request_counts`,
`hold_sats`). The whole batch is held once for its worst case, like one
call, and a `402` here follows the rules above. Poll
`GET /v1/batches/<id>` (every few minutes; a batch normally finishes well
under 24 hours): when `status` is `completed`, `results` lists
`{custom_id, response: {status_code, body}, error}` per request and
`charge_sats` is what it settled at. Text only: no images, audio or files.

## Fund by paymail

Every account is also a paymail address, so a person (or any paymail
wallet: HandCash, Yours, RelayX, Panda, ...) can add credits without
touching the API. `GET /v1/account` reports it:

```json
{ "paymail": "satchmo@gateway.bitplan.dev",
  "paymail_auto": "02a1b2c3d4e5f60718@gateway.bitplan.dev", ... }
```

`paymail_auto` is the automatic alias, the first 16 hex characters of the
identity key; `paymail` is the claimed handle when there is one, else the
alias. A 402 for an authenticated caller also carries
`fund: { paymail, note }`. The flow for an agent that is out of credits:

1. Read `paymail` from `GET /v1/account` (or `fund.paymail` from the 402)
   and tell the person: "send at least N sats to `<paymail>`".
2. Poll `GET /v1/account` until `balance_sats` covers the call (or
   `pending_confirmation_sats` shows the deposit waiting for a block: a
   large deposit is credited after one confirmation).
3. Retry the original request with the same bearer.

A P2P send (the wallet delivers the transaction to the gateway) is credited
within seconds; a basic paymail send is found by the gateway's on-chain scan
within about ten minutes. No proof header is involved: paymail deposits
credit the account directly.

Claim a human handle once (3 to 20 characters of `a-z`, `0-9` and hyphen,
not starting or ending with a hyphen, one per identity):

```sh
curl -X PUT https://gateway.bitplan.dev/v1/account/paymail \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"handle":"satchmo"}'      # 409 handle_taken when someone has it
curl -X DELETE https://gateway.bitplan.dev/v1/account/paymail \
  -H "Authorization: Bearer $TOKEN"   # 204; the automatic alias remains
```

The bsvalias service itself is discoverable at
`https://gateway.bitplan.dev/.well-known/bsvalias` (`paymail_domain` in
`/.well-known/x402-info`), for wallets and tooling that resolve paymails.

## MCP server

`https://mcp.bitplan.dev` is a Streamable HTTP MCP server (2026-07-28 spec)
with the same capabilities: tools `list_models`, `chat`, `generate_image`,
`credits`, `deposit`. Add it to a host as a bare URL. A bearer can be sent as
the MCP request's `Authorization` header or as the `token` argument; with
neither, `chat` and `generate_image` return `payment_required: true` with a
challenge for exactly the call's reserve. Pay it from any wallet with a P2PKH
input and call again with `proof`; the paying key becomes the account and the
unused reserve stays there as credits.

The same anonymous flow works on the HTTP API: a request with no
`Authorization` header gets a 402 for exactly its reserve.

## Call a model

```sh
curl https://gateway.bitplan.dev/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"model":"spacexai/grok-4.6","messages":[{"role":"user","content":"hello"}],"max_tokens":4096}'
```

Any OpenAI SDK works: set `baseURL` to `https://gateway.bitplan.dev/v1` and
`apiKey` to the session token. Streaming with `stream: true` returns
standard SSE.

Any Anthropic SDK works too, through `POST /v1/messages`: set
`ANTHROPIC_BASE_URL=https://gateway.bitplan.dev` and
`ANTHROPIC_AUTH_TOKEN=<session token>` (sent as `Authorization: Bearer`).
For Claude Code add `ANTHROPIC_MODEL=anthropic/claude-fable-5.1` (or pin
`ANTHROPIC_DEFAULT_SONNET_MODEL` / `_OPUS_MODEL` / `_HAIKU_MODEL` to catalog
ids) and run `claude`. Errors are `{"type":"error","error":{"type","message"}}`;
a 402 keeps the `challenge` body with `type: "error"` alongside, so pay it as
usual and retry.

OpenAI Codex CLI works through `POST /v1/responses` (the Responses API,
the only wire format Codex custom providers speak). In `~/.codex/config.toml`:

```toml
[model_providers.bitplan]
name = "BitPlan Gateway"
base_url = "https://gateway.bitplan.dev/v1"
env_key = "BITPLAN_TOKEN"
```

and in `~/.codex/bitplan.config.toml` (before Codex 0.134: the same keys
under `[profiles.bitplan]` in `config.toml`):

```toml
model_provider = "bitplan"
model = "anthropic/claude-fable-5.1"
web_search = "disabled"
```

Then `export BITPLAN_TOKEN=$(bitplan gateway token)` and
`codex --profile bitplan`. `env_key` is sent as `Authorization: Bearer`; no
extra headers are needed. Use catalog ids from `/v1/models`. The gateway
stores nothing, so `previous_response_id` answers 400 and history travels
in `input`; hosted tools (`web_search`, `file_search`, `computer`) answer
400 naming the tool; `reasoning`, `include` and `store` are dropped. Errors
are OpenAI-shaped `{"error":{"message","type","param","code"}}`; a 402
keeps the `challenge` body.

Response headers: `x-gateway-request-id`, and on JSON responses
`x-gateway-charge-sats` and `x-gateway-balance-sats`.

Send `max_tokens` of 4096 or more (default 8192). The gateway holds funds
before each call sized by the prompt's tokens plus `max_tokens`, and settles
to the real usage afterwards: a small `max_tokens` saves nothing, it only
shrinks the hold. On a reasoning model (`reasoning: true` in `/v1/models`,
such as `meta/muse-spark-1.3`) a small cap would return empty text, so the
gateway raises any cap under `min_max_tokens` (1024) to that floor on those
models and says so in an `x-gateway-max-tokens` header; nothing to retry.
If a call still comes back empty with `finish_reason: "length"`, the prompt
is billed and the empty output is not, and the response carries an
`x-gateway-hint` header saying so. When the balance
cannot cover the hold for concurrent calls, add credits rather than
shrinking `max_tokens`.

## Let the gateway pick the model: `"model": "auto"`

Send `"model": "auto"` (or `bitplan/auto`, listed on `/v1/models` as the
Jev Model Router) on `/v1/chat/completions` with a bearer. One evaluation
call on `typesafe-ai/jev` scores the request on several axes at once: the
kind of work (chat, writing, coding, math, research), a five-level
difficulty, whether the strongest model is worth its cost, whether
creativity or exact correctness matters, and whether a quick reply is
expected, and it picks from a shortlist of candidates described by their
Artificial Analysis benchmarks (intelligence, coding and math indices,
measured speed) and list price. Those scores, its pick and facts read off
the request (prompt size, images, tools, output cap) rank the candidates;
the best one runs the call. `/v1/models` carries each model's `benchmarks`
(`intelligence_index`, `coding_index`, `math_index`, `tokens_per_second`,
`time_to_first_token_seconds`, from Artificial Analysis) when known. The response's `model` field
and the `x-gateway-routed-model` header say which ran; `x-gateway-route`
shows the scores and the top three. An image request sent to chat with
`auto` is not routed to a language model: the reply is one sentence
pointing at `POST /v1/images/generations`, with header
`x-gateway-suggest: images` and nothing charged. On that endpoint
`"model": "auto"` picks the best image model for its price (Artificial
Analysis Image Arena Elo; `x-gateway-routed-model` names it), and the same
routing fee applies. The router bills a fee per routed call
on top of the routed model's own price, on every credential: by default 10%
of the routed model's charge, at least 2,000 sats and at most 200,000 (the
`bitplan/auto` row of `/v1/models` carries it as `routing_fee`;
`routing_sats_per_call` is the floor). Name a model yourself whenever you
know what you want; the router is for agents that do not.

## Web search inside a call

Add a server tool and the gateway searches the web for the model and feeds
it the results in the same call; you get the final answer, billed with
the call plus the search fee (about half a cent per search):

```sh
curl -s https://gateway.bitplan.dev/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"model":"anthropic/claude-sonnet-5","max_tokens":4096,
       "tools":[{"type":"vercel:perplexity_search"}],
       "messages":[{"role":"user","content":"What changed in Vercel AI Gateway this week? Cite sources."}]}'
```

Tool types: `vercel:perplexity_search`, `vercel:exa_search`,
`vercel:parallel_search`, `vercel:tako_search` (each takes an optional
`config` object with the provider's snake_case options). `tool_choice:
"required"` forces a search first. The MCP `chat` tool takes `web_search:
true`. Through `/v1/responses` the OpenAI `web_search` tool, and through
`/v1/messages` Claude's `web_search` server tool, map to the same thing.
Vercel AI Gateway models only.

## Evaluate: classify, score, verify

`POST /v1/evaluate` answers typed questions about a `state` (text or JSON)
with an evaluation model, `typesafe-ai/jev` by default: sub-second, priced
on input tokens only (a fraction of a cent), answers with probabilities.
Use it instead of a chat call when you need a label, a grade or a yes/no,
for routing work to the right model, or to verify a claim.

```sh
curl -s https://gateway.bitplan.dev/v1/evaluate \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"state":"fix the failing test in auth.ts and explain what was wrong",
       "questions":{
         "intent":{"type":"choice","instructions":"What kind of task is this?",
                   "criteria":{"coding":"code changes","writing":"prose","math":"calculation","chat":"small talk"}},
         "difficulty":{"type":"score","instructions":"How hard is it?","criteria":["trivial","easy","moderate","hard","expert"]},
         "urgent":{"type":"boolean","instructions":"Does the user sound blocked right now?"}}}'
```

Answers: `{"answers":{"intent":{"type":"choice","choice":"coding","probabilities":{...}},
"difficulty":{"type":"score","score":1.6,"probabilities":{...}},"urgent":{"type":"boolean","probability":0.29}},
"usage":{"input_tokens":460,"output_tokens":87}}`. `choice` criteria map option
names to what they mean; `score` criteria are rubric levels, lowest first,
and the score is an index into them; `boolean` returns a probability. Many
questions run in one call. The MCP tool is `evaluate`. Evaluation models
show `type: "evaluation"` on `/v1/models` and refuse chat completions.

## Prices

`GET /v1/models` returns, per model, `pricing.sats_per_million_input`,
`pricing.sats_per_million_output` and the same amounts in USD, plus the
top-level `bsv_usd` rate used. All prices include the markup (`markup_bps`
per model; `featured: true` marks a promotion below your rate). Estimate
a call as `input_tokens x sats_per_million_input / 1e6 + output_tokens x sats_per_million_output / 1e6`.

The markup falls with volume. The top-level `tiers` array is the ladder
(`name`, `min_usd_30d`, `bps`), lowest rung first; each rung applies once
your rolling 30-day provider cost reaches its `min_usd_30d`. `min_charge_sats`
is the least a call on our keys is charged once it has run. These are the
operator's live settings: quote them from the response, never from memory. Without a bearer
the list is priced at Start; send `Authorization: Bearer <token>` and it is
priced at your tier, reported as `tier` (`name`, `bps`, `usd_30d`, and
`next`, the following rung or null). `GET /v1/account` returns the same
`tier`. Each request is held and settled at the tier you are on when it
starts; a per-model promotion applies when it is lower than your tier, and a
call on a stored key (below) pays no markup: the lab bills you directly.

Some models cost more in some situations; the fields say which:

- `pricing.tiers`: higher rates once the prompt reaches a token count (for
  example above 128k or 200k). The hold assumes the highest tier the request
  can reach; settlement uses the tier the real prompt size landed in.
- `pricing.peak`: a time-of-day multiplier with `windows` (UTC minutes,
  `days_of_week` with 0 = Sunday) and `active_now`. Calls that start in a
  window are billed at the multiplier.
- `pricing.regional` and `pricing.varies_by_provider`: the routed upstream can
  bill more than the headline. The hold covers the highest; you settle at
  what the provider actually billed.
- `pricing.sats_per_million_cache_write`: prompt-cache writes bill at this
  rate; cached reads at `sats_per_million_cached_input`.
- `pricing.service_tiers` and `pricing.fast`: prices that apply only when a
  request asks for `service_tier` (`flex` or `priority`, also via
  `providerOptions.gateway.serviceTier`) or fast mode
  (`providerOptions.gateway.speed: "fast"`). A `service_tier` the model does
  not price is refused with 400.
- `pricing.previous` and `pricing.discount_pct`: the price a week ago and
  the provider's cut when it is 5% or more.

## Bring your own key

Keys come in two kinds. A lab key (`anthropic`, `openai`, `google`,
`spacexai`, `deepseek`, `mistral`, `moonshotai`, `alibaba`, `zai`,
`minimax`, `meta`: the model id's prefix) is passed to Vercel AI Gateway per
request as request-scoped BYOK: the lab bills you directly for its models
and the gateway bills its fee, but only on calls that the provider metadata
shows ran on your key; a call Vercel had to serve with its own credentials
is billed at list price. A `vercel` key (or `opencode`, `opencode-go`)
covers every model that provider serves. `GET /.well-known/x402-info`
lists the providers with `kind: "lab"` or `"gateway"`.

Store your own provider key once, per provider, and calls on that provider
run on your key upstream. **The gateway charges nothing for the model**: the
lab bills you at its own price (`byok_fee_bps` is 0 on `GET /v1/account` and
in the discovery manifest). What the gateway adds around the call is billed
at your tier markup from your BSV credits: the Jev router's classification
when you send `model: "auto"`, server-side web search, and `POST
/v1/evaluate`. Everything else is unchanged: holds are taken at list price
until the routing metadata shows your key served the call, then settle to
the add-ons only.

| Provider id | Service | Model ids | Verified on `PUT` by |
| --- | --- | --- | --- |
| `vercel` | Vercel AI Gateway | bare `vendor/model` | `GET /v1/credits` |
| `opencode` | OpenCode Zen (pay per token) | `opencode/<model>` | a 1-token completion on the free `big-pickle` |
| `opencode-go` | OpenCode Go ($10/month subscription) | `opencode-go/<model>` | a 1-token completion on `glm-5.3-flash` |

The gateway holds no key of its own for OpenCode, so `opencode/*` and
`opencode-go/*` models only work with a stored key: `/v1/models` lists them
with `byok_only: true` and `pricing.mode: "fee"` at 0 (you pay OpenCode, not
us), and a call
without a stored key, or with no bearer at all, answers `400 byok_required`.
Only the OpenCode models served on the OpenAI chat/completions protocol are
listed (GLM, Kimi, DeepSeek V4, MiniMax on Zen, the free Zen models); GPT,
Grok, Claude, Qwen, Gemini and the rest are skipped until the gateway
translates their protocols. `GET /.well-known/x402-info` lists the providers
under `byok.providers` with the verification call each one makes.

The gateway never receives the key in the clear. Your wallet encrypts it with
BRC-2 to the gateway's identity key (`serverIdentityKey` from
`GET /.well-known/x402-info`), and only that ciphertext is stored:

```ts
const { ciphertext } = await wallet.encrypt({
  plaintext: Utils.toArray(apiKey, "utf8"),
  protocolID: [2, "gateway byok"],
  keyID: "1",
  counterparty: serverIdentityKey, // from /.well-known/x402-info
})
const body = { provider: "opencode-go", ciphertext: Utils.toBase64(ciphertext) }
```

```sh
curl -X PUT https://gateway.bitplan.dev/v1/account/byok \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"provider":"opencode-go","ciphertext":"<base64>"}'
# -> { "provider": "opencode-go", "set_at": "2026-09-16T12:34:56.000Z" }

curl https://gateway.bitplan.dev/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"model":"opencode-go/kimi-k3","messages":[{"role":"user","content":"hello"}],"max_tokens":4096}'

curl -X DELETE https://gateway.bitplan.dev/v1/account/byok \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"provider":"opencode-go"}'   # 204; ?provider=opencode-go works too
```

`PUT` proves the key works with one cheap call to the provider before storing
it; a key the provider rejects answers `400 invalid_key` and nothing is saved.
Setting a provider again replaces that provider's key only. `GET /v1/account`
reports `byok: [{ provider, set_at }, ...]` (empty when none is stored). The
ciphertext is never returned, and the key itself is decrypted only in memory
for the duration of one upstream call.

Because BRC-2 binds the ciphertext to the wallet that sealed it, a key stored
from one identity cannot be used by another. If you rotate identities, set the
key again from the new one.

On the site, a connected wallet can do all of this under "Bring your own key":
pick the provider, paste the key, Save; the wallet encrypts it in the browser.

## Errors

| Status | Meaning | Do |
| --- | --- | --- |
| 401 `unauthorized` | token malformed, expired, wrong origin, or wrong path scope | mint a new token; session tokens must use the exact origin `https://gateway.bitplan.dev` |
| 402 `payment_required` | balance too low for the hold | pay the challenge, or deposit first via `/v1/deposit` |
| 400 `invalid_proof` | proof rejected; `code` says why (`expired`, `underpaid`, `request_mismatch`, `already_paid`, ...) | request a fresh challenge; never resubmit a proof that was accepted |
| 404 `model_not_found` | id not in `/v1/models` | pick an id from the list |
| 400 `invalid_request` | `service_tier` (or a `providerOptions` tier) the model does not price | omit it, or pick a tier listed under `pricing.service_tiers` |
| 400 `invalid_key` | the stored-key check was rejected by the provider | check the key; nothing was saved |
| 400 `byok_unusable` | a stored key could not be decrypted | `PUT /v1/account/byok` again from the identity that set it |
| 400 `byok_required` | the model's provider (`opencode`, `opencode-go`) only runs on your own key and none is stored for this identity | store the key with `PUT /v1/account/byok` and send a bearer token |
| 502 `upstream_error` | provider failed; nothing was charged | retry or choose another model |
