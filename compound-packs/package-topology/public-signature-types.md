---
title: Every type a published signature reaches is published, and a service tag is published only when consumers provide it
applies_when:
  - adding a published function whose signature mentions a type from another module
  - publishing a Context.Service tag, or deciding whether to
  - exporting a type only so the package's own tests can use it
tags: [package-topology, public-surface, signature-types, api-extractor, service]
---

A published signature that mentions a type no entry exports hands consumers a value they cannot name: they cannot annotate it, store it, or pass it on. Export the type from the entry, or change the signature to a published type. api-extractor reports this as `ae-forgotten-export`; `api:check` fails on it in packages whose `api-extractor.json` sets that message to `error`, and only warns where it is set to `warning`.

A `Context.Service` tag is public when a consumer of the package is expected to provide or replace that service in their own composition. The observable check: the tag appears in the composition a supported consumer writes, such as the package's README usage or a published `layer(options)` the consumer provides. It is never public only because the package's tests substitute it: tests reach internal tags through internal paths.

Gate: `api:check` for signature types (where configured at `error`); `review` for service publicity.
