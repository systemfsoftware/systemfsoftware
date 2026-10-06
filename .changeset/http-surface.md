---
"@systemfsoftware/effect-contract": minor
---

Add the HTTP surface at `@systemfsoftware/effect-contract/http`: `mount(registry)` maps each `Read` to `GET /<kebab-name>` and each write to `POST /<kebab-name>`, serves the OpenAPI 3.1 document at `/openapi.json`, and derives the strong `ETag`, `Cache-Control` and `Vary` headers from the contract's cache policy and exposure. Reads answer `304` on a matching `If-None-Match`, a `POST` to a read path answers `405`, and a decoded input failure re-dispatches the raw input to the capability so every surface answers the same census. The in-memory `Operations` layer moves from the testing entry to `Operations.operationsMemoryLayer`, re-exported unchanged from the testing entry, so a Worker can mount the surface without the testing entry's vitest dependency.
