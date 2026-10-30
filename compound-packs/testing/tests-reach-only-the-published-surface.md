---
title: Tests reach a package only through the entries its consumers import, and nothing is exported for a test
applies_when:
  - a test needs a module the package's public entries do not expose
  - adding an imports map, a subpath or an export so a test can reach a module
tags: [testing, exports, imports-map, public-api]
---

A test under tests/ imports its own package only by the package name and the entries its exports field declares for consumers, never by an imports-map (`#...`) specifier or a relative path into src/. It imports helpers only from `tests/__fixtures__`.

Never add an imports map, a `./testing` or `./test-utils` subpath, or an export so a test can reach a module. A law about a pure module's own code is a unit or property test in src/, in-source or under src/**tests**, never under tests/, and builds no Feature.

```typescript
// WRONG
import { HealthBoard } from '#orders/health-board.js'
// RIGHT
import { Orders } from 'orders'
```
