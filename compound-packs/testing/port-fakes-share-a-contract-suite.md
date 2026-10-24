---
title: A port's fake is built through the port's constructor and runs in one contract suite beside the real adapter
applies_when:
  - writing a fake for a port, or adding an operation to a port that has one
  - writing a stand-in for a remote service a port talks to
tags: [testing, fake, contract-test, port, store]
---

A port fake is built through the port's own service constructor (Tag.of inside Layer.effect(Tag) or Layer.succeed(Tag)), never through Layer.mock, a partial object, a never-typed stub or a type assertion, the fake's module under tests/__fixtures__ included; it implements every operation of the port.

Every port fake runs in one contract suite whose histories run against the fake and the real adapter through pairwiseFor and expect the same result, the same tagged failure for a refused operation included, and every operation of the port appears in at least one history; no test or story uses a fake that suite does not run, so a consumer that builds its own double runs that suite over it in its own tests.

A store port's suite (a port over state that outlives one interaction) asserts read-after-write, that a repeated read changes nothing, that operations on different keys commute, and last-write-wins for blind writes.

A stand-in for a remote peer refuses every request the provider documents as refused for each header, parameter, body field and body framing the adapter sends, and each refusal is a contract-suite scenario.

```WRONG
const fakeMessages = Layer.succeed(Messages)({ post: () => Effect.void } as unknown as MessagesShape)
```

```RIGHT
const fakeMessages = Layer.effect(Messages)(Effect.gen(function*() {
  const sent = yield* Ref.make<ReadonlyArray<string>>([])
  return Messages.of({ post: (text) => Ref.update(sent, (all) => [...all, text]), history: Ref.get(sent) })
}))
const OnBothAdapters = pairwiseFor({ a: { name: 'fake', layer: fakeMessages }, b: { name: 'real', layer: realMessages } }, Messages)
```

Gate: judge
