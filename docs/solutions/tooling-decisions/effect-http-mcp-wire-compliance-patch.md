---
title: A local effect patch closes the MCP wire gaps effect@4.0.1 leaves over HTTP
date: "2026-10-06"
module: effect-contract
problem_type: tooling_decision
component: packages/contract/effect-contract
severity: medium
applies_when:
  - A stateful MCP session is served over HTTP from a Durable Object and the client calls resources/subscribe or resources/unsubscribe
  - A client sends Mcp-Name or Mcp-Param-* with leading or trailing whitespace and the server answers -32020
  - Someone asks why effect@4.0.1 is patched in this workspace
  - Removing or regenerating the effect patch from pnpm-workspace.yaml
root_cause: upstream_transport_gate
resolution_type: dependency_patch
related_components:
  - packages/contract/effect-contract
  - patches
  - pnpm-workspace.yaml
  - repos/effect
tags:
  - mcp
  - effect
  - patch
  - subscriptions
  - routing-headers
  - workerd
---

# A local effect patch closes the MCP wire gaps effect@4.0.1 leaves over HTTP

## Context

Two vendored MCP conformance scenarios fail against effect@4.0.1 as published, and neither
failure is a defect in this repository's surface.

**Resource subscriptions.** The 2025-11-25 set scores `resources-subscribe` and
`resources-unsubscribe`. Both drive a stateful session — the `initialize` handshake plus
`Mcp-Session-Id` — over Streamable HTTP, then call `resources/subscribe`; the server must track
the URI and answer with an empty result. Effect derives both the advertised
`capabilities.resources.subscribe` flag and `Registration.supportsResourceSubscriptions` from
`HttpServerRequest` being absent:

```ts
subscribe: httpRequest === undefined
supportsResourceSubscriptions: httpRequest === undefined && capabilities.resources?.subscribe === true
```

A request that reaches the stateful runtime over HTTP therefore advertises `subscribe: false`,
and `McpStatefulRuntime.subscribe` rejects it with `-32645 Resource subscriptions are not
supported`.

**Routing-header whitespace.** SEP-2243 requires the server to compare the `Mcp-Name` routing
header (and the `Mcp-Param-*` headers) against the body with the field value's leading and
trailing whitespace excluded, per RFC 9110 §5.5: field parsing MUST exclude OWS before
evaluating the value. A workerd HTTP server hands the runtime the header value as the client
sent it, and `decodeRoutingHeader` compiles the OWS-stripping rule out: it tests the raw value
against the Base64 sentinel pair, returns the raw value for the plain case, and slices the raw
value for the encoded case. A request carrying `Mcp-Name: "  tool_name  "` — which the
conformance scenario sends — therefore mismatches the body and is answered `-32020`, when it is
the request the server MUST accept.

## Decision

Patch `effect@4.0.1` locally (pnpm `patchedDependencies`) at both sites.

- Drop the `httpRequest === undefined` conjunct where the runtime derives
  `capabilities.resources.subscribe` and `Registration.supportsResourceSubscriptions`, leaving
  `subscribe: true` and `supportsResourceSubscriptions: capabilities.resources?.subscribe === true`.
- Trim the routing-header value once in `decodeRoutingHeader`, then run the sentinel test, the
  printable-value test and the Base64 slice against the trimmed value; `parameterHeaderMatches`
  and the stateless admission check both read through that one decode, so one trim covers the
  standard and custom headers alike.
- Patch: `effect@4.0.1.patch`, registered under `patchedDependencies` in `pnpm-workspace.yaml`.
- Upstream reference (read-only): the stateful `initialize` branch of effect's internal MCP
  runtime, and the shared routing-header codec in effect's internal MCP protocol module.

## Why the transport and the raw value are the wrong discriminators

A resource subscription is per stateful session, and a stateful session exists exactly when a
caller reached the stateful `initialize` branch. In this repository every stateful session is
served from the session Durable Object over HTTP — the surface's `sessionLayer` pins
`legacyProtocols` onto `McpServerOptions.protocols` — so HTTP is the only transport a session
has, and the guard disables a feature the session could serve. The transport policy, not the
presence of an `HttpServerRequest`, is the property that should select it.

A header value's OWS is not part of the value by definition of the field grammar, so a codec
that compares the raw header has no correct case to preserve: the trimmed value is the only
value RFC 9110 defines. Trimming at the codec's entry also fixes the encoded form, which the
sentinel test would otherwise miss when whitespace precedes the opening `=?base64?`.

## Where

- Ownership of the rule: whoever owns `repos/effect` navigation owns removing this patch when an
  effect release keys subscriptions on transport policy and trims routing-header OWS.
- Regenerate with `pnpm patch effect@4.0.1`, edit the internal modules named above, then
  `pnpm patch-commit`; the lockfile's patch hash follows.

## Learned

- The subscription patch is two lines in the internal MCP runtime module; a layout move upstream
  is the failure mode to watch, and the patch-commit flow re-derives it cleanly.
- The routing fix belongs in the one shared decoder: fixing it at either caller leaves the other
  header family rejecting whitespace it must accept.
