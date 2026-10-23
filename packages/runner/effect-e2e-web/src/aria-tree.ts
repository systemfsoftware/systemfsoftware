import type { NodeBounds, NodeRef, NodeStates, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
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

const TEXT_FRAGMENT_ROLE = 'text'

const isElement = (child: AriaChild): child is AriaNode =>
  !Predicate.isString(child) && child.role !== TEXT_FRAGMENT_ROLE

const childrenOf = (node: AriaNode): ReadonlyArray<AriaChild> =>
  Option.getOrElse(Option.fromNullishOr(node.children), () => [])

const fragmentTextOf = (node: AriaNode): ReadonlyArray<string> =>
  node.role === TEXT_FRAGMENT_ROLE ? Option.toArray(Option.fromNullishOr(node.text)) : []

const fragmentOf = (child: AriaChild): ReadonlyArray<string> =>
  Predicate.isString(child) ? [child] : fragmentTextOf(child)

const fragmentsIn = (children: ReadonlyArray<AriaChild>): string =>
  children.flatMap(fragmentOf).map(Str.trim).filter(Str.isNonEmpty).join(' ')

const ownText = (node: AriaNode): string =>
  Option.getOrElse(Option.fromNullishOr(node.text), () => fragmentsIn(childrenOf(node)))

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

const textOf = (text: string): Pick<SemanticNode, 'text'> =>
  Option.match(Option.liftPredicate(text, Str.isNonEmpty), {
    onNone: () => ({}),
    onSome: (present) => ({ text: present }),
  })

const displayedTextOf = (node: AriaNode): Pick<SemanticNode, 'text'> => textOf(ownText(node))

const textFieldsOf = (node: AriaNode): Pick<SemanticNode, 'text' | 'value'> =>
  VALUE_ROLES[node.role] === true
    ? { value: Option.getOrElse(Option.fromNullishOr(node.text), () => '') }
    : displayedTextOf(node)

const nameOf = (node: AriaNode): Pick<SemanticNode, 'name'> =>
  Option.match(Option.liftPredicate(Option.getOrElse(Option.fromNullishOr(node.name), () => ''), Str.isNonEmpty), {
    onNone: () => ({}),
    onSome: (name) => ({ name }),
  })

const boundsFrom = (bounds: Option.Option<NodeBounds>): Pick<SemanticNode, 'bounds'> =>
  Option.match(bounds, { onNone: () => ({}), onSome: (present) => ({ bounds: present }) })

export interface SnapshotNaming {
  readonly revision: string
  readonly snapshot: string
}

const childPath = (path: string, index: number): string => (path === '' ? String(index) : `${path}.${index}`)

const refOf = (naming: SnapshotNaming, node: AriaNode, path: string): NodeRef => ({
  id: Option.getOrElse(Option.fromNullishOr(node.ref), () => `${naming.snapshot}:${path}`),
  revision: naming.revision,
})

const semanticNodeAt = (naming: SnapshotNaming, path: string) => (node: AriaNode): SemanticNode => ({
  ref: refOf(naming, node, path),
  role: node.role,
  ...nameOf(node),
  ...textFieldsOf(node),
  states: statesOf(node),
  ...boundsFrom(Option.fromNullishOr(node.box)),
  children: treeAt(naming, path)(childrenOf(node)),
})

const treeAt = (naming: SnapshotNaming, path: string) => (children: ReadonlyArray<AriaChild>): Array<SemanticNode> =>
  children.filter(isElement).map((node, index) => semanticNodeAt(naming, childPath(path, index))(node))

export const semanticTreeOf = (naming: SnapshotNaming): (snapshot: ReadonlyArray<AriaChild>) => Array<SemanticNode> =>
  treeAt(naming, '')

export const unrootedRefOf = (naming: SnapshotNaming): NodeRef => ({
  id: `${naming.snapshot}:match`,
  revision: naming.revision,
})

export interface MatchedSnapshot {
  readonly naming: SnapshotNaming
  readonly answer: ReadonlyArray<AriaChild>
  readonly bounds: Option.Option<NodeBounds>
}

const rootOf = (answer: ReadonlyArray<AriaChild>): Option.Option<AriaNode> =>
  answer.length === 1 ? Option.filter(Arr.head(answer), isElement) : Option.none()

const unrootedNodeOf = (match: MatchedSnapshot): SemanticNode => ({
  ref: unrootedRefOf(match.naming),
  role: 'generic',
  ...textOf(fragmentsIn(match.answer)),
  states: { disabled: false, hidden: false },
  ...boundsFrom(match.bounds),
  children: treeAt(match.naming, 'match')(match.answer),
})

export const matchedNodeOf = (match: MatchedSnapshot): SemanticNode =>
  Option.match(rootOf(match.answer), {
    onNone: () => unrootedNodeOf(match),
    onSome: semanticNodeAt(match.naming, '0'),
  })
