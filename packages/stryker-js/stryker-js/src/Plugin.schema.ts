import * as S from 'effect/Schema'

/**
 * Declared in shape rather than imported from `effect/StandardSchema`: a
 * type-only import of a schema library would reach every emitted `.d.mts` and
 * force a plugin author to resolve a package they never installed. Every codec
 * `S.toStandardSchemaV1` returns satisfies this structurally.
 */
export interface StandardSchemaV1PathSegment {
  readonly key: PropertyKey
}

export interface StandardSchemaV1Issue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment> | undefined
}

export interface StandardSchemaV1Success<Output> {
  readonly value: Output
  readonly issues?: undefined
}

export interface StandardSchemaV1Failure {
  readonly issues: ReadonlyArray<StandardSchemaV1Issue>
}

export type StandardSchemaV1Result<Output> = StandardSchemaV1Success<Output> | StandardSchemaV1Failure

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  }
}

const PLUGIN_KINDS = ['Checker', 'Evaluator', 'Ignorer', 'Parser', 'Reporter', 'TestRunner'] as const

export type PluginKind = (typeof PLUGIN_KINDS)[number]

export const PluginKindSchema: StandardSchemaV1<unknown, PluginKind> = S.toStandardSchemaV1(S.Literals(PLUGIN_KINDS))

export interface PluginDeclaration {
  readonly kind: PluginKind
  readonly name: string
}

const PluginDeclarationCodec = S.Union(
  PLUGIN_KINDS.map((kind) => S.Struct({ kind: S.Literal(kind), name: S.String })),
)

export const PluginDeclarationSchema: StandardSchemaV1<unknown, PluginDeclaration> = S.toStandardSchemaV1(
  PluginDeclarationCodec,
)

export interface Shadowing {
  readonly kind: PluginKind
  readonly name: string
  readonly shadowedIndex: number
  readonly winnerIndex: number
}

export const ShadowingSchema: StandardSchemaV1<unknown, Shadowing> = S.toStandardSchemaV1(
  S.Struct({
    kind: S.Literals(PLUGIN_KINDS),
    name: S.String,
    shadowedIndex: S.Finite,
    winnerIndex: S.Finite,
  }),
)

export const PluginModuleSchema: StandardSchemaV1<unknown, { readonly strykerPlugins: readonly PluginDeclaration[] }> =
  S.toStandardSchemaV1(S.Struct({ strykerPlugins: S.Array(PluginDeclarationCodec) }))
