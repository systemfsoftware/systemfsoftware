---
title: A port's fake lives in the test tree, is built through the port's constructor and runs in one contract suite beside the real adapter; the one src/ exception is the Storybook preview's stand-ins and their fixture controls
applies_when:
  - writing a fake, stub or in-memory stand-in for a port or service, or adding an operation to a port that has one
  - a module in src/ is imported only by tests
  - a package wants to ship a test double to its consumers
  - writing a Storybook stand-in for the I/O layer or the router, or its fixture controls
  - deciding whether a stand-in or fake needs a contract suite, or whether a contract test can be removed
tags: [testing, fake, contract-test, port, store, fixtures, test-double, storybook]
---

Applies to: whoever writes, changes or reviews a test double of a port or service, a Storybook stand-in, or a contract suite, in any package or app.

Build a port fake through the port's own service constructor (`Tag.of` inside `Layer.effect(Tag)` or `Layer.succeed(Tag)`), never `Layer.mock`, a partial object, a never-typed stub or a type assertion, and implement every operation of the port.

Every test double a package's tests use for its own ports or services lives under that package's `tests/__fixtures__`, never in src/. No package publishes a test double; a consumer builds its own.

The one exception is the Storybook preview's stand-ins, each in a `__mocks__` folder beside the module it replaces, where `sb.mock` resolves it: the I/O layer stand-in `src/io/__mocks__/layer.ts`, the app's fixture-controls module `src/io/__mocks__/fixture-controls.ts`, which names the controls that steer the stand-in's timing and failures and holds no data, and the router stand-in `src/__mocks__/router.tsx` (ui-testing pack: stories-get-io-from-stand-ins-beside-the-io-module.md). Tests never import them, except the I/O layer stand-in's own contract suite at `tests/io-layer.contract.test.ts`, which imports the stand-in and the fixture controls by the app's source alias; stories never import `tests/__fixtures__`. Every service the I/O layer stand-in provides is a port fake, and the contract-suite paragraph below applies to it as to any other. The I/O layer stand-in owns the stand-in data. The fixture controls are built from primitives in their own workspace package, `packages/fixture-controls`, which imports nothing from any app. That package is mechanism, not a test double, and is not modelled as an I/O service. The router stand-in is the real router on memory history, not a fake. Neither the package nor the router stand-in has a contract suite.

Every port fake runs in one contract suite whose pairwise scenarios (`pairwiseFor`) run against the fake and the real adapter and expect the same result, the same tagged failure for a refused operation included. Every operation of the port appears in at least one scenario, and no test or story uses a fake that suite does not run. The suite lives in the `tests/` of the package or app whose tests or stories use the fake (the ui-testing pack's worked-example-preview-stand-ins-story-and-contract-suite.md shows one whole). A package that doubles another package's port writes its own contract suite through that package's published entry. The suite's Feature follows features-specify-our-systems-observable-behaviour.md.

A store port's suite asserts read-after-write and that a read changes nothing; it asserts a further law (independent keys, last-write-wins) only where the port's documentation promises it.

Prove a fake's fidelity by running the same suite on the real adapter, never by re-deriving a third party's documentation into the fake. A contract suite is required and is never removed as a low-value test: its Then reads what the port's caller gets back from each side, which is our behaviour, unlike a scenario that reads a stand-in's received requests (failing-tests-are-fixed-not-weakened.md).

```typescript
// WRONG: src/messages.fake.ts, imported only by tests
const fakeMessages = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)
// WRONG: a story pushes data into a fixture module
export const Shown = { beforeEach: () => setMessages([{ id: 'm-1', text: 'Hello' }]) }
// WRONG: fixture controls modelled as an I/O service
export class FixtureControls
  extends Context.Service<FixtureControls, { readonly messages: Ref.Ref<ReadonlyArray<Message>> }>()(
    'app/FixtureControls',
  )
{}
// WRONG: control primitives defined inside the app, in src/io/__mocks__/fixture-controls.ts
export const makeFault = (name: string) => {/* ... */}
// RIGHT: tests/__fixtures__/messages.fake.ts, built through the port and run by the port's contract suite
export const MessagesFake = Layer.succeed(Messages)(Messages.of({ post: () => Effect.void }))
```
