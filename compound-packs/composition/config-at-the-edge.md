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

Gate: `repo-checks composition-graph` fails a library that references `process.env`, `Deno.env`, `import.meta.env` or a Cloudflare `env` parameter. Where Layers are bound is governed by `cell-architecture/service-and-layer-boundaries`.
