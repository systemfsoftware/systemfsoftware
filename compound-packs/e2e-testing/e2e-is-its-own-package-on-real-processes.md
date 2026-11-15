---
title: An end-to-end test is a makeFeature Feature in a package of its own that ships nothing, driving the real system through Playwright or HTTP
applies_when:
  - a behaviour needs the real CLI binary, a real server process, or several services running together
  - deciding where a test that starts processes belongs, or how it is named
  - a lint check reports test-suffix-outside-src or e2e-tier-placement
tags: [e2e, gherkin, real-processes, tiers, playwright]
---

Put end-to-end tests in a package of their own (such as `apps/example-shop-e2e`) that ships nothing: no `src/` directory, and no `exports`, `main`, `module` or `bin` in `package.json`. Place each suite under `tests/` as `<subject>.e2e.ts` (never in `tests/__fixtures__/` or outside `tests/`, which `e2e-tier-placement` refuses, and never as `*.e2e.test.ts`, which `test-suffix-outside-src` refuses outside `src/` and `e2e-tier-placement` refuses under it). No package declares itself end-to-end.

Write every end-to-end test as a `makeFeature` Feature from `@systemfsoftware/effect-gherkin-spec`. It drives the system as it ships through what a person or calling system observes: a real browser driven by Playwright, or its HTTP surface. Its stack and browser are scoped Effect layers supplied through `Feature(...).withLayer(...)`.

The lint rule `test-suffix-outside-src` asks for `<subject>.e2e.ts` on any Feature none of whose value imports reaches the repository's own code (followed through the modules it imports from its own `tests/`), and for `.integration.test.ts` on a Feature that does reach it. `e2e-tier-placement` refuses an e2e Feature in a package that ships code, one that names the repository's code even as a type, and an `.e2e.ts` file outside `tests/` or inside `tests/__fixtures__/`.

A behaviour that needs real IO is specified here rather than as an integration Feature that stubs the IO or does none; such a Feature is deleted (testing pack: `features-specify-our-systems-observable-behaviour.md`).

```typescript
// WRONG: apps/example-hotel-e2e/tests/booking.e2e.ts imports the repository's own code
import { reserveRoom } from 'example-hotel'

// RIGHT: apps/example-hotel-e2e/tests/booking.e2e.ts drives the shipped app through scoped layers
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Layer } from 'effect'
import { BrowserLayer, StackLayer } from './__fixtures__/stack.ts'

const Feature = makeFeature({ it })

Feature('Booking a room')
  .live('runs the shipped server and a real browser')
  .withLayer(Layer.provideMerge(BrowserLayer, StackLayer))
  .body(({ scenario }) => {
    scenario('A guest books a double room', Gherkin.Do.pipe(/* Given, When, Then */))
  })
```
