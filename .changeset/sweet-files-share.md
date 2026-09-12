---
"@systemfsoftware/stryker-js-cli": major
---

The package now declares no runtime dependencies: installing it installs this package alone, and everything it uses is inlined into the published executable. The JavaScript parser is included as WebAssembly rather than a platform-specific binary, so one install works on every platform Node supports.

The package publishes one importable entry, `./package.json`, and no program entry: the `stryker` command remains its only surface.

The parser runs on Node's WASI support, so Node prints `ExperimentalWarning: WASI` on standard error the first time it parses. Standard output, the exit code and the run-event stream are unchanged, and a command that never parses — `--version`, `--help` — writes nothing to either descriptor.
