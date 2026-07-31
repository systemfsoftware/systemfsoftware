# @systemfsoftware/stryker-plugins

[Stryker](https://stryker-mutator.io) mutation-testing plugins for [Effect](https://effect.website).

## `effect-schema-ignorer`

A Stryker **Ignore** plugin (`effect-schema-declarations`) that skips the _equivalent_ mutants on Effect `Schema` declarations — mutations that change source without changing behaviour, so no test can ever kill them. It recognizes and ignores:

- brand descriptions in `Symbol.for('…')`,
- `Schema.TaggedClass` / `Schema.TaggedError` `_tag` identifiers,
- the field schemas of those declarations,
- `optionalWith` default values,
- the documentation entries of an `annotations({…})` call — `identifier`, `description`, `title`, `documentation`, `examples`,
- an `annotations({…})` object whose entries are _all_ documentation.

The last two are deliberately asymmetric. Replacing a `title` cannot change what a
schema does, so it is ignored wherever it appears. Emptying the whole object can —
`annotations({ arbitrary })` holds the generator the property tests draw from, and
dropping it silently changes what gets generated. So an object is ignored only when
every entry in it documents; one behaviour-bearing sibling keeps the object mutated
while its documentation entries stay ignored.

`arbitrary`, `pretty`, `equivalence`, `message`, `jsonSchema` and `parseIssueTitle`
are absent from the documentation set by design: each alters observable behaviour, so
a surviving mutant of one is a test gap to close, never an equivalent mutant to hide.

Schema declarations are **data, not behaviour** (Constitution Article III §4) — mutating them produces unkillable equivalent mutants that drag a mutation score below 100% for no real coverage gap. This plugin removes that noise so the score reflects logic.

## Usage

```bash
pnpm add -D @systemfsoftware/stryker-plugins
```

In `stryker.config.json`:

```jsonc
{
  "plugins": [
    "@stryker-mutator/vitest-runner",
    "@stryker-mutator/typescript-checker",
    "@systemfsoftware/stryker-plugins"
  ],
  "ignorers": ["effect-schema-declarations"]
}
```

> [!NOTE]
> `@stryker-mutator/api` is a peer dependency — your Stryker install provides it. `effect` is a direct dependency (the plugin decodes AST nodes with `Schema`).
