import type { NodeStates, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Str from 'effect/String'

import type { AriaChild, AriaNode } from './web.schema.js'

const VALUE_ROLES: Readonly<Record<string, true>> = { textbox: true, searchbox: true, combobox: true, spinbutton: true }

const CHECKABLE_ROLES: Readonly<Record<string, true>> = {
  checkbox: true,
  radio: true,
  switch: true,
  menuitemcheckbox: true,
  menuitemradio: true,
}

const isElement = (child: AriaChild): child is AriaNode => !Predicate.isString(child)

const childrenOf = (node: AriaNode): ReadonlyArray<AriaChild> =>
  Option.getOrElse(Option.fromNullishOr(node.children), () => [])

const fragmentsOf = (node: AriaNode): string =>
  childrenOf(node).filter(Predicate.isString).map(Str.trim).filter(Str.isNonEmpty).join(' ')

const ownText = (node: AriaNode): string => Option.getOrElse(Option.fromNullishOr(node.text), () => fragmentsOf(node))

const uncheckedUnlessCheckable = (role: string): Pick<NodeStates, 'checked'> =>
  CHECKABLE_ROLES[role] === true ? { checked: false } : {}

const checkedOf = (node: AriaNode): Pick<NodeStates, 'checked'> =>
  Match.value(node.checked).pipe(
    Match.when('mixed', () => ({})),
    Match.when(Match.boolean, (checked) => ({ checked })),
    Match.orElse(() => uncheckedUnlessCheckable(node.role)),
  )

const selectedOf = (node: AriaNode): Pick<NodeStates, 'selected'> =>
  Predicate.isBoolean(node.selected) ? { selected: node.selected } : {}

const expandedOf = (node: AriaNode): Pick<NodeStates, 'expanded'> =>
  Predicate.isBoolean(node.expanded) ? { expanded: node.expanded } : {}

const pressedOf = (node: AriaNode): Pick<NodeStates, 'pressed'> =>
  Predicate.isBoolean(node.pressed) ? { pressed: node.pressed } : {}

const statesOf = (node: AriaNode): NodeStates => ({
  disabled: node.disabled === true,
  hidden: false,
  ...checkedOf(node),
  ...selectedOf(node),
  ...expandedOf(node),
  ...pressedOf(node),
})

const displayedTextOf = (node: AriaNode): Pick<SemanticNode, 'text'> =>
  Option.match(Option.liftPredicate(ownText(node), Str.isNonEmpty), {
    onNone: () => ({}),
    onSome: (text) => ({ text }),
  })

const textFieldsOf = (node: AriaNode): Pick<SemanticNode, 'text' | 'value'> =>
  VALUE_ROLES[node.role] === true
    ? { value: Option.getOrElse(Option.fromNullishOr(node.text), () => '') }
    : displayedTextOf(node)

const nameOf = (node: AriaNode): Pick<SemanticNode, 'name'> =>
  Option.match(Option.liftPredicate(Option.getOrElse(Option.fromNullishOr(node.name), () => ''), Str.isNonEmpty), {
    onNone: () => ({}),
    onSome: (name) => ({ name }),
  })

const boundsOf = (node: AriaNode): Pick<SemanticNode, 'bounds'> =>
  Option.match(Option.fromNullishOr(node.box), { onNone: () => ({}), onSome: (bounds) => ({ bounds }) })

const refIdOf = (node: AriaNode, index: number): string =>
  Option.getOrElse(Option.fromNullishOr(node.ref), () => `unreferenced-${index}`)

const semanticNodeOf = (revision: string) => (node: AriaNode, index: number): SemanticNode => ({
  ref: { id: refIdOf(node, index), revision },
  role: node.role,
  ...nameOf(node),
  ...textFieldsOf(node),
  states: statesOf(node),
  ...boundsOf(node),
  children: semanticTreeOf(revision)(childrenOf(node)),
})

export const semanticTreeOf = (revision: string) => (snapshot: ReadonlyArray<AriaChild>): Array<SemanticNode> =>
  snapshot.filter(isElement).map(semanticNodeOf(revision))
