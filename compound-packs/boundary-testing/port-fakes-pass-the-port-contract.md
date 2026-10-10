---
title: A port's fake is typed to the port and passes one contract suite shared with the port's real adapter
applies_when:
  - writing an in-process fake for a port, for any consumer
  - an AI agent proposes a cast, a partial object or a hand-shaped stub standing in for a service
  - adding a port, or changing the operations of an existing one
tags: [boundary, ports, fakes, contract-test, parity, typing]
---

A port's fake is typed to the port with no cast standing in for a service, and it passes one contract suite shared with the port's real adapter; for a store, that suite is the one `fake-and-real-store-laws.md` defines. Every test that runs over a fake trusts that the fake answers the way the real adapter would. A fake that only compiles proves the port's shape and nothing about its behaviour, and a fake behind a cast does not prove even the shape. Shore's "Replace Mocks with Nullables" replaces every kind of test double with a dependency whose behaviour is real code. His Narrow Integration Tests prove that code against the outside world: "Test your external communication for real".

1. **Typed to the port.** The fake implements the port's service through the same constructor the real adapter uses, so reshaping the port stops the fake from compiling until the fake is changed to match.
2. **No cast stands in for a service.** No `as`, `as unknown as`, partial object or `never`-typed stub fills a service's place. An operation the fake cannot honour fails with the port's own declared error.
3. **One suite, both adapters.** The contract suite is written once as histories of the port's operations. Each history runs against the fake and against the real adapter, and both must give the same result, including the same tagged failure for a refused operation. The suite runs in the lane the store law suite uses, the Behaviour lane of the Test Lanes table in `packages/oxlint-plugin/oxlint-plugin-test-discipline/README.md`.
4. **The real adapter runs against a local oracle.** The real side runs against the local system `real-system-oracles.md` requires. A port whose peer is a remote service is no exception: the suite starts a local test system that speaks the peer's protocol, and stops it when done.
5. **Stores use their law suite.** For a port over shared state, the contract suite is the law suite `fake-and-real-store-laws.md` defines. This rule adds nothing to it.
6. **No port is exempt.** A fake with no contract suite is not admissible to any test that runs over it.

```ts
import { Effect, Layer, Ref } from 'effect'
import { Messages, type MessagesShape, SendFailed } from './messages.ts'

// WRONG: a cast stands in for the service. The fake has no history, still compiles when
// the port gains an operation, and no suite runs it beside the real adapter.
const castFake = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)

// RIGHT: the fake is built through the port's own constructor, and one history runs
// against it and against the real adapter.
const fakeMessages = (options: { readonly refuse: ReadonlyArray<string> }) =>
  Layer.effect(Messages)(
    Effect.gen(function*() {
      const sent = yield* Ref.make<ReadonlyArray<string>>([])
      return {
        post: (text: string) =>
          options.refuse.includes(text) ? Effect.fail(new SendFailed()) : Ref.update(sent, (all) => [...all, text]),
        history: Ref.get(sent),
      }
    }),
  )

const refusedPostLeavesHistoryUnchanged = Effect.gen(function*() {
  const messages = yield* Messages
  yield* messages.post('Hello all')
  const refused = yield* Effect.flip(messages.post('spam'))
  return { refused: refused._tag, history: yield* messages.history }
})
// expected: { refused: 'SendFailed', history: ['Hello all'] }, for fakeMessages({ refuse: ['spam'] }) and for
// the real adapter against a local test server that refuses 'spam'
```

Grounds: James Shore, Testing Without Mocks (https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks), "Replace Mocks with Nullables" and "Narrow Integration Tests"; `fake-and-real-store-laws.md` and `real-system-oracles.md` in this pack.

Gate: `review` — reject a fake that reaches its service through a cast or a partial object, and a fake that no contract suite runs beside the real adapter; the compiler rejects a fake built through the port's constructor once the port changes shape.
