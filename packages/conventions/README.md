# @systemfsoftware/conventions

A composable, **GritQL-first** conventions platform: a growing library of structural rules,
executed by the pinned [grit](https://docs.grit.io/) engine (Rust), that gates any repo with
one devDependency — and accepts **your own GritQL rules in the same scan**.

## Adopt

```sh
pnpm add -D @systemfsoftware/conventions
pnpm exec conventions scan 'packages/**/tsconfig.json'
```

Exit codes: `0` clean · `1` findings at/above `--level` · `2` broken instrument (missing engine,
unreadable rules, empty selection — a broken gate is never green).

## Bundled rules

| Rule                              | Surface         | What it enforces                                                                                                                                                   |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `require_tsconfig_node_reference` | `tsconfig.json` | every first-party tsconfig declares `references: [{ "path": "./tsconfig.node.json" }]` so config scripts are typechecked (basename-tolerant; JSONC comments parse) |

The library grows by accretion: each new convention is a new rule file in `rules/`, on any
surface the engine targets (json, js/ts, yaml, css, markdown, python, rust, go, sql, …).

## Plug in your own rules (GritQL)

Any `.md` pattern file or bare `.grit` file composes into the same scan:

```sh
pnpm exec conventions scan src/ --rules ./my-grit-rules/
```

A rule file is plain GritQL in the engine's markdown pattern format — copy this to start:

````markdown
---
level: error
---

# No TODO keys in JSON

Flags any JSON document carrying a `TODO` key.

```grit
engine marzano(0.1)
language json

`$program` where {
  $program <: contains `"TODO": $_`
}
```
````

```
Consumer rules are namespaced (`consumer_<name>`) so they can never silently shadow a
bundled rule. Learn the query language at [docs.grit.io/language](https://docs.grit.io/language);
rewrite-style rules can also use `grit patterns test` for native test cases.

## CLI
```

conventions scan [--rules <path>...] [--ignore <glob>...] [--level error|warn|info] [roots-or-files...]

```
- A positional containing glob characters is a **root**: walked for the rules' target files
  (`node_modules`/`.git` always excluded). Otherwise it is a literal file path (precommit mode;
  empty selection tolerated for files, fails loud for roots).
- `--ignore` takes path prefixes (`dir`, `dir/**`, `dir/sub`). Exemptions are yours to declare
  and version in your script.

## The engine

Rules are GritQL data; the engine is the pinned `@getgrit/cli` `0.1.0-alpha.1743007075`
(literal, in `dependencies`). The bin resolves the engine **PATH-first** (a nix devShell,
any global grit), falling back to the dependency's launcher binary.

Notes for locked-down environments:

- The npm launcher's postinstall downloads the engine binary from GitHub releases. Where build
  scripts are denied, put the `grit` binary on PATH instead (this repo ships a pinned
  `nix/grit.nix`; a manual install is `tar -xzf grit-<target>.tar.gz` from the release page).
- Release binaries are glibc builds; Alpine/musl hosts need the PATH variant.
- Engine upgrades are package releases: the pin moves through the changeset pipeline, never
  silently. If upstream stops shipping usable binaries or JSON parsing regresses under a
  re-pin, the MIT engine forks — the rule files survive any engine that speaks GritQL.
```
