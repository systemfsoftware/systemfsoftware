import {
  EFFECT_ROOT_PURE_NAMES,
  effectModulePath,
  isRelativeSchemaSpecifier,
  isStateMachineFamilySpecifier,
} from '@systemfsoftware/oxlint-import-origin'

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const PURE_IMPORT_EXPECTED =
  "a *.schema.ts file to import only these pure modules: the audited pure `effect/*` facades, `effect/Effect` for a fallible codec getter, Effect's schema family (Schema, SchemaAST, SchemaGetter, SchemaTransformation, SchemaIssue, SchemaParser), the `effect/encoding` codecs (Base64, Base64Url, Hex, EncodingError), the `effect/Arbitrary` module a `toCodecArbitrary` hook derives from, another relative *.schema.js / *.schema.ts file, or an @systemfsoftware/* workspace package other than the state-machine family (`xstate`, `xstate/*`, `@xstate/*`, `@systemfsoftware/xstate`, `@systemfsoftware/xstate/*`, `@systemfsoftware/xstate-*`), which no schema file may value-import, dynamically import, `require()` or value re-export. An `effect` or `effect/<area>` barrel import is allowed only when every imported name is one of those modules." as const

export const PURE_IMPORT_ACTUAL =
  'a value import from {{source}}, which is outside the schema file\u2019s pure set' as const

export const BARREL_ACTUAL = 'a value import from {{source}} whose names ({{names}}) are not all pure' as const

export const PURE_IMPORT_FIX =
  'delete the import and take the dependency as data, make it type-only when only its types are used, or move the code that needs it to a module whose home is not a schema file; a schema file declares a pure type and the operations over it' as const

export const ALLOWED_EFFECT_MODULES: ReadonlySet<string> = new Set([
  ...EFFECT_ROOT_PURE_NAMES,
  'Effect',
  'Arbitrary',
  'SchemaAST',
  'SchemaGetter',
  'SchemaTransformation',
  'SchemaIssue',
  'SchemaParser',
  'encoding/Base64',
  'encoding/Base64Url',
  'encoding/Hex',
  'encoding/EncodingError',
])

export const isAllowedEffectModule = (source: string, importedName: string | null): boolean =>
  ALLOWED_EFFECT_MODULES.has(effectModulePath(source, importedName) ?? '')

export const isAllowedImportSource = (source: string): boolean =>
  !isStateMachineFamilySpecifier(source) &&
  (source === 'effect' ||
    isAllowedEffectModule(source, null) ||
    source.startsWith('@systemfsoftware/') ||
    isRelativeSchemaSpecifier(source))

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.schema.ts file imports only these pure modules: the audited pure effect facades, the schema family, effect/Effect, the arbitrary module a toCodecArbitrary hook derives from, another relative schema file, and workspace packages other than the state-machine family. Any other value import — a Node builtin, a relative non-schema module, another third-party package — is refused. A bare `effect` import is allowed only when every imported name is a pure root name, a schema-family name, or `Effect`. Type-only imports are ignored. A dynamic `import()` or `require()` is judged by the same allowlist, and one whose source is not a string literal is refused as unprovable; a dynamic call inside an `import.meta.vitest` block is ignored unless its source is a state-machine family specifier, which is refused there too. A re-export from a source outside the pure set is reported here as well as by schema-file-exports-schemas-only, which refuses every re-export from a schema file. A specifier in the state-machine family — `xstate`, `@xstate/*`, `@systemfsoftware/xstate`, `@systemfsoftware/xstate/*`, `@systemfsoftware/xstate-*` — is refused in every value form even though it is a workspace package; only a type-only import or `export type` re-export of a family specifier passes.',
  },
  schema: [],
  messages: {
    nonPureImport: MESSAGE,
  },
} as const
