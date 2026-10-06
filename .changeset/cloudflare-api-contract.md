---
"@systemfsoftware/alchemy-cloudflare": minor
---

Add `@systemfsoftware/alchemy-cloudflare`: the Cloudflare API contract for K2, Basin, Pipelines sinks, URL Scanner, Monetization Gateway, Issues automations, notification webhooks and policies, Spectrum, KV namespaces, zone tracing, observability destinations, the telemetry query and Containers, as an Effect `HttpApi` at the `api` entry, generated from Cloudflare's published OpenAPI schema. The `client` entry adds `CloudflareClient`, which sends every call through `@distilled.cloud/cloudflare` `Credentials` (so an `apiBaseUrl` points it at an emulator), turns non-2xx responses into `NotFound`, `AlreadyExists`, `Validation`, `RateLimited`, `Entitlement` or `CloudflareApiError`, and retries a 429 twice after its `Retry-After`.
