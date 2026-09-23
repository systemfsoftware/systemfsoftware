---
title: Never author unit tests or mocks for internal I/O glue
applies_when:
  - testing a boundary adapter, driver, client wrapper, or polling loop
  - an AI agent proposes mocking sockets, databases, HTTP clients, or process spawners
  - reviewing unit tests targeting private functions inside boundary modules
tags: [boundary, testing, anti-slop, no-mocks, purity]
---

In an AI-augmented codebase, allowing unit tests with mocks on internal I/O glue results in hallucinated confidence: language models mock the failure away, invent fake property tests over arbitrary constants, or assert against internal call graphs.

1. **No Mocked Driver Seams**: Never create mock implementations or test doubles for platform drivers (`net`, `fs`, `child_process`, database drivers) when testing internal boundary units.
2. **Pure Core vs. Boundary**:
   - If logic has branches, calculations, or decision rules, it belongs in a pure `Workflow` tested by algebraic properties in `src/`.
   - If code merely translates data and calls external drivers, it is an impure boundary. It must be verified through real integration against the local environment or at the composition root.
3. **No Intermediate Helper Tests**: Never write dedicated unit tests for private intermediate functions in boundary files (e.g., connection helpers, stream mappers, poll runners). Test the boundary through its executable entry point.

```ts
// WRONG: Mocking the driver to unit-test an internal boundary function
test('probeConnection returns true when socket connects', async () => {
  const fakeSocket = { connect: vi.fn().mockResolvedValue(true) }
  const result = await internalProbeHelper(fakeSocket, 8080)
  expect(result).toBe(true) // Proves nothing about whether real sockets dial!
})

// RIGHT: Pure decisions are separated; boundaries run against real system oracles
// File 1: pure decision workflow tested by property laws
export const decideReadiness = Workflow.make({ command: AssessTarget, decision: ReadinessVerdict, error: Schema.Never, decide: ... })

// File 2: boundary tested against a real local listener (127.0.0.1:0) in tests/
```

Gate: `review` — reject PRs adding mock objects, `vi.fn()` stubs, or unit tests targeting non-exported boundary functions.
