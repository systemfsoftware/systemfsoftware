import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as ts from 'typescript'

import { getNodeId, type NodeId } from '../analyzer/TypeScriptInternals.js'

export interface SpanTree {
  readonly id: NodeId
  readonly node: ts.Node
  readonly kind: ts.SyntaxKind
  readonly parentId: Option.Option<NodeId>
  readonly startIndex: number
  readonly endIndex: number
  readonly prefix: string
  readonly suffix: string
  readonly separator: string
  readonly children: ReadonlyArray<SpanTree>
}

const childNodesOf = (node: ts.Node): ReadonlyArray<ts.Node> => Arr.fromIterable(node.getChildren())

const startIndexOf = (node: ts.Node): number =>
  Match.value(node.kind === ts.SyntaxKind.SourceFile).pipe(
    Match.when(true, () => node.getFullStart()),
    Match.when(false, () => node.getStart()),
    Match.exhaustive,
  )

const substringOf = (text: string, startIndex: number, endIndex: number): string =>
  Match.value(startIndex === endIndex).pipe(
    Match.when(true, () => ''),
    Match.when(false, () => text.substring(startIndex, endIndex)),
    Match.exhaustive,
  )

const prefixOf = (
  text: string,
  startIndex: number,
  endIndex: number,
  children: ReadonlyArray<SpanTree>,
): string =>
  Option.match(Arr.head(children), {
    onNone: () => substringOf(text, startIndex, endIndex),
    onSome: (firstChild) => substringOf(text, startIndex, firstChild.startIndex),
  })

const suffixOf = (text: string, endIndex: number, children: ReadonlyArray<SpanTree>): string =>
  Option.match(Arr.last(children), {
    onNone: () => '',
    onSome: (lastChild) => substringOf(text, lastChild.endIndex, endIndex),
  })

const withSeparatorDeepest = (text: string, tree: SpanTree, separator: string): SpanTree =>
  Option.match(Arr.last(tree.children), {
    onNone: () => ({ ...tree, separator }),
    onSome: (lastChild) =>
      Match.value(lastChild.endIndex === tree.endIndex).pipe(
        Match.when(true, () => ({ ...tree, children: withLastChildSeparator(text, tree, separator) })),
        Match.when(false, () => ({ ...tree, separator })),
        Match.exhaustive,
      ),
  })

const withLastChildSeparator = (
  text: string,
  tree: SpanTree,
  separator: string,
): ReadonlyArray<SpanTree> =>
  Option.getOrElse(
    Arr.modify(tree.children, tree.children.length - 1, (child) => withSeparatorDeepest(text, child, separator)),
    () => tree.children,
  )

const withSiblingSeparator = (
  text: string,
  children: ReadonlyArray<SpanTree>,
  index: number,
  separator: string,
): ReadonlyArray<SpanTree> =>
  Option.getOrElse(Arr.modify(children, index, (child) => withSeparatorDeepest(text, child, separator)), () => children)

const withSeparators = (text: string, children: ReadonlyArray<SpanTree>): ReadonlyArray<SpanTree> =>
  Arr.reduce(children, children, (current, child, index) =>
    Option.match(Arr.get(children, index + 1), {
      onNone: () => current,
      onSome: (next) =>
        Match.value(child.endIndex < next.startIndex).pipe(
          Match.when(
            true,
            () => withSiblingSeparator(text, current, index, substringOf(text, child.endIndex, next.startIndex)),
          ),
          Match.when(false, () => current),
          Match.exhaustive,
        ),
    }))

const buildOf = (text: string, node: ts.Node, parentId: Option.Option<NodeId>): SpanTree => {
  const id = getNodeId(node)
  const children = withSeparators(
    text,
    Arr.map(childNodesOf(node), (childNode) => buildOf(text, childNode, Option.some(id))),
  )
  const startIndex = Arr.reduce(children, startIndexOf(node), (smallest, child) => Math.min(smallest, child.startIndex))
  const endIndex = Arr.reduce(children, node.end, (largest, child) => Math.max(largest, child.endIndex))
  return {
    id,
    node,
    kind: node.kind,
    parentId,
    startIndex,
    endIndex,
    prefix: prefixOf(text, startIndex, endIndex, children),
    suffix: suffixOf(text, endIndex, children),
    separator: '',
    children,
  }
}

export const build = (node: ts.Node): SpanTree => buildOf(node.getSourceFile().text, node, Option.none())

export const lastInnerSeparator = (tree: SpanTree): string =>
  Match.value(tree.separator.length > 0).pipe(
    Match.when(true, () => tree.separator),
    Match.when(false, () =>
      Option.match(Arr.last(tree.children), {
        onNone: () => '',
        onSome: lastInnerSeparator,
      })),
    Match.exhaustive,
  )

export const originalText = (tree: SpanTree): string =>
  `${tree.prefix}${Arr.join(Arr.map(tree.children, originalText), '')}${tree.suffix}${tree.separator}`

export const preordered = (tree: SpanTree): ReadonlyArray<SpanTree> => [tree, ...tree.children.flatMap(preordered)]

export const index = (tree: SpanTree): HashMap.HashMap<NodeId, SpanTree> =>
  Arr.reduce(preordered(tree), HashMap.empty<NodeId, SpanTree>(), (ids, span) => HashMap.set(ids, span.id, span))

export const parentOf = dual<
  (ids: HashMap.HashMap<NodeId, SpanTree>) => (tree: SpanTree) => Option.Option<SpanTree>,
  (tree: SpanTree, ids: HashMap.HashMap<NodeId, SpanTree>) => Option.Option<SpanTree>
>(
  2,
  (tree: SpanTree, ids: HashMap.HashMap<NodeId, SpanTree>): Option.Option<SpanTree> =>
    Option.flatMap(tree.parentId, (parentId) => HashMap.get(ids, parentId)),
)

export const nextSiblingOf = dual<
  (ids: HashMap.HashMap<NodeId, SpanTree>) => (tree: SpanTree) => Option.Option<SpanTree>,
  (tree: SpanTree, ids: HashMap.HashMap<NodeId, SpanTree>) => Option.Option<SpanTree>
>(
  2,
  (tree: SpanTree, ids: HashMap.HashMap<NodeId, SpanTree>): Option.Option<SpanTree> =>
    Option.flatMap(parentOf(tree, ids), (parent) =>
      Option.flatMap(
        Arr.findFirstIndex(parent.children, (child) => child.id === tree.id),
        (position) => Arr.get(parent.children, position + 1),
      )),
)

export const findFirstParent = dual<
  (
    ids: HashMap.HashMap<NodeId, SpanTree>,
    guard: (node: ts.Node) => boolean,
  ) => (tree: SpanTree) => Option.Option<SpanTree>,
  (tree: SpanTree, ids: HashMap.HashMap<NodeId, SpanTree>, guard: (node: ts.Node) => boolean) => Option.Option<SpanTree>
>(3, (
  tree: SpanTree,
  ids: HashMap.HashMap<NodeId, SpanTree>,
  guard: (node: ts.Node) => boolean,
): Option.Option<SpanTree> =>
  Match.value(guard(tree.node)).pipe(
    Match.when(true, () => Option.some(tree)),
    Match.when(false, () =>
      Option.match(parentOf(tree, ids), {
        onNone: () => Option.none(),
        onSome: (parent) => findFirstParent(parent, ids, guard),
      })),
    Match.exhaustive,
  ))
