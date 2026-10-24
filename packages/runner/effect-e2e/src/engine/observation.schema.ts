import * as Schema from 'effect/Schema'

import { Route } from './route.schema.js'
import { SemanticNode, semanticTreeDepth } from './semantic-node.schema.js'

export const ScreenshotRef = Schema.Struct({ digest: Schema.String })
export type ScreenshotRef = typeof ScreenshotRef.Type

export const Observation = Schema.Struct({
  route: Route,
  revision: Schema.String,
  tree: Schema.Array(SemanticNode),
  screenshot: Schema.optionalKey(ScreenshotRef),
})
export type Observation = typeof Observation.Type

export const observationDepth = (observation: Observation): number =>
  observation.tree.reduce((deepest, root) => Math.max(deepest, semanticTreeDepth(root)), 0)

export class TreeDepthExceeded extends Schema.TaggedError<TreeDepthExceeded>()('TreeDepthExceeded', {
  budget: Schema.Int,
  depth: Schema.Int,
}) {
  override get message(): string {
    return `the observed tree is ${this.depth} nodes deep; the budget is ${this.budget}`
  }
}
