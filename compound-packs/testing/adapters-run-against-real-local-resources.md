---
title: A boundary adapter is tested against a real local resource, for acceptance and refusal, and asserted only through the port its callers use
applies_when:
  - writing or reviewing tests for a socket, file, process, HTTP, database or platform-binding adapter
  - writing a stand-in for a third-party service an adapter talks to
  - a test replaces a platform driver, binding or runtime object with a mock, spy or hand-built object
tags: [testing, adapter, boundary, mocks, stand-in, third-party]
---

Test a boundary adapter against a real local resource: a loopback listener on 127.0.0.1:0, a real temporary directory, a real child process, an embedded engine or the platform's local runtime. No test, behaviour test or adapter suite alike, passes a mock, spy or hand-built object where the code under test expects a platform driver, binding or runtime object. Never test an adapter against a vi.fn, vi.mock or vi.spyOn stub, or a hand-built object standing in for any platform driver, binding or runtime object, however it is typed; a type guard or predicate that admits a hand-built object counts as a type assertion.

The adapter's cases are scenarios in the port's contract suite (port-fakes-share-a-contract-suite.md); a case that needs a peer state only the real resource has (a closed port, a full disk) runs against the adapter alone. They include an acceptance case, where a live local peer answers and the port returns its value, and a refusal case, where an absent, closed or refusing peer makes the port fail with its declared tagged error and never report success.

A case asserts only what the port's caller receives: the value, or the declared failure. The stand-in for a third party plays a peer that answers or refuses; whatever the adapter must send for the peer to answer is proven by the port returning the value, never by asserting the stand-in's record of the request (method, URL, header, body field). The stand-in answers any request the third party would accept, and refuses only on the condition the scenario names (no credential, a closed port, an answer the port maps to a declared failure). It never checks request fields, order or count beyond that condition: a stand-in that rejects all but one exact request re-pins the third party's wire format inside the fixture. The refusal cases are one per failure the port declares. In each, the local peer refuses the way the real service does, and the case is named and asserted by the port's declared failure, never by the peer's status code or message. A refusal the port does not declare has no case.

Decision: the judge fails the suite or the Feature if the adapter, or the code under test, runs against anything but a real local resource (a hand-built binding admitted through a type guard counts), if acceptance or refusal is missing, if the stand-in checks the request beyond the condition its scenario names, or if any assertion reads the stand-in's received requests or names the third party's wire format instead of the port's result. An uncertain case escalates.

Defect it prevents: a mocked driver encodes the author's belief about the driver, so the test passes when the real one behaves differently; and a suite that asserts the vendor's request shape tests the vendor's contract, not ours, and breaks when the vendor changes while our callers' outcome is unchanged.

```typescript
// WRONG
const http = { fetch: vi.fn(async () => new Response('{"ok":true}')) }
Then('the provider receives the charge')((s, expect) =>
  expect(peer.received).toEqual([{ method: 'POST', authorization: 'Bearer test-key' }])),
```

```typescript
// RIGHT: a loopback peer that refuses a request without a credential and answers any other
When('the order is charged')('charge', () => Payments.charge(order).pipe(Effect.result)),
Then('the charge is accepted')((s, expect) => expect(s.charge).toEqual(Result.succeed({ status: 'accepted' }))),
// and, against a closed port
Then('the charge fails as unreachable and never as paid')((s, expect) =>
  expect(s.charge).toEqual(Result.fail(new PaymentsUnreachable()))),
```

Source: Kent C. Dodds, Write tests (https://kentcdodds.com/blog/write-tests): "When you mock something you're removing all confidence in the integration between what you're testing and what's being mocked." Martin Fowler, Mocks Aren't Stubs (https://martinfowler.com/articles/mocksArentStubs.html): state verification against behaviour verification.

Gate: judge
