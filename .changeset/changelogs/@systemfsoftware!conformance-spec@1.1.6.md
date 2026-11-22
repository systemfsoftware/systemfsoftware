# @systemfsoftware/conformance-spec@1.1.6

Dev dependency bump (@types/node) only; the packed tarball is unchanged.

No consumer-visible package changes.

On Node 26 a run that waited on a file read as a deadlock: Node 26 leaves pending file requests out of `process.getActiveResourcesInfo()`, the list the kernel read its host waits from. `Kernel.run` takes a `host` option naming where it reads them, and `Kernel.fileRequestHooks(createHook)` follows file requests through `async_hooks` while keeping the process list for sockets, DNS lookups and timers. The kernel still imports no Node module: the caller passes `createHook`. `Conformance.released` reads the source from `Kernel.HostResourcesService` when it is provided.

Rebuilt with tsdown 0.23.7 against the updated dev dependencies: the bundled `dist/` files carry a different hashed runtime chunk name and comment markers, and the declared devDependency ranges move. The public API and runtime behaviour are unchanged.
