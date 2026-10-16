---
title: Encode external protocol lifecycles in distinct static evidence types
applies_when:
  - wrapping a third-party client, network protocol, or asynchronous resource
  - handling multi-step connection, handshake, authentication, or readiness states
  - writing or reviewing boundary adapters that interact with lazy platform APIs
tags: [boundary, types, protocol, compile-time-safety, evidence]
---

Bugs caused by protocol lifecycle confusion (e.g. confusing an initialized handle with an established connection, or a prepared transaction with a committed one) must be made unrepresentable at compile time.

1. **Evidence-Bearing Types**: Boundary operations must return tagged, distinct evidence types reflecting their true physical state (e.g., `Unconnected` vs. `Connected`, `Prepared` vs. `Committed`).
2. **Gated Outcomes**: Higher-level operations and decision outcomes must demand proof of physical execution in their parameter types. Code cannot transition to a "Ready" or "Success" state given an unexecuted or unverified handle without causing a TypeScript compile error.
3. **Exhaustive Matching**: Always pattern-match exhaustively across all physical states, ensuring failure and refusal branches are handled explicitly.

```ts
// WRONG: A handle that might or might not be connected is treated as ready
export const checkService = (handle: SocketHandle) => 
  handle.isCreated ? Result.succeed(ServiceReady) : Result.fail(...) 
  // Bug: creation is not connection!

// RIGHT: Compile-time proof of connection
export type ConnectionEvidence =
  | { readonly _tag: 'Connected'; readonly endpoint: Endpoint }
  | { readonly _tag: 'Refused'; readonly endpoint: Endpoint; readonly cause: unknown }

export const evaluateReady = (evidence: ConnectionEvidence): Result.Result<ServiceStatus, ConnectionError> =>
  Match.value(evidence).pipe(
    Match.tag('Connected', (c) => Result.succeed(new ServiceReady({ endpoint: c.endpoint }))),
    Match.tag('Refused', (r) => Result.fail(new ConnectionFailed({ cause: r.cause }))),
    Match.exhaustive,
  )
```

Gate: `type-checker` — verify that state transition functions demand evidence types proving completion of required boundary actions.
