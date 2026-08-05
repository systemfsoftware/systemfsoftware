# Native Crates

Contributor map for Rust workspace members under `crates/`. They are implementation details behind `@oh-my-pi/pi-natives` and its embedded shell; package consumers use JavaScript entrypoints, not these crate APIs.

The root `Cargo.toml` includes `crates/pi-*` and `crates/vendor/*` as workspace members. It also patches crates.io `brush-core` and `brush-builtins` to the vendored copies.

## First-party crates

| Crate           | Path                                              | Role and consumers                                                                                                                                              |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pi-natives`    | [`crates/pi-natives`](../crates/pi-natives)       | Top-level N-API `cdylib`. It exposes the JS-visible API and depends on `pi-ast`, `pi-iso`, `pi-shell`, `pi-voice`, `pi-walker`, and `pi-uutils-ctx`.            |
| `pi-shell`      | [`crates/pi-shell`](../crates/pi-shell)           | Persistent embedded brush shell, command execution/minimization, process plumbing, filesystem walking, and in-process command integration used by `pi-natives`. |
| `pi-voice`      | [`crates/pi-voice`](../crates/pi-voice)           | Cross-platform microphone/playback and Opus/WebRTC support used by the `AudioCapture`, `AudioPlayback`, and `LiveWebRtcPeer` bindings.                          |
| `pi-ast`        | [`crates/pi-ast`](../crates/pi-ast)               | tree-sitter/ast-grep language registry, matching/editing, block analysis, and summarization support across the workspace grammar set.                           |
| `pi-iso`        | [`crates/pi-iso`](../crates/pi-iso)               | Isolation backend implementations and diffing for APFS, Linux/Windows clone/reflink paths, overlayfs, ProjFS, and recursive copy fallback.                      |
| `pi-walker`     | [`crates/pi-walker`](../crates/pi-walker)         | Parallel, cache-aware filesystem walker using ignore rules and globsets; shared by native grep/glob/workspace paths and shell commands.                         |
| `pi_uu_grep`    | [`crates/pi-uu-grep`](../crates/pi-uu-grep)       | ripgrep-library-backed `grep` implementation with `pi-uutils-ctx` I/O/path routing. In-process shell builtin entrypoint: `pi_uu_grep::run`.                     |
| `pi_uu_diff`    | [`crates/pi-uu-diff`](../crates/pi-uu-diff)       | `similar`-backed `diff` with `pi-uutils-ctx` I/O/path routing. In-process shell builtin entrypoint: `pi_uu_diff::run`.                                          |
| `pi-uutils-ctx` | [`crates/pi-uutils-ctx`](../crates/pi-uutils-ctx) | Thread-local stdin/stdout/stderr and working-directory context for embedding vendored uutils and custom commands without changing process-global state.         |

Crate package names intentionally differ for the two custom uutils-style commands: their Cargo packages are `pi_uu_grep` and `pi_uu_diff` (underscores), while their directories use hyphens.

## Vendored workspace crates

| Group                 | Paths                                                                                                                        | Purpose                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brush                 | [`crates/vendor/brush-core`](../crates/vendor/brush-core), [`crates/vendor/brush-builtins`](../crates/vendor/brush-builtins) | Vendored shell engine and POSIX/bash builtins consumed by `pi-shell`. Their manifests retain upstream package metadata; workspace patches select these local forks. |
| uutils commands       | `crates/vendor/uu-*`                                                                                                         | In-process coreutils-style command crates consumed selectively by `pi-shell`, including file, text, checksum, process/system, and pipeline utilities.               |
| Shared uutils support | [`crates/vendor/uu-checksum-common`](../crates/vendor/uu-checksum-common) and other dependency crates in `vendor/`           | Supporting code required by the selected command crates; not direct N-API modules.                                                                                  |
| jq implementation     | [`crates/vendor/jaq`](../crates/vendor/jaq)                                                                                  | In-process JSON query command used by the shell.                                                                                                                    |

`pi-shell/Cargo.toml` is the authoritative list of commands linked into the embedded shell. A directory being a workspace member does not by itself mean that `pi-natives` exposes it as a JavaScript API.

## Boundary map

```text
@oh-my-pi/pi-natives JS entrypoints
  -> pi-natives (N-API conversion, platform bindings, task boundaries)
       -> pi-ast / pi-iso / pi-voice / pi-walker
       -> pi-shell
            -> brush-core + brush-builtins
            -> pi_uu_grep + pi_uu_diff + vendored uu-* + jaq
            -> pi-uutils-ctx (per-invocation I/O and cwd)
```

For the loader and JS boundary, see:

- [`natives-architecture.md`](./natives-architecture.md)
- [`natives-addon-loader-runtime.md`](./natives-addon-loader-runtime.md)
- [`natives-binding-contract.md`](./natives-binding-contract.md)

Subsystem details live in:

- [`natives-build-release-debugging.md`](./natives-build-release-debugging.md)
- [`natives-media-system-utils.md`](./natives-media-system-utils.md)
- [`natives-rust-task-cancellation.md`](./natives-rust-task-cancellation.md)
- [`natives-shell-pty-process.md`](./natives-shell-pty-process.md)
- [`natives-text-search-pipeline.md`](./natives-text-search-pipeline.md)
- [`fs-scan-cache-architecture.md`](./fs-scan-cache-architecture.md)

## Documentation policy

These crates remain contributor-facing implementation details. Promote one to standalone user-facing documentation only when it gains a public API or executable consumed independently of `@oh-my-pi/pi-natives`; see [`user-facing-packages.md`](./user-facing-packages.md).
