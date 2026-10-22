import * as Schema from 'effect/Schema'

export const TextPattern = Schema.Struct({ value: Schema.String, exact: Schema.Boolean })
export type TextPattern = typeof TextPattern.Type

export const ByRole = Schema.Struct({
  kind: Schema.Literal('ByRole'),
  role: Schema.String,
  name: Schema.optionalKey(TextPattern),
})
export type ByRole = typeof ByRole.Type

export const ByLabel = Schema.Struct({ kind: Schema.Literal('ByLabel'), text: TextPattern })
export type ByLabel = typeof ByLabel.Type

export const ByPlaceholder = Schema.Struct({ kind: Schema.Literal('ByPlaceholder'), text: TextPattern })
export type ByPlaceholder = typeof ByPlaceholder.Type

export const ByText = Schema.Struct({ kind: Schema.Literal('ByText'), text: TextPattern })
export type ByText = typeof ByText.Type

export const ByTestId = Schema.Struct({ kind: Schema.Literal('ByTestId'), testId: Schema.String })
export type ByTestId = typeof ByTestId.Type

export const Selector = Schema.Struct({ kind: Schema.Literal('Selector'), css: Schema.String })
export type Selector = typeof Selector.Type

export const NthIndex = Schema.Union([Schema.Int, Schema.Literals(['first', 'last'])])
export type NthIndex = typeof NthIndex.Type

export interface Filter {
  readonly kind: 'Filter'
  readonly inner: LocatorExpression
  readonly text: TextPattern
}

export interface Nth {
  readonly kind: 'Nth'
  readonly inner: LocatorExpression
  readonly index: NthIndex
}

export interface Frame {
  readonly kind: 'Frame'
  readonly inner: LocatorExpression
  readonly frame: string
}

export type LocatorExpression = ByRole | ByLabel | ByPlaceholder | ByText | ByTestId | Selector | Filter | Nth | Frame

export const Filter = Schema.Struct({
  kind: Schema.Literal('Filter'),
  inner: Schema.suspend((): Schema.Codec<LocatorExpression> => LocatorExpression),
  text: TextPattern,
})

export const Nth = Schema.Struct({
  kind: Schema.Literal('Nth'),
  inner: Schema.suspend((): Schema.Codec<LocatorExpression> => LocatorExpression),
  index: NthIndex,
})

export const Frame = Schema.Struct({
  kind: Schema.Literal('Frame'),
  inner: Schema.suspend((): Schema.Codec<LocatorExpression> => LocatorExpression),
  frame: Schema.String,
})

export const LocatorExpression: Schema.Codec<LocatorExpression> = Schema.suspend((): Schema.Codec<LocatorExpression> =>
  Schema.Union([ByRole, ByLabel, ByPlaceholder, ByText, ByTestId, Selector, Filter, Nth, Frame])
).annotate({
  identifier: 'LocatorExpression',
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
})

export const Locator = Schema.Struct({ expression: LocatorExpression, label: Schema.String })
export type Locator = typeof Locator.Type
