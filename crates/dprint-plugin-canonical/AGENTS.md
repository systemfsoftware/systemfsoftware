# AGENTS.md — `crates/dprint-plugin-canonical/`

> Root invariants: `AGENTS.md`.

The repo's canonicalising dprint plugin, and the only Rust in the tree. It is not a pnpm workspace member, so `pnpm --filter` cannot reach it and no task in `gate:tasks` builds or tests it.

```yaml
- id: CANON1
  title: The committed wasm is what runs, never the Rust source
  do: rebuild the artifact and commit it in the same change as any `src/*.rs` edit, then re-run the formatter over the tree to see the new behaviour
  dont: edit the source and expect a gate to notice
  harm: "`dprint.json` pins the committed `plugin.wasm` and `check:local` runs `./bin/dprint check` before every other phase, so a source-only edit leaves the whole chain green while formatting keeps doing whatever the last committed binary did. No workspace task rebuilds it and nothing compares it against the source, so the divergence is silent and survives review — the diff shows Rust changing and the behaviour does not"
  check: "`RUSTUP_HOME=$HOME/.rustup CARGO_HOME=$HOME/.cargo nix shell nixpkgs#rustup nixpkgs#gcc --command cargo build --release --target wasm32-unknown-unknown`, the release wasm copied over `plugin.wasm`, and `./bin/dprint check` run again"
```

- **CANON2** — the canonicaliser's laws are `#[cfg(test)]` in `src/canonical.rs` and run only under `cargo test` in the same nix shell as the build; a green `pnpm check:local` is evidence about the committed binary and never about the laws.
