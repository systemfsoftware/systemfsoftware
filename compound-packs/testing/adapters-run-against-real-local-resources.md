---
title: Boundary adapters run against real local resources or sandboxes and assert only port domain outcomes
applies_when:
  - writing or reviewing tests for a socket, file, HTTP, database or platform-binding adapter
  - replacing a platform driver, binding or runtime object with a mock, spy or hand-built object
  - asserting how a boundary adapter handles peer acceptance, refusal or unavailability
tags: [testing, adapter, boundary, mocks, embedded-engine, microvm, local-runtime]
---

Test a boundary adapter against a real resource from the lightest engine tier the adapter's contract needs (pack: testing, integration-io-runs-in-the-lightest-scoped-engine.md)—an in-process embedded engine, the platform's local runtime, or a scoped microVM—never in a container, on the host, or as an ad-hoc child process. A database adapter's contract cases create and read state strictly through the port's own operations, never via raw SQL; a query populated only by another system is proven through the shipped system (`features-specify-our-systems-observable-behaviour.md`).

Never pass `vi.fn`, `vi.mock`, `vi.spyOn`, or a hand-built object (including a type-guarded fake) where code expects a platform driver, binding, or runtime object (for the Storybook preview stand-in exception, see `ui-testing` pack: `stories-get-io-from-stand-ins-beside-the-io-module.md`).

Run the adapter's acceptance and refusal cases in its contract suite (`port-fakes-share-a-contract-suite.md`), covering valid peer responses and every declared tagged error (absent, closed, refusing, or misconfigured peer). Assert only our adapter's domain outcome—never raw HTTP status codes, vendor JSON bodies, or a peer's request log, headers, order, or call count.

```typescript
// WRONG: asserting the peer's recorded wire request or raw HTTP status
Then('the provider receives the charge')((s, expect) =>
  expect(peer.received).toEqual([{ method: 'POST', authorization: 'Bearer test-key' }])),
// RIGHT: asserting the port caller's observable tagged outcome
Then('the charge fails as unreachable and never as paid')((s, expect) =>
  expect(s.charge).toEqual(Result.fail(new PaymentsUnreachable()))),
```
