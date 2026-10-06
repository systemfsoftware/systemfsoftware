---
"@systemfsoftware/effect-workerd-harness": minor
---

The layer can serve the Worker over a real loopback socket. Pass `port` (and optionally `host`) to reach the Worker over TCP at that address in addition to `dispatchFetch`, or omit `port` to let the OS assign one; the bound address is exposed as `url` on the resolved service. The listener is up before the layer resolves, so a client opening its own connection cannot race the start.

`bundleWith` also bundles a Worker entry with import-path aliases applied by the bundler, so an entry can import through a specifier the repository aliases. `bundle` keeps its one-argument form.
