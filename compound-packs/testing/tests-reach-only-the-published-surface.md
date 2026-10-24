---
title: Tests reach a package only through the entries its consumers import, and nothing is exported for a test
applies_when:
  - a test needs a module the package's public entries do not expose
  - adding an imports map, a subpath or an export to a package
tags: [testing, exports, imports-map, public-api]
---

A test under tests/ imports its own package only by the package name and the entries its package.json exports field declares for consumers, never by an imports-map (#...) specifier; it imports helpers only from tests/**fixtures**.

Never add an imports map, a ./testing, ./test-utils or other subpath, or an export from any entry so that a test can reach a module; a law about a pure module's own code is an in-source property test in that module.

Whether an export or entry exists for consumers or only for tests is decided by the review judge from its importers; an uncertain case escalates.

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
import { Orders } from '@example/orders' // the capability, driven through the public entry
```

Gate: judge
