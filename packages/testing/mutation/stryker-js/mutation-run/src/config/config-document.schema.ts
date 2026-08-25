import * as S from 'effect/Schema'

/**
 * A Stryker config document read from disk or imported from a JS module: any
 * object record.
 *
 * `S.Record(S.String, S.Unknown)` (`S.Record` at `repos/effect/packages/effect/src/Schema.ts:3948`,
 * `S.String` at `repos/effect/packages/effect/src/Schema.ts:3133`, `S.Unknown` at
 * `repos/effect/packages/effect/src/Schema.ts:3083`) is genuinely open: user-authored
 * config documents have open extension points (plugin-defined keys, custom
 * `ignorers`/`checkers`/`reporters`, etc.) and value shapes are validated later
 * by `validateOptions` against `StrykerOptionsSchema` / `forkOptionsSchema`
 * (`S.StructWithRest` at `repos/effect/packages/effect/src/Schema.ts:4182`). Tightening
 * this boundary to a `S.Struct` would duplicate that validation and change the
 * surface: documents that are `Record`-valid but field-invalid would be rejected
 * here with a schema error instead of the validator's `ConfigFileInvalidError`
 * path. This decode only establishes that the document is an object — never a
 * hand-written `isRecord` narrowing.
 */
export const ConfigDocumentSchema = S.Record(S.String, S.Unknown)

/**
 * The shape of an imported JS config module as seen through the dynamic
 * `import()` boundary: a module namespace whose `default` export is the
 * config document. Only the default export is read here.
 *
 * `S.Unknown` for `default` (`S.Struct` at `repos/effect/packages/effect/src/Schema.ts:3568`,
 * `S.optional` at `repos/effect/packages/effect/src/Schema.ts:2498`, `S.Unknown` at
 * `repos/effect/packages/effect/src/Schema.ts:3083`) is genuinely open: the caller
 * needs to distinguish a `function` export ("Exporting a function is no longer
 * supported") from a non-object export for tailored `log.fatal` messages before
 * falling back to `ConfigFileInvalidError`. Decoding `default` as `S.Record`
 * would collapse both to a generic schema error and lose that UX. The
 * object-ness of a present default is validated next via `ConfigDocumentSchema`.
 */
export const ImportedModuleSchema = S.Struct({
  default: S.optional(S.Unknown),
})
