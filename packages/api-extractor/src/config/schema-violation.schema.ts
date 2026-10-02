/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export const SchemaViolation = Schema.Struct({
  instancePath: Schema.String,
  message: Schema.String,
})
export type SchemaViolation = typeof SchemaViolation.Type

/** The schema-AST tags the config-issue renderer maps to a JSON type. */
const schemaAstLeafTags: ReadonlyArray<string> = [
  'String',
  'Boolean',
  'Objects',
  'Arrays',
  'Number',
  'Undefined',
  'Literal',
]

const schemaAstLeaves = [
  Schema.TaggedStruct('String', {}),
  Schema.TaggedStruct('Boolean', {}),
  Schema.TaggedStruct('Objects', {}),
  Schema.TaggedStruct('Arrays', {}),
  Schema.TaggedStruct('Number', {}),
  Schema.TaggedStruct('Undefined', {}),
  Schema.TaggedStruct('Literal', {}),
]

/** One member of a schema-AST union: only the tag the renderer reads, nothing else. */
export const SchemaAstLeaf = Schema.Union(schemaAstLeaves)
export type SchemaAstLeaf = typeof SchemaAstLeaf.Type

/**
 * The schema node the config-issue renderer reads. A tagged union of the AST tags it
 * distinguishes: the leaf tags it maps to a JSON type, and a `Union` carrying its members.
 * Any other AST tag is not representable, and its issue falls back to the enum message.
 */
export const SchemaAstView = Schema.Union([
  ...schemaAstLeaves,
  Schema.TaggedStruct('Union', { types: Schema.Array(SchemaAstLeaf) }),
])
export type SchemaAstView = typeof SchemaAstView.Type

export const ConfigIssueKind = Schema.Literals(['UnexpectedKey', 'MissingKey', 'InvalidType', 'AnyOf'])
export type ConfigIssueKind = typeof ConfigIssueKind.Type

const issueKindTags: ReadonlyArray<string> = ['UnexpectedKey', 'MissingKey', 'InvalidType', 'AnyOf']

const decodesIssueKind = (kind: string): boolean => Result.isSuccess(Schema.decodeUnknownResult(ConfigIssueKind)(kind))

const decodesLeafViewTag = (tag: string): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(SchemaAstView)({ _tag: tag }))

/** Boundary seeds: valid members pin the verdict, invalid ones pin the refusal. */
const issueKindSeeds = ['', 'AnyOf', 'UnexpectedKey', 'AnyOfx', 'Missing']
const leafViewSeeds = ['', 'String', 'Literal', 'Union', 'Refinement']

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this branch is
  // statically dead in the build and a static import would publish the test-only dependency.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀k_ConfigIssueKindRefusal_≡Membership',
    { of: [Schema.String], subject: decodesIssueKind },
    (subject, [kind]) =>
      Arr.every(
        Arr.append(issueKindSeeds, kind),
        (candidate) => subject(candidate) === issueKindTags.includes(candidate),
      ),
  )

  it.prop(
    '∀t_SchemaAstLeafRefusal_≡LeafTag',
    { of: [Schema.String], subject: decodesLeafViewTag },
    (subject, [tag]) =>
      Arr.every(
        Arr.append(leafViewSeeds, tag),
        (candidate) => subject(candidate) === schemaAstLeafTags.includes(candidate),
      ),
  )
}
