## 8.0.0

### Major Changes

- The bundled `@noble/hashes` dependency advances from `1.8.0` to `2.4.0`. Hashing and random-byte generation are unchanged — the same digests and the same output. The CLI now requires **Node 20.19 or later**; on an earlier Node it will not start.

- The package now declares no runtime dependencies: installing it installs this package alone, and everything it uses is inlined into the published executable. The JavaScript parser is included as WebAssembly rather than a platform-specific binary, so one install works on every platform Node supports.

  The package publishes one importable entry, `./package.json`, and no program entry: the `stryker` command remains its only surface.

  The parser runs on Node's WASI support, so Node prints `ExperimentalWarning: WASI` on standard error the first time it parses. Standard output, the exit code and the run-event stream are unchanged, and a command that never parses — `--version`, `--help` — writes nothing to either descriptor.

### Patch Changes

- Releases the workspace so its published versions track the shared dependency graph this change moves.
