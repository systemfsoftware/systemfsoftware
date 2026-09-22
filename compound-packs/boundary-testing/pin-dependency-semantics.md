---
title: Pin third-party dependency semantics with differential contract tests
applies_when:
  - adopting, upgrading, or wrapping a third-party driver, SDK, or platform protocol
  - code relies on subtle vendor behaviors (e.g. lazy evaluation, socket reader lifecycles, stream backpressure)
  - documenting assumptions about external library lifecycles
tags: [boundary, dependency, contract-testing, differential, assumptions]
---

When boundary adapters rely on non-obvious third-party protocol semantics (e.g., an Effect platform socket constructor being lazy until a reader stream is acquired), never document that critical invariant in prose or rely on memory.

1. **Executable Assumption Pins**: Pin third-party behavioral assumptions in dedicated contract tests that compare the vendor library against native platform behavior or specifications.
2. **Cross-Lineage Reference**: Compare the candidate library wrapper against a raw standard reference (e.g., native `net.createConnection` vs. `@effect/platform-node/NodeSocket`).
3. **Upgrade Tripwire**: When dependency versions are updated in lockfiles, the pin test must re-fire automatically. If vendor semantics change (e.g. an API becomes eager instead of lazy, or changes error variants), the pin fails immediately before application code silently regresses.
4. **No Internal Smuggling**: Contract tests must import the third-party library and testing utilities, never reaching into unexported internal application modules.

```ts
// WRONG: A code comment warning developers about third-party laziness
// Note: NodeSocket.makeNet is lazy! Be sure to acquire the reader or it won't dial!
const socket = NodeSocket.makeNet(...) // Easily forgotten or broken by refactoring!

// RIGHT: An executable contract test pinning the third-party assumption
// tests/vendor-socket-laziness.contract.test.ts
import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { createServer } from 'node:net'

test('NodeSocket.makeNet dials upon reader acquisition, not at constructor call', async () => {
  const { port, connectionPromise } = await startListener()
  const socket = await Effect.runPromise(NodeSocket.makeNet({ host: '127.0.0.1', port }))
  // Constructor did not dial
  expect(connectionPromise.isSettled).toBe(false)
  
  // Acquiring reader executes the dial
  await Effect.runPromise(Effect.scoped(socket.reader))
  expect(await connectionPromise).toBe(true)
})
```

Gate: `lint` — verify that non-standard third-party lifecycle assumptions are protected by automated contract tests.
