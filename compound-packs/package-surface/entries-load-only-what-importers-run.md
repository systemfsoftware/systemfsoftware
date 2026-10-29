---
title: A package's entry loads only what every importer of it runs; a runtime-specific or heavy module lives where only its users load it
applies_when:
  - adding a re-export to a package's `.` entry or to a barrel module
  - importing a module that pulls a runtime-specific API (Node built-ins, WebAssembly, a native addon, a browser global) or a large dependency
  - adding a static import to a Worker's entry module or to anything its entry imports
tags: [exports-map, barrel, dynamic-import, startup, worker, runtime, adapter]
---

A package's `.` entry, and any barrel inside it, re-exports a module only when every importer of the package runs in a runtime that can load it and needs it at load time.
A module that loads a runtime-specific API or a large dependency some importers do not use leaves the shared entry. It moves to the application that uses it, or to its own adapter library once a second application needs it. When the same names have one implementation per runtime, the package selects between them with an export condition on `.`. A subpath key is never the answer: no `./deploy`, `./node` or `./workerd` entry.
In a Worker, code that only some requests run, and any module whose load is expensive, is imported with `await import()` inside the handler or the code path that uses it, never at the top of a module the entry reaches.

Decision test: for each static import or re-export the diff adds to a `.` entry, a barrel, or a module a Worker entry reaches, the pull request names the importers or requests that run it. The diff fails:

- when a package's `.` entry gains a module that one of its importers cannot load in its runtime (for example, a deploy script running under Node reaching a module that imports a `.wasm` file);
- when a Worker entry's import graph gains a module only some requests use;
- when the fix adds a subpath key to keep a module out of `.`.

Defect prevented: an importer that never calls a module still loads it, so a module meant for one runtime breaks every other importer of the entry, and every module in a Worker's global scope counts against the startup limit on every isolate start.

```ts
// WRONG: the library's `.` re-exports a service that loads a Node-incompatible bundler,
// so a deploy script that only needs the schemas loads the bundler (and its .wasm) too
export * from './deploy.service.ts'
export * from './schemas.ts'
```

```ts
// WRONG: the same service moved behind its own subpath key
// package.json: "exports": { ".": "./dist/index.js", "./deploy": "./dist/deploy.service.js" }
```

```ts
// RIGHT: the library's `.` carries what every importer runs; the deploy service lives in the
// Worker application that deploys, which loads it only on the request that builds
export * from './schemas.ts'
// in the Worker application:
const { deploy } = await import('./deploy.service.ts')
```

Source: Cloudflare Workers limits, "Worker startup time": "A Worker must parse and execute its global scope (top-level code outside of handlers) within 1 second. Larger bundles and expensive initialization code in global scope increase startup time." and "To reduce startup time, avoid expensive work in global scope. Move initialization logic into your handler or to build time." (https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time). Node.js package documentation, "Conditional exports": "Conditional exports provide a way to map to different paths depending on certain conditions" (https://nodejs.org/api/packages.html#conditional-exports). The owner's ruling (2026-10-23) that a library exports `.` only, that a runtime difference is an export condition on `.` and never a runtime key, and that a driver or runtime implementation lives in the application or its own adapter library.

Gate: judge
