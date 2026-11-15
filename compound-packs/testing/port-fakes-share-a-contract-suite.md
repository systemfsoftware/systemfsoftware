---
title: Port and out-of-process fakes share a pairwise contract suite driving our adapter, gated on live credentials
applies_when:
  - writing or updating a fake, stub, emulator or stand-in for a port or third-party HTTP service
  - adding a port operation or changing an adapter that talks to a third-party service
  - a module in src/ is imported only by tests, or a package exports a test double
  - writing a Storybook I/O stand-in, router stand-in or fixture controls
  - deciding where an out-of-process fake, its contract suite, or its live vendor leg lives
tags: [testing, fake, contract-test, port, store, sandbox, storybook]
---

Two kinds of fakes exist, each with one home and never imported by product code:

1. **In-process port fake (`Layer`):** Built through the port's constructor (`Tag.of` inside `Layer.effect(Tag)` or `Layer.succeed(Tag)`), implementing every operation—never `Layer.mock`, partial objects, or type casts. Lives in `tests/__fixtures__/` and is never published by a package. Outbound-port fakes expose read operations so Features can assert outbound effects in port terms.
2. **Out-of-process service fake (local HTTP service or Worker):** A working implementation of a third-party HTTP API in its own package, deployed as its own service/Worker only by the `dev` and `e2e` stages, and reached by our adapter solely through configuration (an origin URL and credentials). Never imported by product source.

Every fake runs in a `pairwiseFor` contract suite in `tests/<port>-contract.integration.test.ts` driving **our real adapter** (imported from its package's published `exports` entry per `tests-reach-only-the-published-surface.md`) against both the fake (side A) and the real implementation or vendor sandbox (side B). Assert only our adapter's domain outcomes (`Result`, typed errors, domain values)—never raw HTTP statuses, headers, or vendor JSON:

- **Where the adapter and suite live:** If an adapter talks to a third-party HTTP service, house it in a package that has a real consumer (such as the app importing it) and export it in `package.json` `exports` (`package-surface` pack: `subpaths-serve-consumers.md`). Its contract suite in `tests/` boots the fake in its local runtime (for example Miniflare for a Worker, or a microVM per `adapters-run-against-real-local-resources.md`) for side A, and points the same adapter at the vendor sandbox for side B. The suite boots the fake through the fake package's published entry, the same one the `dev` stage deploys; a test is not product code.
- **Live vendor leg gating & human approval:** Gate the live vendor leg on an environment variable holding the vendor's sandbox credentials (`hasVendorSandboxEnv() ? Feature : Feature.skip`). It runs on demand when credentials are present and never runs during E2E runs (`e2e-testing` pack: `the-stack-runs-shipped-artifacts-behind-readiness-probes.md`). When a live flow requires human browser approval (such as an OAuth device grant), run that live leg only locally on demand—never in CI—and wait for the person to approve in a browser so the full flow runs end to end.
- **Matrix scope & sandbox keys:** Use a per-suite `pairwiseFor` matrix when both sides take identical inputs (such as a store port). Use a per-scenario `pairwiseFor` matrix when a vendor sandbox decides outcomes by test key/secret rather than input (for example, Cloudflare Turnstile's `1x...` pass key vs `2x...` refuse key vs `3x...` duplicate key): each scenario pairs the fake's input with the vendor's matching sandbox key.
- **Stateful properties:** Properties a stateless vendor sandbox cannot express (such as single-use token consumption) run as fake-only scenarios in the same suite.
- **Store laws:** Store suites verify read-after-write and non-mutating reads (plus further laws only where documented). Never delete a contract suite or compare a seeded fake against an empty real store.

**Storybook exception:** An app's Storybook preview stand-ins live beside their modules in `src/io/__mocks__/layer.ts` (owning stand-in data), `src/io/__mocks__/fixture-controls.ts` (named timing/failure controls built from `src/io/__mocks__/control-primitives.ts`, not an I/O service), and `src/__mocks__/router.tsx` (real router on memory history). Tests never import `__mocks__` directly; `tests/<port>-contract.integration.test.ts` uses factory-less `vi.mock('<io module>')` and `vi.importActual('<io module>')` to compare the stand-in against the real I/O module before any story uses it.

```typescript
// WRONG: asserting vendor HTTP status or running identical token against a key-driven sandbox
expect(rawResponse.status).toBe(400)
// RIGHT: per-scenario pairwiseFor pairing fake input with vendor sandbox key, asserting adapter domain outcome
const scenarioPair = (sandboxSecret: string) =>
  pairwiseFor(
    {
      a: { name: 'fake', layer: CaptchaGateLive({ origin: fakeOrigin, secret: fakeSecret }) },
      b: { name: 'sandbox', layer: CaptchaGateLive({ origin: 'https://captcha.example', secret: sandboxSecret }) },
    },
    CaptchaGate,
  )
```
