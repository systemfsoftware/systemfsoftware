import { HashMap, Option } from 'effect'
import { dual } from 'effect/Function'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import type { NodeId } from '../analyzer/TypeScriptInternals.js'
import type { SpanTree } from './span-tree.js'

export type IndentDocCommentScope = 'none' | 'prefixOnly' | 'spanAndChildren'

export interface SpanModification {
  readonly omitChildren: boolean
  readonly omitSeparatorAfter: boolean
  readonly sortChildren: boolean
  readonly sortKey: Option.Option<string>
  readonly indentDocComment: IndentDocCommentScope
  readonly prefix: Option.Option<string>
  readonly suffix: Option.Option<string>
}

/** The immutable counterpart of `Span.modification`: planned edits keyed by span id. */
export type SpanPlan = HashMap.HashMap<NodeId, SpanModification>

export const empty: SpanPlan = HashMap.empty()

const defaultIndentDocComment = (tree: SpanTree): IndentDocCommentScope =>
  Match.value(tree.kind === ts.SyntaxKind.JSDocComment).pipe(
    Match.when(true, (): IndentDocCommentScope => 'spanAndChildren'),
    Match.when(false, (): IndentDocCommentScope => 'none'),
    Match.exhaustive,
  )

const withDefaults = (tree: SpanTree): SpanModification => ({
  omitChildren: false,
  omitSeparatorAfter: false,
  sortChildren: false,
  sortKey: Option.none(),
  indentDocComment: defaultIndentDocComment(tree),
  prefix: Option.none(),
  suffix: Option.none(),
})

export const modificationOf = dual<
  (tree: SpanTree) => (plan: SpanPlan) => SpanModification,
  (plan: SpanPlan, tree: SpanTree) => SpanModification
>(
  2,
  (plan: SpanPlan, tree: SpanTree): SpanModification =>
    Option.getOrElse(HashMap.get(plan, tree.id), () => withDefaults(tree)),
)

export const prefixText = dual<
  (tree: SpanTree) => (plan: SpanPlan) => string,
  (plan: SpanPlan, tree: SpanTree) => string
>(2, (plan: SpanPlan, tree: SpanTree): string => Option.getOrElse(modificationOf(plan, tree).prefix, () => tree.prefix))

export const suffixText = dual<
  (tree: SpanTree) => (plan: SpanPlan) => string,
  (plan: SpanPlan, tree: SpanTree) => string
>(2, (plan: SpanPlan, tree: SpanTree): string => Option.getOrElse(modificationOf(plan, tree).suffix, () => tree.suffix))

const updated = (
  plan: SpanPlan,
  tree: SpanTree,
  update: (modification: SpanModification) => SpanModification,
): SpanPlan => HashMap.set(plan, tree.id, update(modificationOf(plan, tree)))

export const withPrefix = dual<
  (tree: SpanTree, prefix: string) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree, prefix: string) => SpanPlan
>(
  3,
  (plan: SpanPlan, tree: SpanTree, prefix: string): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, prefix: Option.some(prefix) })),
)

export const withSuffix = dual<
  (tree: SpanTree, suffix: string) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree, suffix: string) => SpanPlan
>(
  3,
  (plan: SpanPlan, tree: SpanTree, suffix: string): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, suffix: Option.some(suffix) })),
)

export const prependPrefix = dual<
  (tree: SpanTree, prefix: string) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree, prefix: string) => SpanPlan
>(
  3,
  (plan: SpanPlan, tree: SpanTree, prefix: string): SpanPlan =>
    withPrefix(plan, tree, `${prefix}${prefixText(plan, tree)}`),
)

export const skipAll = dual<
  (tree: SpanTree) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree) => SpanPlan
>(2, (plan: SpanPlan, tree: SpanTree): SpanPlan =>
  updated(plan, tree, (modification) => ({
    ...modification,
    omitChildren: true,
    omitSeparatorAfter: true,
    prefix: Option.some(''),
    suffix: Option.some(''),
  })))

export const omitChildren = dual<
  (tree: SpanTree) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree) => SpanPlan
>(
  2,
  (plan: SpanPlan, tree: SpanTree): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, omitChildren: true })),
)

export const omitSeparatorAfter = dual<
  (tree: SpanTree) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree) => SpanPlan
>(
  2,
  (plan: SpanPlan, tree: SpanTree): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, omitSeparatorAfter: true })),
)

export const sortChildren = dual<
  (tree: SpanTree) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree) => SpanPlan
>(
  2,
  (plan: SpanPlan, tree: SpanTree): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, sortChildren: true })),
)

export const withSortKey = dual<
  (tree: SpanTree, sortKey: string) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree, sortKey: string) => SpanPlan
>(
  3,
  (plan: SpanPlan, tree: SpanTree, sortKey: string): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, sortKey: Option.some(sortKey) })),
)

export const withIndentDocComment = dual<
  (tree: SpanTree, scope: IndentDocCommentScope) => (plan: SpanPlan) => SpanPlan,
  (plan: SpanPlan, tree: SpanTree, scope: IndentDocCommentScope) => SpanPlan
>(
  3,
  (plan: SpanPlan, tree: SpanTree, scope: IndentDocCommentScope): SpanPlan =>
    updated(plan, tree, (modification) => ({ ...modification, indentDocComment: scope })),
)

export const sortKeyOf = dual<
  (tree: SpanTree) => (plan: SpanPlan) => Option.Option<string>,
  (plan: SpanPlan, tree: SpanTree) => Option.Option<string>
>(2, (plan: SpanPlan, tree: SpanTree): Option.Option<string> => modificationOf(plan, tree).sortKey)
