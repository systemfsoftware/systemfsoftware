# Decision — the Agent Client Protocol implementation

## Decision

Implement ACP ourselves, Effect-native, generating types from the canonical
protocol schema. Do not depend on `@agentclientprotocol/sdk`, and do not fork it.

The protocol definition is vendored at `protocol/acp-schema.json` — JSON Schema
draft 2020-12, `title: "Agent Client Protocol"`, 262 `$defs`, of which 83 are
request, response or notification envelopes. That file, not any SDK, is the source
of truth. Effect Schema declarations are generated from it, so the generated
surface and the wire format cannot drift apart.

Three parts, and only the middle one is real work:

1. **Framing.** JSON-RPC 2.0 over newline-delimited JSON: `Stream.splitLines` plus
   a `Schema` decode per frame.
2. **Bidirectional dispatch.** Both peers issue requests, so the connection is
   symmetric: a request router, a pending-response map keyed by `RequestId`, and
   typed error mapping.
3. **Transport.** Node stdio and a unix socket, both already `@effect/platform`
   streams.

A second reason to own it: this is the sharpest available stress test of the cell
taxonomy. A protocol exercises cells the command surface never reaches — a
generated codec, pure framing, live bidirectional state, a driven transport, and an
error alphabet crossing all of them. Every placement the taxonomy cannot express
cleanly here is a finding, and finding those is a deliverable in its own right.

## Candidates considered

**`@agentclientprotocol/sdk` v1.3.0 — rejected.** It is Zod-native:
`peerDependencies = { zod: "^3.25.0 || ^4.0.0" }`, shipping 105 KB of generated
`zod.gen.js` and 187 KB of generated `.d.ts`. Adopting it puts two schema systems in
one codebase, each with its own validation error type, and forces a Zod-to-Effect
decode at every message boundary — impedance paid per frame, forever, on the hot
path of a streaming protocol. Its non-generated runtime is ~6,400 lines, but ~1,900
of that is HTTP transport and cookie handling this system does not use, and ~1,884
more is the generated per-method surface.

**Fork the SDK — rejected.** A fork inherits the Zod dependency, which is the actual
objection, and inherits maintenance of 6,400 lines to avoid writing roughly 1,000.

**Own implementation from the vendored schema — chosen.** The generated type surface
costs nothing to produce and is regenerated when the schema is bumped. What remains
hand-written is framing and dispatch.

## The generator: candidates and measurement

An earlier draft of this record claimed "no maintained JSON-Schema to Effect-Schema
generator exists". That was false — it rested on four guessed package names being
absent from the registry, and never checked the obvious candidate. It is retracted.

**quicktype v24.0.0 — rejected on measurement.** It ships a first-class
`TypeScriptEffectSchema` target (`packages/quicktype-core/src/language/`), emitting
`import * as S from "effect/Schema"`, `S.Class` per object, `S.Literal` per enum and
`S.suspend` for recursion. Run against the vendored schema in a bubblewrap sandbox
with no network and no access to `$HOME` or this repository:

| metric                                             | quicktype v24.0.0 | generated here |
| -------------------------------------------------- | ----------------- | -------------- |
| protocol `$defs` present under their protocol name | 94 / 262          | 262 / 262      |
| `S.Any` occurrences                                | 226               | 0              |
| correlated `method` to `params` tags               | 0                 | 44             |

Pointed at the schema root it emitted three declarations totalling 615 bytes, having
unified the three top-level envelopes into one struct with `params: S.Any`. Forced to
emit every definition by a synthesised wrapper naming all 262, it produced 222 classes
— but structural unification merges and renames types, so 168 protocol names have no
corresponding export. For a wire protocol the name _is_ the contract: a consumer needs
`PromptRequest`, not a structurally-equivalent synonym. It also drops `x-*` extension
keywords, which is where this protocol's method-to-payload correlation lives.

**Generating from the schema here — chosen.** Full name fidelity, no `S.Any`, and it
reads `x-method` and `x-side` to rebuild the correlation the JSON Schema loses.

A quicktype target emitting plain `S.Struct` with `$defs` name preservation and `x-*`
passthrough would reverse this; the measurement above is the re-runnable test.

## What comparable projects actually ship

The upstream Python program does **not** depend on an ACP SDK. `pyproject.toml`
declares no `agent-client-protocol` dependency, and no module under `src/` carries a
`from acp import`. An earlier draft of this record asserted otherwise; that assertion
was false and is retracted.

What it actually does, from `src/terok/cli/commands/acp.py:4-27`: the `acp connect`
verb "bridges the caller's stdio to that socket so an ACP client (Zed, Toad, …)
launching us as its agent server speaks JSON-RPC straight through." The CLI verb
parses no protocol; it is a transparent byte bridge to a per-task unix socket. The
protocol-speaking component is the executor's host-proxy daemon, which aggregates the
container's in-image agents behind ACP's standard model selector as namespaced
`agent:model` ids.

That is the decisive fact for scope: an **aggregating proxy** inspects `initialize`
(to merge capabilities), the provider and model listings (to namespace them), and
session identifiers (to rewrite them). Every other frame is forwarded opaquely. The
typed surface this system must understand is a small fraction of the 262 definitions;
the rest is carried as passthrough.

## Deciding criterion

The protocol layer must be a first-class Effect value — frames decoded by `Schema`,
failures in the typed error channel, transports as `Stream` — with no second
validation library in the dependency graph. No published implementation meets that,
because the only maintained one is built on Zod. The generated-from-schema route
meets it and keeps the wire format single-sourced.

## What would reverse this

- An Effect-native ACP implementation appears and is maintained.
- Hand-written framing and dispatch exceeds ~1,500 lines, meaning the protocol
  carries complexity this record underestimated.
- The aggregating proxy turns out to need deep inspection of most of the 83 envelope
  types rather than the handful named above, making the passthrough boundary useless.
- `@agentclientprotocol/sdk` drops its Zod peer dependency for a schema-agnostic core.

## Sources read

- `npm view @agentclientprotocol/sdk version dependencies peerDependencies` — v1.3.0,
  `peerDependencies = { zod: '^3.25.0 || ^4.0.0' }`, unpacked 5,291,484 bytes.
- `npm pack @agentclientprotocol/sdk`, then line counts over `package/dist/`:
  `jsonrpc.js` 1063, `connection.js` 427, `protocol-router.js` 473,
  `node-adapter.js` 425, `line-buffer.js` 63, `http-stream.js` 434,
  `cookie-store.js` 95, `acp.js` 1884; generated `schema/*.js` 3328.
- `package/schema/schema.json` — `$schema` draft 2020-12, title "Agent Client
  Protocol", 262 `$defs`, 83 request/response/notification envelopes. Vendored to
  `protocol/acp-schema.json`.
- `/tmp/terok/pyproject.toml` — searched for `agent-client-protocol` and `acp`: no
  matches.
- `/tmp/terok/src/terok/cli/commands/acp.py:1-69` — the bridge docstring and its
  imports; the module imports no protocol library.
- Repository-wide scan of `/tmp/terok/src` for `from acp import` / `import acp`: zero
  matches; exactly one file mentions ACP at all.
