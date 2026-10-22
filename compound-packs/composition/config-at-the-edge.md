---
title: Only applications read configuration and choose Layers; libraries take their dependencies as services
applies_when:
  - reading an environment variable, a binding or a secret
  - choosing which implementation of a service runs
  - a library needs a value that differs per deployment
tags: [composition, config, layers, composition-root]
---

Configuration is read at an application's composition root and nowhere else. A library declares what it needs as services (and the `Config` it would read, if any, inside a `layerConfig` it exports). The application decides which Layer to provide and supplies the values. A library never reads `process.env`, a Worker `env`, or a binding directly.

Effect's `Config` and Layers make this the type-checked path: an unprovided service is a compile error at the edge. Rat Stack goes further, with Layers that carry their cloud resources, so removing a resource's wiring stops the code that uses it from compiling.

Gate (fact-gated): `repo-checks composition-graph` fails a library that reads `process.env`, `Deno.env` or `import.meta.env` (found in the syntax tree; `process` and `Deno` are followed through `const p = process`, `import * as p from 'node:process'`, a default import under any name, `globalThis.process` and a named `import { env } from 'node:process'`; a local with the same name is not the global), a parameter, destructured `{ env }` or property whose type the compiler resolves to Cloudflare's `Env` (declared in `namespace Cloudflare`, or an interface extending it) or to an object with one of Cloudflare's binding classes (`KVNamespace`, `D1Database`, ...) declared by Cloudflare's own types as a property, or an `env` import from `cloudflare:workers`. No name decides it: a parameter called `env` whose type the compiler cannot resolve (dependencies not installed) is not flagged, and the check reports the libraries whose imports it cannot resolve so they can be re-run with dependencies installed. Where Layers are bound is governed by `cell-architecture/service-and-layer-boundaries`.
