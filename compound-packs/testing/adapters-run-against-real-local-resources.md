---
title: A boundary adapter is tested against a real local resource, for both acceptance and refusal
applies_when:
  - writing or reviewing tests for a socket, file, process, HTTP or database adapter
  - a test replaces a platform driver with a mock or spy
tags: [testing, adapter, boundary, mocks]
---

Test a boundary adapter against a real local resource (a loopback listener on 127.0.0.1:0, a real temporary directory, a real child process or an embedded engine). Never test a boundary adapter against a vi.fn, vi.mock or vi.spyOn stub or a hand-shaped object standing in for net, fs, child_process, an HTTP client or a database driver.

Every adapter suite must include an acceptance scenario where a live local peer is accepted. Every adapter suite must include a refusal scenario where an absent, closed or refusing peer fails with the adapter's declared error and never reports success.

Gate: judge
