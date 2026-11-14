---
title: Port fakes live in tests/__fixtures__ and run in a pairwise contract suite beside the real adapter
applies_when:
  - writing or updating a fake, stub or stand-in for a port or service, or adding a port operation
  - a module in src/ is imported only by tests, or a package exports a test double
  - writing a Storybook I/O stand-in, router stand-in or fixture controls
  - deciding whether a fake or stand-in needs a contract suite
tags: [testing, fake, contract-test, port, store, test-double, storybook]
---

Build every port fake through the port's constructor (`Tag.of` inside `Layer.effect(Tag)` or `Layer.succeed(Tag)`), implementing every operation—never `Layer.mock`, partial objects, or type casts. Keep all test doubles in `tests/__fixtures__/`, never in `src/` and never published by a package.

Every port fake runs in a `pairwiseFor` contract suite in `tests/` against both the fake and the real adapter, covering every port operation (including declared tagged failures) and expecting identical results on both sides. Store suites verify read-after-write and non-mutating reads (plus further laws only where documented). Never delete a contract suite or compare a seeded fake against an empty real store. Outbound-port fakes expose read operations so Features can assert outbound effects in port terms.

**Storybook exception:** An app's Storybook preview stand-ins live beside their modules in `src/io/__mocks__/layer.ts` (owning stand-in data), `src/io/__mocks__/fixture-controls.ts` (named timing/failure controls built from `src/io/__mocks__/control-primitives.ts`, not an I/O service), and `src/__mocks__/router.tsx` (real router on memory history). Tests never import `__mocks__` directly; `tests/<port>.contract.integration.test.ts` uses factory-less `vi.mock('<io module>')` and `vi.importActual('<io module>')` to compare the stand-in against the real I/O module before any story uses it.

```typescript
// WRONG: src/messages.fake.ts with partial cast
const fakeMessages = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)
// RIGHT: tests/__fixtures__/messages.fake.ts via port constructor, run by contract suite
export const MessagesFake = Layer.succeed(Messages)(Messages.of({ post: () => Effect.void }))
```
