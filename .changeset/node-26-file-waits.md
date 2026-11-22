---
"@systemfsoftware/effect-sim-kernel": minor
"@systemfsoftware/conformance-spec": patch
---

On Node 26 a run that waited on a file read as a deadlock: Node 26 leaves pending file requests out of `process.getActiveResourcesInfo()`, the list the kernel read its host waits from. `Kernel.run` takes a `host` option naming where it reads them, and `Kernel.fileRequestHooks(createHook)` follows file requests through `async_hooks` while keeping the process list for sockets, DNS lookups and timers. The kernel still imports no Node module: the caller passes `createHook`. `Conformance.released` reads the source from `Kernel.HostResourcesService` when it is provided.
