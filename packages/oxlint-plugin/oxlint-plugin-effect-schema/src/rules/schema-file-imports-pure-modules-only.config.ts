import {
  EFFECT_PURE_SUBPATHS,
  EFFECT_ROOT_PURE_NAMES,
  isRelativeSchemaSpecifier,
} from '@systemfsoftware/oxlint-import-origin'

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const PURE_IMPORT_EXPECTED =
  "a *.schema.ts file to import only the pure modules R6 names: the audited pure `effect/*` facades, `effect/Effect` for a fallible codec getter, Effect's schema family (Schema, SchemaAST, SchemaGetter, SchemaTransformation, SchemaIssue, SchemaParser, Encoding), the arbitrary module a `toCodecArbitrary` hook derives from, another relative *.schema.js / *.schema.ts file, or an @systemfsoftware/* workspace package. A bare `effect` import is allowed only when every imported name is a pure root name, a schema-family name, or `Effect`." as const

export const PURE_IMPORT_ACTUAL =
  'a value import from {{source}}, which is outside the schema file\u2019s pure set' as const

export const EFFECT_ROOT_ACTUAL = 'a value import from `effect` whose names ({{names}}) are not all pure' as const

export const PURE_IMPORT_FIX =
  'delete the import and take the dependency as data, make it type-only when only its types are used, or move the code that needs it to a module whose home is not a schema file; a schema file declares a pure type and the operations over it' as const

export const SCHEMA_FAMILY_NAMES: readonly string[] = [
  'Schema',
  'SchemaAST',
  'SchemaGetter',
  'SchemaTransformation',
  'SchemaIssue',
  'SchemaParser',
  'Encoding',
]

export const SCHEMA_FAMILY_SUBPATHS: readonly string[] = SCHEMA_FAMILY_NAMES.map((name) => `effect/${name}`)

/**
 * KTD5's source allowlist. The arbitrary module is `effect/unstable/arbitrary`
 * because Effect no longer re-exports `fast-check` (see
 * `repos/effect/migration/annotations/effect__FastCheck.yaml`); a bare
 * `fast-check` import stays refused.
 */
export const ALLOWED_IMPORT_SOURCES: ReadonlySet<string> = new Set([
  ...EFFECT_PURE_SUBPATHS,
  'effect/Effect',
  ...SCHEMA_FAMILY_SUBPATHS,
  'effect/unstable/arbitrary',
  'effect/unstable/arbitrary/Arbitrary',
])

export const ALLOWED_IMPORT_PREFIXES: readonly string[] = [
  '@systemfsoftware/',
  'effect/unstable/arbitrary/',
]

export const EFFECT_ROOT_ALLOWED_NAMES: ReadonlySet<string> = new Set([
  ...EFFECT_ROOT_PURE_NAMES,
  'Effect',
  ...SCHEMA_FAMILY_NAMES,
])

export const isAllowedImportSource = (source: string): boolean =>
  source === 'effect' ||
  ALLOWED_IMPORT_SOURCES.has(source) ||
  ALLOWED_IMPORT_PREFIXES.some((prefix) => source.startsWith(prefix)) ||
  isRelativeSchemaSpecifier(source)

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.schema.ts file imports only the pure modules R6 names: the audited pure effect facades, the schema family, effect/Effect, the arbitrary module a toCodecArbitrary hook derives from, another relative schema file, and workspace packages. Any other value import — a Node builtin, a relative non-schema module, another third-party package — is refused. A bare `effect` import is allowed only when every imported name is a pure root name, a schema-family name, or `Effect`. Type-only imports are ignored. A dynamic `import()` or `require()` is judged by the same allowlist, and one whose source is not a string literal is refused as unprovable; a dynamic call inside an `import.meta.vitest` block is ignored. A re-export from a source outside the pure set is reported here as well as by schema-file-exports-schemas-only, which refuses every re-export from a schema file.',
  },
  schema: [],
  messages: {
    nonPureImport: MESSAGE,
  },
} as const
