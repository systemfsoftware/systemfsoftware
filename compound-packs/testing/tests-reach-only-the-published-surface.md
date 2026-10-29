---
title: Tests reach a package only through the entries its consumers import, and nothing is exported for a test
applies_when:
  - a test needs a module the package's public entries do not expose
  - adding an imports map, a subpath or an export so a test can reach a module
tags: [testing, exports, imports-map, public-api]
---

A test under tests/ imports its own package only by the package name and the entries its exports field declares for consumers, never by an imports-map (#...) specifier or a relative path into src/; it imports helpers only from `tests/__fixtures__`.

Never add an imports map, a ./testing or ./test-utils subpath, or an export so that a test can reach a module. A law about a pure module's own code is a unit or property test in src/, inside the module (in-source) or under src/**tests**, never under tests/, and it builds no Feature. Which subpaths and names a package exports otherwise follows the package-surface pack.

Decision: the judge lists each import of the package in tests/ and fails any that is not a consumer entry, and fails any new entry or export whose only importers are tests. An uncertain case escalates.

Defect it prevents: a test that reaches past the public entry pins private structure, so a refactor that keeps every consumer working turns it red, and the export added for it becomes surface consumers start to depend on.

```typescript
// WRONG
// package.json
"imports": { "#orders/*": "./src/*" }
// tests/health-board.integration.test.ts
import { HealthBoard } from '#orders/health-board.js'
```

```typescript
// RIGHT
// tests/reporting-order-health.integration.test.ts
import { Orders } from 'orders' // the package's own name, as its exports field declares it
```

Source: Google Testing Blog, Test Behavior, Not Implementation (https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html). Kent C. Dodds, Testing Implementation Details (https://kentcdodds.com/blog/testing-implementation-details): a test of implementation details fails on a refactor that breaks nothing.

Gate: judge
