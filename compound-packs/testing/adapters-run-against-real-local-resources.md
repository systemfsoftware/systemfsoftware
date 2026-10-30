---
title: A boundary adapter is tested against a real local resource, for acceptance and refusal, and asserted only through the port its callers use
applies_when:
  - writing or reviewing tests for a socket, file, HTTP, database or platform-binding adapter
  - writing a stand-in for a third-party service an adapter talks to
  - a test replaces a platform driver, binding or runtime object with a mock, spy or hand-built object
tags: [testing, adapter, boundary, mocks, stand-in, third-party]
---

Test a boundary adapter against a real resource that runs in a container, never on the host (the integration-testing pack says where IO may run): a database, broker or peer started per test, an embedded engine, or the platform's local runtime. A child process is never a test resource.

Never pass a `vi.fn`, `vi.mock` or `vi.spyOn` stub, or a hand-built object (a type guard that admits one counts as a type assertion), where the code under test expects a platform driver, binding or runtime object.

The adapter's cases are scenarios in the port's contract suite (port-fakes-share-a-contract-suite.md). Include an acceptance case (a live local peer answers and the port returns its value) and one refusal case per failure the port declares (an absent, closed or refusing peer makes the port fail with its declared tagged error, never report success).

A case asserts only what the port's caller receives: the value or the declared failure. Never assert the stand-in's record of the request (method, URL, header, body field). The stand-in answers any request the third party would accept and refuses only on the condition the scenario names; it never checks request fields, order or count beyond that.

```typescript
// WRONG
Then('the provider receives the charge')((s, expect) =>
  expect(peer.received).toEqual([{ method: 'POST', authorization: 'Bearer test-key' }])),
// RIGHT
Then('the charge fails as unreachable and never as paid')((s, expect) =>
  expect(s.charge).toEqual(Result.fail(new PaymentsUnreachable()))),
```
