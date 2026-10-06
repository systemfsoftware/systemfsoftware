# @systemfsoftware/debt-ledger

Builds one debt ledger from tracked source and holds it at zero undeclared entries.

Every exception in the repo — an inline suppression, a Rust `allow`/`expect`/`ignore` attribute, a
skipped test, a TODO-family marker, an effective `off`/`warn` config severity, or a declared opt-in
— becomes one `Entry`. Each entry is `Declared` (a name, a reason, an owner), `Undeclared`, or
`Stale` (a declaration that matched no grant).

A `pnpm-patch` channel reads `patchedDependencies` from the root `pnpm-workspace.yaml` and joins each
listed patch to a `ThirdPartyPatch` opt-in: a patch with no matching grant is `Undeclared`, and a grant
whose patch is no longer listed is `Stale`.

Scanners are AST/lexer based, never regex over raw text: a directive spelled inside a string literal
is not an entry. Configuration is read by importing it (Vite `runnerImport`) and evaluating the
`extends` graph, spreads and overrides — the effective value, not the file text.

## Commands

```sh
debt-ledger build [--dir <repo>]   # write debt.md and debt.json from one model
debt-ledger check [--dir <repo>]   # regenerate in memory; fail on Undeclared, Stale, or byte drift
```

Both read `<dir>/debt-ledger.config.ts`. `check` fails non-zero on any `Undeclared`, any `Stale`
declaration, a committed artifact that differs byte-for-byte from regeneration, or an empty or
unscanned input root; its success line names the files and channels it scanned.

## Config

```ts
export default {
  roots: ['packages', 'crates', 'apps'],
  exclude: ['repos/**', 'node_modules/**'],
  mdPath: 'docs/debt.md',
  jsonPath: 'docs/debt.json',
}
```

The model lives in `src/Entry.schema.ts`; the Markdown and JSON renderers both read it, so the
JSON entry count, the Markdown row count and the per-kind totals are one number.
