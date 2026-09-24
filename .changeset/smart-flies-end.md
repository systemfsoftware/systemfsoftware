---
"@systemfsoftware/effect-memfs": minor
---

The layer from `MemoryFileSystem.make(...).layer` now also provides a `MemoryFileSystem.Watcher` service, so a test can tell exactly when a watch is live instead of yielding and hoping. `watcher.start(path, options)` completes only once the watch is registered and returns its event stream; stopping the scope closes the watch. `watcher.awaitOpen(path)` waits until a watch on `path` is open, which covers code under test that watches through the plain `FileSystem.watch`. `watcher.openWatches` lists the paths that still have an open watch, so a test can check that nothing was left watching. `makeDirectory` on a path that already holds a file now fails with `AlreadyExists`, even with `recursive: true`, as Node's filesystem does; it used to succeed.
