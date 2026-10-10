---
title: One shared history runs against the Storybook I/O fake and the real Layer, and both agree
applies_when:
  - implementing or changing a port's layerTest that the Storybook fake uses
  - a fake can diverge in behaviour (fault timing, landing phases) from the real adapter
  - reviewing a fake whose only equivalence guard is its type
  - a PR claims no local oracle exists for an I/O service
tags: [storybook, fakes, parity, laws, oracle, integration]
---

One shared scenario history runs against the I/O fake and against the real Layer pointed at a local oracle (for example emulate.dev, or a local node), and both produce the same observable outcome.

Every story runs over the fake, so a fake that behaves differently from the real adapter makes every story built on it wrong while each one stays green. Its type proves the shape and nothing about the behaviour: when a post lands, which faults surface, what a read sees after a write. Only a history run against both catches the gap. This is the law `boundary-testing/fake-and-real-store-laws.md` states for one store, applied to the composed Layer behind the UI.

1. **One history, two Layers.** Each history is written once and run twice: once provided the port's `layerTest`, once provided the real layer from its `<cap>.adapter.ts` with the runtime it needs pointed at the local oracle. Both runs assert the same observable outcome.
2. **Where the suite lives.** It is a behaviour suite outside `src/`, named and placed as the Test Lanes table in `packages/oxlint-plugin/oxlint-plugin-test-discipline/README.md` places a behaviour suite. It takes the behaviour lane's suffix and adds none of its own.
3. **Stores keep their own suite.** A service that is a store keeps its law suite under `boundary-testing/fake-and-real-store-laws.md`, which also owns how real-side faults are raised. For a store, the history here adds only outcomes that cross services.
4. **The floor.** Where no local oracle exists for an I/O service, the PR names that service and says why its oracle could not run. Only then are the type anchor (`io-fake-typed-to-its-port`) plus a contract test the floor for that service.

```ts
// the history, written once
const postedMessageIsListed = Effect.gen(function*() {
  const messages = yield* Messages
  yield* messages.post(general, 'Hello all')
  return yield* messages.list(general)
})

// WRONG: the history runs only against the fake, so its type is the sole proof that it behaves
// like the real adapter. If the real adapter lists a post only after it lands, no story sees the gap.
const againstFakeOnly = postedMessageIsListed.pipe(Effect.provide(Messages.layerTest))
// expected: one message listed, checked against the fake alone

// RIGHT: the same history runs against the fake and against the real adapter on a local oracle,
// in a behaviour suite outside src/
const againstFake = postedMessageIsListed.pipe(Effect.provide(Messages.layerTest))
const againstReal = postedMessageIsListed.pipe(
  Effect.provide(MessagesAdapter.layer.pipe(Layer.provide(localOracle))),
)
// expected for both: exactly one message, 'Hello all', listed in general
```

Gate: `review` — verify that every service in the fake I/O Layer has a shared history run against both its `layerTest` and its real adapter on a local oracle, or that the PR names the service and why its oracle could not run.
