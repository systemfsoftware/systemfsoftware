---
title: A private library exports "." only, one mod.ts namespace barrel; runtimes are conditions, drivers and framework bindings are their own libraries, and nothing is exported for tests
applies_when:
  - adding a subpath to a library's exports map
  - a consumer or test wants a file that is not exported
  - adding a ./testing, ./server, ./workerd, ./react or driver-named entry such as ./postgres
  - a library's exports map has any key besides "."
tags: [composition, exports-map, roles, internal]
---

A private library exposes `.` and nothing else: one `mod.ts` barrel of namespaces (`cell-architecture/single-namespace-barrel`). Everything else is unreachable. `"./internal/*": null` blocks it explicitly, and internal files are lowercase or `_`-prefixed.

The keys a library is tempted to add each have a better home:

- **A runtime difference** (`./workerd`, `./browser`, `./node`) is an export condition on `.` pointing at separate files, never its own key (`core-and-adapters`).
- **A driver implementation** (`./postgres`, `./durable-object`) is a Layer the application chooses. It lives in that application, or in its own adapter library once a second application needs it (`config-at-the-edge`).
- **A framework binding** (`./react`) is its own adapter library that depends on the core (`core-and-adapters`).
- **Test support** (`./testing`) is never an entry. A test Layer other packages' tests need is a public Layer exported from `.` beside the live one (`tests-stay-home`).

Two kinds of extra key can be justified one at a time:

- an asset read by path, such as `./styles.css`;
- the config role of a build tool, such as `./vite`, when a tool loads it by specifier.

A published library that serves several runtimes or frameworks may carry more role keys for consumers outside the workspace (Vitest has 14 entries, Effect 21). That is a published-surface decision (`package-topology/declared-entry-points`), not a private library's licence.

TanStack Query exports only `.` and `./package.json`. Effect blocks `./internal/*` and uses casing as the policy: public modules are PascalCase, internal ones lowercase. younna-ai's `workers/platform` published 136 subpaths, one per module, and the platform could no longer change without breaking unrelated tests.

Gate: fact-gated. `repo-checks composition-entries` fails:

- a missing `./internal/*: null` when the library has an internal folder;
- for a private library, two entries that resolve to one file (`./package.json` and a `null` block are not entries).

Judge-gated (`entries-are-roles`, see the README): the same check asks a panel whether the entries are roles, a mirror of the source tree, or exposed internals. Its calibration still treats `./testing`, `./workerd` and driver keys as legitimate roles. Until those cases are relabelled to this rule, any key besides `.` on a private library is reported for review.
