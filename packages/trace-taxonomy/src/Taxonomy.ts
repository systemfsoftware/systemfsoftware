import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import { Prototype } from 'effect/Pipeable'
import type { Pipeable } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as Span from './Span.js'

const TypeId: unique symbol = Symbol.for('@systemfsoftware/trace-taxonomy/Taxonomy')

export interface Edge {
  readonly relation: 'child' | 'descendant'
  readonly parent: Span.Span
  readonly child: Span.Span
}

export interface Forbidden {
  readonly span: Span.Span
  readonly unless: Option.Option<string>
}

/**
 * A taxonomy is an immutable declaration set: which spans exist, which parent-child facts are
 * legal, and which spans a path may not carry. It is read-only evidence for relating a finished
 * trace to a contract; it never emits a span.
 */
export interface Taxonomy extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly id: string
  readonly spans: ReadonlyArray<Span.Span>
  readonly edges: ReadonlyArray<Edge>
  readonly forbidden: ReadonlyArray<Forbidden>
}

export const isTaxonomy = (input: unknown): input is Taxonomy => Predicate.hasProperty(input, TypeId)

export const make = (id: string): Taxonomy => ({
  [TypeId]: TypeId,
  id,
  spans: [],
  edges: [],
  forbidden: [],
  ...Prototype,
})

const declaredSpan = (spans: ReadonlyArray<Span.Span>, span: Span.Span): ReadonlyArray<Span.Span> =>
  Option.match(Arr.findFirst(spans, (declared) => declared.id === span.id), {
    onNone: () => Arr.append(spans, span),
    onSome: () => spans,
  })

const declared = (self: Taxonomy, span: Span.Span): Taxonomy => ({ ...self, spans: declaredSpan(self.spans, span) })

export const add: {
  (span: Span.Span): (self: Taxonomy) => Taxonomy
  (self: Taxonomy, span: Span.Span): Taxonomy
} = dual(2, declared)

const edgeWith = (relation: Edge['relation'], self: Taxonomy, parent: Span.Span, child: Span.Span): Taxonomy => ({
  ...declared(declared(self, parent), child),
  edges: Arr.append(self.edges, { relation, parent, child }),
})

export const child: {
  (parent: Span.Span, child: Span.Span): (self: Taxonomy) => Taxonomy
  (self: Taxonomy, parent: Span.Span, child: Span.Span): Taxonomy
} = dual(3, (self: Taxonomy, parent: Span.Span, child: Span.Span): Taxonomy => edgeWith('child', self, parent, child))

export const descendant: {
  (parent: Span.Span, child: Span.Span): (self: Taxonomy) => Taxonomy
  (self: Taxonomy, parent: Span.Span, child: Span.Span): Taxonomy
} = dual(
  3,
  (self: Taxonomy, parent: Span.Span, child: Span.Span): Taxonomy => edgeWith('descendant', self, parent, child),
)

const forbiddenOf = (span: Span.Span, options?: { readonly unless?: string }): Forbidden => ({
  span,
  unless: Option.fromUndefinedOr(options?.unless),
})

export const forbid: {
  (span: Span.Span, options?: { readonly unless?: string }): (self: Taxonomy) => Taxonomy
  (self: Taxonomy, span: Span.Span, options?: { readonly unless?: string }): Taxonomy
} = dual(
  (args: IArguments) => isTaxonomy(args[0]),
  (self: Taxonomy, span: Span.Span, options?: { readonly unless?: string }): Taxonomy => ({
    ...declared(self, span),
    forbidden: Arr.append(self.forbidden, forbiddenOf(span, options)),
  }),
)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published module graph.
  const { it } = await import('@effect/vitest')

  const DeclaredSpan = Schema.Struct({ id: Schema.String, name: Schema.String })
  const LAW_ATTRS = Schema.Struct({})

  it.prop('∀s_Add_=Idempotent', { of: [DeclaredSpan], subject: declared, runs: 100 }, (add, [spec]) => {
    const span = Span.declare({ id: spec.id, name: spec.name, attrs: LAW_ATTRS })
    const once = add(make('law'), span)
    const twice = add(once, span)
    return Arr.contains(once.spans, span) && twice.spans.length === once.spans.length
  })
}
