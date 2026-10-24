# @systemfsoftware/tooling-package-layers

Private workspace tool that checks the repository's package layer map, `package-layers.json`, against every `packages/**/package.json`. The CLI is an Effect application run by Bun; `pnpm gate:layers` runs it in `check:local`, `check:ci` and the CI `layers` lane.

## Commands

```sh
bun tooling/package-layers/bin/package-layers.ts check [--root <dir>]
bun tooling/package-layers/bin/package-layers.ts list [--root <dir>] [--json]
```

`--root` points at another tree holding `package-layers.json` and `packages/`; it defaults to the repository that holds this tool.

- `check` reads the map and every manifest. On success it prints each layer with its packages, the cross-layer `devDependencies` (reported, never failed) and a summary line. On failure it prints one `::error title=layers-<Finding>::<message>` line per finding and a count.
- `list` prints `package  category` per mapped package, or a JSON array of `{ "package", "category" }` with `--json`.

## Exit status

| Status | `check`                                                                                                     | `list`                                          |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0      | the tree passes every rule                                                                                  | the map was printed                             |
| 1      | the tree is refused: a broken rule, or an unreadable or undecodable `package-layers.json` or `package.json` | `package-layers.json` cannot be read or decoded |
| 2      | bad usage: an unknown subcommand or flag, or a `--root` that is not a directory                             | same                                            |

Running the bin with no subcommand, or with `--help`, prints help and exits 0. The same table appears in each command's `--help`.

## Rules

`package-layers.json` assigns each package to one of `core`, `harness`, `spec-trace`, `extracted` or `frontend`. `check` refuses with these findings:

| Finding             | When                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapRefused`        | `package-layers.json` is missing, is not JSON, or does not have exactly the five layer keys, each an array of names                                                               |
| `ManifestRefused`   | a `package.json` under `packages/` cannot be read or decoded                                                                                                                      |
| `DuplicateName`     | the map lists one name twice                                                                                                                                                      |
| `DuplicateManifest` | two manifests declare one name                                                                                                                                                    |
| `MissingPackage`    | a `core`, `harness` or `spec-trace` name has no manifest (`extracted` and `frontend` may be absent)                                                                               |
| `UnmappedPackage`   | a manifest's name is not in the map                                                                                                                                               |
| `SchemaLawVitest`   | `@systemfsoftware/effect-schema-law` names `@systemfsoftware/vitest` in a runtime or peer field (directly or as a `vitest` npm alias), or has a `vitest` peer not marked optional |
| `ForbiddenEdge`     | a runtime or peer edge (`dependencies`, `optionalDependencies`, `peerDependencies`) crosses a forbidden pair                                                                      |

Forbidden pairs: `core` to `harness`, `spec-trace`, `extracted` or `frontend`, judged over the core package's whole packed runtime closure (through other core packages); `harness` to `core`, `spec-trace` or `extracted`; `spec-trace` to `extracted`. Harness and spec-trace edges are judged directly. `devDependencies` never fail.

## Tests

- `pnpm --filter @systemfsoftware/tooling-package-layers test`: the in-source `it.prop` laws over the decision (every layer pair against the rule table, the core chain into each non-core layer, the fork peer in every field, duplicate and missing names, the map's key set) and the Gherkin scenarios over the committed trees in `tests/__fixtures__`. `properties` runs only the in-source laws.
- `pnpm --filter @systemfsoftware/tooling-package-layers test:bin`: runs `bin/package-layers.ts` under Bun and asserts every exit status in the table above. It needs `bun` on PATH, so `pnpm gate:layers` runs it in the CI `layers` lane rather than the hosted test lanes.
