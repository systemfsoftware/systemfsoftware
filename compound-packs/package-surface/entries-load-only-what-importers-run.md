---
title: An entry loads only what every importer of it runs; a heavy or runtime-specific module is reached through a subpath or a dynamic import at the point of use
applies_when:
  - adding a re-export to a package's root entry or to a barrel module
  - importing a module that pulls a runtime-specific API (Node built-ins, WebAssembly, a native addon, a browser global) or a large dependency
  - adding a static import to a Worker's entry module or to anything its entry imports
tags: [exports-map, barrel, dynamic-import, startup, worker, runtime]
---

An entry (a package's root or subpath, or a barrel module) re-exports a module only when every importer of that entry runs in a runtime that can load it and needs it at load time.
A module that loads a runtime-specific API or a large dependency some importers do not use is reached through its own subpath, so only the importers that use it load it.
In a Worker, code that only some requests run, and any module whose load is expensive, is imported with `await import()` inside the handler or the code path that uses it, never at the top of a module the entry reaches.

Decision test: for each static import or re-export the diff adds to an entry, a barrel, or a module a Worker entry reaches, the pull request names the importers or requests that run it. The diff fails when an entry gains a module that one of its importers cannot load in its runtime (for example, a deploy script running under Node reaching a module that imports a `.wasm` file), or when a Worker entry's import graph gains a module only some requests use.

Defect prevented: an importer that never calls a module still loads it, so a module meant for one runtime breaks every other importer of the entry, and every module in a Worker's global scope counts against the startup limit on every isolate start.

```ts
// WRONG: the package root re-exports a service that loads a Node-only bundler,
// so a deploy script that only needs the schemas loads the bundler (and its .wasm) too
export * from './deploy.service.ts'
export * from './schemas.ts'
```

```ts
// RIGHT: the root carries what every importer runs; the bundler sits behind its own subpath,
// and the Worker loads it only on the request that builds
export * from './schemas.ts'
// package.json: "./deploy": "./dist/deploy.service.js"
const { deploy } = await import('@acme/apps/deploy')
```

Source: Cloudflare Workers limits, "Worker startup time": "A Worker must parse and execute its global scope (top-level code outside of handlers) within 1 second. Larger bundles and expensive initialization code in global scope increase startup time." and "To reduce startup time, avoid expensive work in global scope. Move initialization logic into your handler or to build time." (https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time). Node.js package documentation, "Package entry points": the exports field lets a package "clearly define the public interface" and expose entries per consumer (https://nodejs.org/api/packages.html#package-entry-points). This pack's subpaths-serve-consumers.md already names "a dependency, a runtime-specific API or a side effect that other importers of the root must not pay for" as a reason for a subpath; this rule makes keeping such a module out of a shared entry required rather than allowed.

Gate: judge
