import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'

export const NodeRef = Schema.Struct({ id: Schema.String, revision: Schema.String })
export type NodeRef = typeof NodeRef.Type

const NAME_LIMIT = 256
const TEXT_LIMIT = 512

const NodeName = Schema.String.check(
  Schema.isMaxLength(NAME_LIMIT, { message: 'a node name holds at most 256 characters' }),
)

const NodeText = Schema.String.check(
  Schema.isMaxLength(TEXT_LIMIT, { message: 'a node text or value holds at most 512 characters' }),
)

const keepStartCutAt = (limit: number): SchemaTransformation.Transformation<string, string> =>
  SchemaTransformation.transform({ decode: (text: string) => text.slice(0, limit), encode: (text: string) => text })

const CutName = Schema.String.pipe(Schema.decodeTo(NodeName, keepStartCutAt(NAME_LIMIT)))

const CutText = Schema.String.pipe(Schema.decodeTo(NodeText, keepStartCutAt(TEXT_LIMIT)))

export const NodeStates = Schema.Struct({
  disabled: Schema.Boolean,
  checked: Schema.optionalKey(Schema.Boolean),
  selected: Schema.optionalKey(Schema.Boolean),
  expanded: Schema.optionalKey(Schema.Boolean),
  pressed: Schema.optionalKey(Schema.Boolean),
  hidden: Schema.Boolean,
})
export type NodeStates = typeof NodeStates.Type

export const NodeBounds = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
})
export type NodeBounds = typeof NodeBounds.Type

export interface SemanticNode {
  readonly ref: NodeRef
  readonly role?: string
  readonly name?: string
  readonly text?: string
  readonly value?: string
  readonly states: NodeStates
  readonly bounds?: NodeBounds
  readonly children: ReadonlyArray<SemanticNode>
}

export const SemanticNode: Schema.Codec<SemanticNode> = Schema.Struct({
  ref: NodeRef,
  role: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(CutName),
  text: Schema.optionalKey(CutText),
  value: Schema.optionalKey(CutText),
  states: NodeStates,
  bounds: Schema.optionalKey(NodeBounds),
  children: Schema.Array(Schema.suspend((): Schema.Codec<SemanticNode> => SemanticNode)),
})

export const semanticTreeDepth = (node: SemanticNode): number => {
  let deepest = 0
  let level: ReadonlyArray<SemanticNode> = [node]
  while (level.length > 0) {
    deepest += 1
    level = level.flatMap((parent) => parent.children)
  }
  return deepest
}

const cutFieldsOf = (candidate: string): ReadonlyArray<string> =>
  Result.match(
    Schema.decodeResult(SemanticNode)({
      ref: { id: 'n', revision: 'r' },
      name: candidate,
      text: candidate,
      value: candidate,
      states: { disabled: false, hidden: false },
      children: [],
    }),
    {
      onFailure: () => [],
      onSuccess: (node) => [node.name, node.text, node.value].filter((field) => field !== undefined),
    },
  )

const FIELD_LIMITS = [NAME_LIMIT, TEXT_LIMIT, TEXT_LIMIT]

const isLeadingCut = (input: string, limit: number, kept: string): boolean =>
  kept.length === Math.min(input.length, limit) && input.startsWith(kept)

const boundarySeeds = [255, 256, 257, 511, 512, 513, 1024].map((length) => 's'.repeat(length))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_NodeTextFields_≡LeadingCutAtLimit',
    { of: [Schema.String], subject: cutFieldsOf, runs: 200, arbitrary: { seed: 496_003 } },
    (subject, [drawn]) =>
      Arr.every(
        Arr.append(boundarySeeds, drawn),
        (candidate) =>
          subject(candidate).length === FIELD_LIMITS.length &&
          Arr.every(Arr.zip(subject(candidate), FIELD_LIMITS), ([kept, limit]) => isLeadingCut(candidate, limit, kept)),
      ),
  )
}
