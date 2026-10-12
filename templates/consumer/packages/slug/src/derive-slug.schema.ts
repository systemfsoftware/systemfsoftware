import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import { Slug } from './Slug.schema.js'

const SlugDecisionTypeId: unique symbol = Symbol.for('slug/SlugDecision')
type SlugDecisionTypeId = typeof SlugDecisionTypeId

export class DeriveSlug extends Schema.TaggedClass<DeriveSlug>()('DeriveSlug', { text: Schema.String }) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class SlugDerived extends Schema.TaggedClass<SlugDerived>()('SlugDerived', { slug: Slug }) {
  readonly [SlugDecisionTypeId] = SlugDecisionTypeId
}

export class NoSlugInText extends Schema.TaggedClass<NoSlugInText>()('NoSlugInText', {}) {
  readonly [SlugDecisionTypeId] = SlugDecisionTypeId
}

export const SlugDecision = Schema.Union([SlugDerived, NoSlugInText])
export type SlugDecision = typeof SlugDecision.Type
