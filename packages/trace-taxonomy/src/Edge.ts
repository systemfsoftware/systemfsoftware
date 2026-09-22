import type { SpanRef } from './Span.js'
import type { TaxonomyEdge } from './Taxonomy.js'

export const child = (parent: SpanRef, child: SpanRef): TaxonomyEdge => ({
  relation: 'child',
  parent,
  child,
})

export const descendant = (parent: SpanRef, child: SpanRef): TaxonomyEdge => ({
  relation: 'descendant',
  parent,
  child,
})
