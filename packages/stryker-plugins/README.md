# @systemfsoftware/stryker-plugins

![version](https://img.shields.io/npm/v/@systemfsoftware/stryker-plugins)
![license](https://img.shields.io/npm/l/@systemfsoftware/stryker-plugins)

> Stop Effect `Schema` declarations from dragging your Stryker score below 100%.

A brand description, a `_tag`, a `title` — mutate any of them and the source changes but the behaviour does not, so no test can ever kill the mutant. Those unkillable mutants sit in your report forever, indistinguishable from real coverage gaps. This [Stryker](https://stryker-mutator.io) Ignore plugin removes them, so the score that remains is behaviour.

## Install

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

Mutants it recognizes are reported as `Ignored`, each carrying the reason it was safe to skip.

> [!NOTE]
> `@stryker-mutator/api` is a peer dependency — your Stryker install provides it. `effect` is a direct dependency (the plugin decodes AST nodes with `Schema`).

## What it ignores

| Declaration                                               | Example                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Brand descriptions                                        | `Symbol.for('UserId')`                                            |
| `TaggedClass` / `TaggedError` tags                        | `S.TaggedClass<A>()('Placed', {…})`                               |
| The field schemas of those declarations                   | the `{…}` above                                                   |
| `optionalWith` defaults                                   | `S.optionalWith(S.Number, { default: () => 0 })`                  |
| Documentation annotations                                 | `identifier`, `description`, `title`, `documentation`, `examples` |
| An `annotations({…})` object that is _only_ documentation | `S.annotations({ title: 'Amount' })`                              |

## Where the line is

Every ignore is proven redundant, never merely assumed — anything a test could observe keeps its mutants.

`arbitrary`, `pretty`, `equivalence`, `message`, `jsonSchema` and `parseIssueTitle` are **not** documentation: each changes what the schema does, so a survivor there is a test gap to close. That is why the two `annotations` rules differ — a `title` is ignored wherever it appears, but the enclosing object is ignored only when every entry documents, since emptying an object holding an `arbitrary` would silently change what your property tests generate.

## Contributing

Development setup and workflow: [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
