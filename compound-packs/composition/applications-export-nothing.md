---
title: An application's manifest has no exports; what two applications share lives in a library both depend on
applies_when:
  - adding an exports map to a worker, SPA or site
  - another unit wants to import code from an application
  - tests want to reach code inside an application
tags: [composition, application, exports]
---

An application is deployed, not imported, so its `package.json` has no `exports` field. Code inside an application that another unit needs gets extracted into a library. Tests of an application drive its deployed entry (the Worker's fetch or RPC handler), never its internal modules (`tests-stay-home`).

A Worker that exports its modules invites every other unit to bind to its internals. younna-ai's `workers/platform` exported 136 subpaths, and the platform could no longer change without breaking unrelated tests.

Gate (fact-gated): `repo-checks composition-unit-kinds` fails an application with an `exports` field.
