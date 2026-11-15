---
title: Port and out-of-process fakes share a pairwise contract suite driving our adapter
applies_when:
  - writing or updating an in-process port fake or an out-of-process third-party service fake
  - adding a port operation or changing an adapter that talks to a third-party service
  - writing a contract suite, pairing sandbox test keys or gating a live vendor leg
tags: [testing, fake, contract-test, port, store, sandbox]
---

Two kinds of fakes exist, each with one home and never imported by product source:

1. **In-process port fake (`Layer`):** Built through the port's constructor (`Tag.of` inside `Layer.effect(Tag)` or `Layer.succeed(Tag)`), implementing every operation—never `Layer.mock`, partial objects, or type casts. Lives in `tests/__fixtures__/` and is never published by a package. Outbound-port fakes expose read operations so Features can assert outbound effects in port terms.
2. **Out-of-process service fake (local service):** A working implementation of a third-party service API in its own package, deployed as its own service only by the `dev` and `e2e` stages, and reached by our adapter solely through configuration (an origin URL and credentials). Never imported by product source.

Every fake runs in a `pairwiseFor` contract suite at `tests/<port>-contract.integration.test.ts` driving **our real adapter** (imported through its package's published `exports` entry per `tests-reach-only-the-published-surface.md`) against both the fake (side A) and the real implementation or vendor sandbox (side B), asserting identical domain outcomes (`Result`, typed errors, domain values):

- **Running side A against an out-of-process fake:** For a third-party adapter housed in a consumer-imported library package (`tests-reach-only-the-published-surface.md`), side A boots the fake in its local runtime through the fake package's published entry—the same entry `dev` deploys.
- **Live vendor leg gating & human approval:** Gate the live vendor leg on an environment variable holding the vendor's sandbox credentials (`hasVendorSandboxEnv() ? Feature : Feature.skip`). It runs on demand when credentials are present and never runs during E2E runs (`e2e-testing` pack: `the-stack-runs-shipped-artifacts-behind-readiness-probes.md`). When a live flow requires a person to approve in a browser, run that live leg only locally on demand—never in CI—and wait for the person to approve so the full flow runs end to end.
- **Per-scenario matrices & stateful properties:** Use a per-suite `pairwiseFor` matrix when both sides take identical inputs. When a vendor sandbox decides outcomes by a test key rather than by input (for example, a captcha vendor's pass, refuse, and duplicate test keys), use a per-scenario `pairwiseFor` matrix pairing each fake input with the vendor's matching sandbox key. Properties a stateless vendor sandbox cannot express (such as single-use token consumption) run as fake-only scenarios in the same suite.
- **Store laws:** Store suites verify read-after-write and non-mutating reads (plus further laws only where documented). Never delete a contract suite or compare a seeded fake against an empty real store.

For Storybook preview I/O stand-ins and their contract suites, follow `ui-testing` pack: `stories-get-io-from-stand-ins-beside-the-io-module.md`.

```typescript
// WRONG: identical input against a key-driven sandbox, or asserting raw wire status
expect(rawResponse.status).toBe(400)
// RIGHT: per-scenario pairwiseFor pairing fake input with vendor sandbox key
const scenarioPair = (sandboxSecret: string) =>
  pairwiseFor(
    {
      a: { name: 'fake', layer: CaptchaGateLive({ origin: fakeOrigin, secret: fakeSecret }) },
      b: { name: 'sandbox', layer: CaptchaGateLive({ origin: 'https://captcha.example', secret: sandboxSecret }) },
    },
    CaptchaGate,
  )
```
