import type { SpanRef } from './Span.js'

const TaxonomyTypeId: unique symbol = Symbol.for('@systemfsoftware/trace-taxonomy/Taxonomy')

export type EdgeRelation = 'child' | 'descendant'

export interface TaxonomyEdge {
  readonly relation: EdgeRelation
  readonly parent: SpanRef
  readonly child: SpanRef
}

export interface ForbiddenSpan {
  readonly span: SpanRef
  readonly unless?: string
}

export interface Taxonomy {
  readonly [TaxonomyTypeId]: typeof TaxonomyTypeId
  readonly id: string
  readonly spans: ReadonlyArray<SpanRef>
  readonly edges: ReadonlyArray<TaxonomyEdge>
  readonly forbid: ReadonlyArray<ForbiddenSpan>
}

export const make = (taxonomy: {
  readonly id: string
  readonly spans: ReadonlyArray<SpanRef>
  readonly edges: ReadonlyArray<TaxonomyEdge>
  readonly forbid: ReadonlyArray<ForbiddenSpan>
}): Taxonomy => ({ ...taxonomy, [TaxonomyTypeId]: TaxonomyTypeId })
