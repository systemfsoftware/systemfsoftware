---
title: A boundary adapter is tested against a real local resource or vendor sandbox, asserted only through the port
applies_when:
  - writing or reviewing tests for a socket, file, HTTP, database or platform-binding adapter
  - writing a stand-in peer for a third-party service an adapter talks to
  - replacing a platform driver, binding or runtime object with a mock, spy or hand-built object
tags: [testing, adapter, boundary, mocks, stand-in, microvm]
---

Test a boundary adapter against a real resource booted in a microVM (`integration-testing` pack)—or the platform's local runtime (Miniflare for a Cloudflare binding or an out-of-process fake Worker in `port-fakes-share-a-contract-suite.md`), never in a container, on the host, or as another child process. A database adapter's cases create and read state strictly through the port's own operations; any case that seeds or queries with SQL is deleted (`sql-tests-are-not-behaviour-tests.md`), and a query populated only by another system is proven through the shipped system (`sql-tests-are-not-behaviour-tests.md`).

Never pass `vi.fn`, `vi.mock`, `vi.spyOn`, or a hand-built object (including a type-guarded fake) where code expects a platform driver, binding, or runtime object. The sole exception is a Storybook stand-in contract suite's factory-less `vi.mock` of the app's own I/O module (`port-fakes-share-a-contract-suite.md`).

Run the adapter's cases as scenarios in the port's contract suite (`port-fakes-share-a-contract-suite.md`), covering acceptance (live peer validates the protocol contract and returns a value) and every declared refusal (absent, closed, or refusing peer yields the port's declared tagged error). Assert only our adapter's domain outcome—never raw HTTP statuses, vendor JSON bodies, or a stand-in's request log, headers, order, or call count.

```typescript
// WRONG: asserting the peer's recorded wire request
Then('the provider receives the charge')((s, expect) =>
  expect(peer.received).toEqual([{ method: 'POST', authorization: 'Bearer test-key' }])),
// RIGHT: asserting the port caller's observable tagged outcome
Then('the charge fails as unreachable and never as paid')((s, expect) =>
  expect(s.charge).toEqual(Result.fail(new PaymentsUnreachable()))),
```
