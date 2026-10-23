import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { ControlDescriptor } from '../cache/entry.schema.js'
import { ByRole, Locator, LocatorExpression } from '../engine/locator.schema.js'
import { Observation } from '../engine/observation.schema.js'
import { NodeRef, SemanticNode } from '../engine/semantic-node.schema.js'

/** A located node: the locator its ref resolves to, its control descriptor, and the ref itself. */
export const LocatedNode = Schema.Struct({ locator: Locator, control: ControlDescriptor, ref: NodeRef })
export type LocatedNode = typeof LocatedNode.Type

/** The outcome of looking up a node ref on an observation: absent, present without a role, or located. */
export const NodeLookup = Schema.Union([
  Schema.TaggedStruct('NodeAbsent', {}),
  Schema.TaggedStruct('NodeRoleless', { ref: NodeRef }),
  Schema.TaggedStruct('NodeLocated', { located: LocatedNode }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type NodeLookup = typeof NodeLookup.Type

interface Placement {
  readonly node: SemanticNode
  readonly chain: ReadonlyArray<SemanticNode>
}

const placementsOf = (
  forest: ReadonlyArray<SemanticNode>,
  chain: ReadonlyArray<SemanticNode>,
): ReadonlyArray<Placement> => Arr.flatMap(forest, (node) => placementsUnder(node, chain))

const visibleOf = (node: SemanticNode): Option.Option<SemanticNode> =>
  Option.filter(Option.some(node), () => !node.states.hidden)

const placementsUnder = (node: SemanticNode, chain: ReadonlyArray<SemanticNode>): ReadonlyArray<Placement> =>
  Option.match(visibleOf(node), {
    onNone: () => [],
    onSome: (visible) => [
      { node: visible, chain },
      ...placementsOf(visible.children, Arr.append(chain, visible)),
    ],
  })

const placementOfRef = (placements: ReadonlyArray<Placement>, ref: string): Option.Option<Placement> =>
  Arr.findFirst(placements, (placement) => placement.node.ref.id === ref)

const nameOf = (node: SemanticNode): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(node.name), {
    onNone: () => [],
    onSome: (name) => [name],
  })

const namedAncestorsOf = (chain: ReadonlyArray<SemanticNode>): ReadonlyArray<string> => Arr.flatMap(chain, nameOf)

const baseExpressionOf = (role: string, name: Option.Option<string>): ByRole =>
  Option.match(name, {
    onNone: () => ({ kind: 'ByRole', role }),
    onSome: (value) => ({ kind: 'ByRole', role, name: { value, exact: true } }),
  })

const nameMatches = (name: Option.Option<string>) => (other: Placement): boolean =>
  Option.match(name, {
    onNone: () => true,
    onSome: (value) => other.node.name === value,
  })

const sameTargetAs = (role: string, name: Option.Option<string>) => (other: Placement): boolean =>
  Arr.every([other.node.role === role, nameMatches(name)(other)], (holds) => holds)

// the placement is always among its own candidates, so the fallback is unreachable
const indexAmong = (
  candidates: ReadonlyArray<Placement>,
  placement: Placement,
): number =>
  Option.getOrElse(
    Arr.findFirstIndex(candidates, (candidate) => candidate.node.ref.id === placement.node.ref.id),
    () => 0,
  )

const expressionOf = (
  placements: ReadonlyArray<Placement>,
  placement: Placement,
  role: string,
  name: Option.Option<string>,
  base: ByRole,
): LocatorExpression => {
  const candidates = Arr.filter(placements, sameTargetAs(role, name))
  return Match.value(candidates.length > 1).pipe(
    Match.when(true, (): LocatorExpression => ({ kind: 'Nth', inner: base, index: indexAmong(candidates, placement) })),
    Match.when(false, (): LocatorExpression => base),
    Match.exhaustive,
  )
}

const labelOf = (role: string, name: Option.Option<string>): string =>
  Option.match(name, {
    onNone: () => role,
    onSome: (value) => `${role} "${value}"`,
  })

const locatorOf = (placements: ReadonlyArray<Placement>, placement: Placement, role: string): Locator => {
  const name = Option.fromNullishOr(placement.node.name)
  return {
    expression: expressionOf(placements, placement, role, name, baseExpressionOf(role, name)),
    label: labelOf(role, name),
  }
}

const controlOf = (placement: Placement, role: string): ControlDescriptor =>
  Option.match(Option.fromNullishOr(placement.node.name), {
    onNone: () => ({ role, context: namedAncestorsOf(placement.chain) }),
    onSome: (name) => ({ role, name, context: namedAncestorsOf(placement.chain) }),
  })

const locatedNodeOf = (placements: ReadonlyArray<Placement>, placement: Placement, role: string): LocatedNode => ({
  locator: locatorOf(placements, placement, role),
  control: controlOf(placement, role),
  ref: placement.node.ref,
})

/** Looks up a node ref among the visible nodes of an observation and resolves it to a locator and control. */
export const lookupNode: {
  (refId: string): (observation: Observation) => NodeLookup
  (observation: Observation, refId: string): NodeLookup
} = Function.dual(2, (observation: Observation, refId: string): NodeLookup => {
  const placements = placementsOf(observation.tree, [])
  return Option.match(placementOfRef(placements, refId), {
    onNone: (): NodeLookup => ({ _tag: 'NodeAbsent' }),
    onSome: (placement): NodeLookup =>
      Option.match(Option.fromNullishOr(placement.node.role), {
        onNone: (): NodeLookup => ({ _tag: 'NodeRoleless', ref: placement.node.ref }),
        onSome: (role): NodeLookup => ({ _tag: 'NodeLocated', located: locatedNodeOf(placements, placement, role) }),
      }),
  })
})
