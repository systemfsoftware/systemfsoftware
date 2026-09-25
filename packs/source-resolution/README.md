# source-resolution

Rules that keep a workspace package's published name resolving to its own
`src/` while a workspace tool reads it, and to `dist/` for a registry consumer.
They replace the four-wire static check
`scripts/guards/check-dev-conditions.ts` and the `workspace-source-resolution`
skill: the export map (tsdown), the config that owns each importer (tsconfig
`customConditions`), the test runner (Vite's two condition keys), and
api-extractor (which must **not** follow source).

| Rule                          | Check                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `export-map-order`            | every `exports` object subpath: condition first, then `types` into `dist/`, then `default` — only in a package with a bundler config      |
| `publish-config-exports`      | `publishConfig.exports` exists, holds no bare-string subpath, and carries no condition                                                    |
| `tsdown-exports`              | the bundler config names `devExports` as the condition string, declares `customExports`, and does not set `clean: false`                  |
| `tsconfig-condition`          | a project with a non-empty `include` names the condition in `customConditions`, extends a configured preset, or extends a sibling project |
| `tsconfig-preset-module-mode` | a declared preset resolves a NodeNext/Node16/Bundler/preserve module mode and does not clear or mis-name the condition                    |
| `vitest-conditions`           | a Vitest config imports the shared config, or sets both `resolve.conditions` and `ssr.resolve.conditions`                                 |
| `shared-vitest-config`        | the shared config names the condition and sets both Vite condition pipelines                                                              |
| `api-extractor-tsconfig`      | the extractor's `compiler.tsconfigFilePath` target clears `customConditions`                                                              |
| `internals-export-map`        | a package **without** a bundler config carries no condition in its export map                                                             |
| `tsconfig-paths`              | no tsconfig maps the package's own published name through `compilerOptions.paths`                                                         |

## Enable it

```json
{
  "packs": {
    "source-resolution": {
      "condition": "r\"['\\\"]@systemfsoftware/source['\\\"]\"",
      "presets": "r\"\\\"@systemfsoftware/tsconfig/.*\\\"\"",
      "presetFiles": "r\".*/tsconfig/(?:(?:bundler|tsc)/.*|node)\\.json\"",
      "sharedVitestConfig": "r\"['\\\"]@systemfsoftware/vitest-config['\\\"]\"",
      "sharedVitestConfigFile": "r\".*/vitest-config/lib/base\\.js\""
    }
  }
}
```

## Parameters

Every value is a **GritQL pattern fragment**: the pack binds it as a pattern
definition (`pattern condition() { <value> }`) and each rule applies it with
`<:`. A value may therefore be a snippet or a regex, and a regex must match the
whole node it is applied to — including the quotes of a JSON key or a JavaScript
string. All five are required.

| Parameter                | Applies to                                                           | Meaning                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `condition`              | a JSON key or a JavaScript string node                               | the development source condition. Quote-aware: written as a character class so it matches `"@scope/source"` in JSON and `'@scope/source'` in TS alike                                                                                                                                  |
| `presets`                | a tsconfig `extends` specifier (string node, quotes included)        | the presets a project may extend in place of listing the condition itself. A list of specifiers becomes one regex                                                                                                                                                                      |
| `presetFiles`            | the path of a tsconfig file, relative to the scan root               | the in-tree presets that must **each** carry a module mode. `tsconfig-preset-module-mode` also holds them to the condition they name, so a preset contributing only `plugins` (this repo's `effect.json` and `effect-entrypoint.json`, extended beside `tsc/*`) is deliberately absent |
| `sharedVitestConfig`     | an import specifier (string node, quotes included)                   | the shared Vitest config module a package may import instead of wiring both Vite condition keys itself. A list of modules becomes one regex                                                                                                                                            |
| `sharedVitestConfigFile` | the path of the shared Vitest config file, relative to the scan root | the one file `shared-vitest-config` checks directly — the file the guard reads                                                                                                                                                                                                         |

## Design notes

- **Cross-language joins.** `export-map-order`, `publish-config-exports` and
  `internals-export-map` read a `package.json` and need to know whether the
  sibling `tsdown.config.ts` exists: that is what decides consumer-safe versus
  internals, and it is what `export-map-order` requires before it reports an
  export-map defect. `scan` hands a multifile rule the files of its own
  language, so each of those rules also names `tsdown.config.ts` in a `file()`
  pattern; gritlint then adds an other-language file matching that name as a
  **name-only participant** whose body is never read, so the TypeScript file is
  never handed to the JSON grammar and produces no parse diagnostic.
- **Every rule names its files.** A rule is evaluated per directory over the
  files of its language that its `file()` name patterns match, so naming a file
  is also what keeps the rule from being handed the rest of the tree — including
  files the pinned grammars cannot parse. Two rules that identify their files by
  a path parameter (`tsconfig-preset-module-mode`, `shared-vitest-config`)
  therefore _also_ carry a literal name pattern, which shapes the batch; the
  parameter still decides.
- **Absence.** `internals-export-map` needs "no `tsdown.config.ts` here". A
  multifile step's top level must be a `file()` pattern, so it gathers the
  sibling's name into a bubble variable with `if`/`else` and then requires that
  variable to be `undefined` — `bubble`-shared state is how a fact gathered from
  one file reaches the step that checks another.
- **One hop of `extends`.** GritQL cannot resolve a specifier to a file, so
  `tsconfig-condition` accepts an `extends` matching `presets` or a relative
  specifier, and `tsconfig-preset-module-mode` checks the declared preset files
  directly. `tsconfig-paths` compares the mapped key against the manifest name
  by capturing both as regex captures, which is the one comparison form that
  detects a difference across bubbles.
- **Known gaps.** A consumer-safe package whose `exports` lost the condition on
  _all_ of its object subpaths (so that no subpath key order can be judged) is
  not reported by `export-map-order`; `tsdown-exports` reports the same mistake
  one layer up, as a missing `devExports`.
