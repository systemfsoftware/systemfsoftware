import * as Schema from 'effect/Schema'

const AriaBox = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, width: Schema.Finite, height: Schema.Finite })

const TriState = Schema.Union([Schema.Boolean, Schema.Literal('mixed')])

/** One element of Playwright's `ariaSnapshotJSON` tree; keys this engine does not read are ignored. */
export interface AriaNode {
  readonly role: string
  readonly name?: string
  readonly text?: string
  readonly ref?: string
  readonly checked?: boolean | 'mixed'
  readonly disabled?: boolean
  readonly expanded?: boolean
  readonly pressed?: boolean | 'mixed'
  readonly selected?: boolean
  readonly box?: typeof AriaBox.Type
  readonly children?: ReadonlyArray<AriaChild>
}

/** A child of an aria node: an element, or a static text fragment. */
export type AriaChild = string | AriaNode

export const AriaNode: Schema.Codec<AriaNode> = Schema.Struct({
  role: Schema.String,
  name: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  ref: Schema.optionalKey(Schema.String),
  checked: Schema.optionalKey(TriState),
  disabled: Schema.optionalKey(Schema.Boolean),
  expanded: Schema.optionalKey(Schema.Boolean),
  pressed: Schema.optionalKey(TriState),
  selected: Schema.optionalKey(Schema.Boolean),
  box: Schema.optionalKey(AriaBox),
  children: Schema.optionalKey(
    Schema.suspend((): Schema.Codec<AriaChild> => Schema.Union([Schema.String, AriaNode])).pipe(Schema.Array),
  ),
}).annotate({ identifier: 'AriaNode', recursionBudget: { maxDepth: 4, depthSize: 'small' } })

/** What `ariaSnapshotJSON` answers for a page or an element: elements and static text fragments. */
export const AriaAnswer = Schema.Array(Schema.Union([Schema.String, AriaNode]))
export type AriaAnswer = typeof AriaAnswer.Type
