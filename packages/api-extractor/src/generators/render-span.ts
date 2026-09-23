import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'

import * as SpanPlan from './span-plan.js'
import * as SpanTree from './span-tree.js'
import * as TextWriter from './text-writer.js'

type DocCommentState = 'inactive' | 'awaitingOpenDelimiter' | 'awaitingCloseDelimiter' | 'done'

interface RenderState {
  readonly writer: TextWriter.TextWriter
  readonly separatorOverride: Option.Option<string>
  readonly docComment: DocCommentState
}

interface DocCommentSlice {
  readonly state: RenderState
  readonly rest: string
}

interface SortedWalk {
  readonly state: RenderState
  readonly taken: number
}

export const writeSpan = (
  tree: SpanTree.SpanTree,
  plan: SpanPlan.SpanPlan,
  writer: TextWriter.TextWriter,
): TextWriter.TextWriter =>
  writeModifiedSpan(tree, plan, {
    writer,
    separatorOverride: Option.none(),
    docComment: 'inactive',
  }).writer

/** Standalone render of one span subtree: the counterpart of the legacy `getModifiedText()`. */
export const renderText = (tree: SpanTree.SpanTree, plan: SpanPlan.SpanPlan): string =>
  TextWriter.getText(writeSpan(tree, plan, TextWriter.make({ trimLeadingSpaces: true })))

const withWriter = (state: RenderState, writer: TextWriter.TextWriter): RenderState => ({ ...state, writer })

const withDocComment = (state: RenderState, docComment: DocCommentState): RenderState => ({ ...state, docComment })

const adjustIndent = (prefix: string, state: RenderState): RenderState =>
  Match.value(prefix).pipe(
    Match.when('{', () => withWriter(state, TextWriter.increaseIndent(state.writer))),
    Match.when('}', () => withWriter(state, TextWriter.decreaseIndent(state.writer))),
    Match.orElse(() => state),
  )

const openDocCommentScope = (scope: SpanPlan.IndentDocCommentScope, state: RenderState): RenderState =>
  Match.value(scope).pipe(
    Match.when('none', () => state),
    Match.orElse(() => withDocComment(state, 'awaitingOpenDelimiter')),
  )

const closeDocCommentScope = (scope: SpanPlan.IndentDocCommentScope, state: RenderState): RenderState =>
  Match.value(scope).pipe(
    Match.when('none', () => state),
    Match.orElse(() => withDocComment(state, 'inactive')),
  )

const afterDelimiter = (text: string, delimiter: string, index: number): string =>
  text.substring(index + delimiter.length)

const writeOpenDelimiter = (state: RenderState, text: string): Option.Option<DocCommentSlice> => {
  const index = text.indexOf('/*')
  return Match.value(index >= 0).pipe(
    Match.when(true, () =>
      Option.some({
        rest: afterDelimiter(text, '/*', index),
        state: withWriter(
          withDocComment(state, 'awaitingCloseDelimiter'),
          TextWriter.increaseIndent(TextWriter.write(state.writer, text.substring(0, index + 2)), ' '),
        ),
      })),
    Match.orElse(() => Option.none()),
  )
}

const writeCloseDelimiter = (state: RenderState, text: string): Option.Option<DocCommentSlice> => {
  const index = text.indexOf('*/')
  return Match.value(index >= 0).pipe(
    Match.when(true, () =>
      Option.some({
        rest: afterDelimiter(text, '*/', index),
        state: withWriter(
          withDocComment(state, 'done'),
          TextWriter.decreaseIndent(TextWriter.write(state.writer, text.substring(0, index + 2))),
        ),
      })),
    Match.orElse(() => Option.none()),
  )
}

const closedSliceOf = (state: RenderState, text: string): Option.Option<DocCommentSlice> =>
  Match.value(state.docComment).pipe(
    Match.when('awaitingCloseDelimiter', () => writeCloseDelimiter(state, text)),
    Match.orElse(() => Option.none<DocCommentSlice>()),
  )

const writeDocCommentAware = (state: RenderState, text: string): RenderState => {
  const opened = Match.value(state.docComment).pipe(
    Match.when('awaitingOpenDelimiter', () => writeOpenDelimiter(state, text)),
    Match.orElse(() => Option.none<DocCommentSlice>()),
  )
  const mid = Option.match(opened, {
    onSome: (slice) => slice,
    onNone: () => ({ state, rest: text }),
  })
  const closed = closedSliceOf(mid.state, mid.rest)
  const final = Option.match(closed, {
    onSome: (slice) => slice,
    onNone: () => ({ state: mid.state, rest: mid.rest }),
  })
  return withWriter(final.state, TextWriter.write(final.state.writer, final.rest))
}

const sortedSubsetOf = (
  plan: SpanPlan.SpanPlan,
  tree: SpanTree.SpanTree,
): Option.Option<ReadonlyArray<SpanTree.SpanTree>> =>
  Option.some(tree.children).pipe(
    Option.filter(() => !SpanPlan.modificationOf(plan, tree).omitChildren),
    Option.filter(() => SpanPlan.modificationOf(plan, tree).sortChildren),
    Option.map((children) => Arr.filter(children, (child) => Option.isSome(SpanPlan.sortKeyOf(plan, child)))),
    Option.filter((filtered) => filtered.length > 1),
  )

const innerSeparatorOf = (trees: Option.Option<SpanTree.SpanTree>): string =>
  Option.getOrElse(Option.map(trees, SpanTree.lastInnerSeparator), () => '')

const separatorOverrideFor = (
  taken: number,
  count: number,
  firstSeparator: string,
  lastSeparator: string,
): Option.Option<string> =>
  Match.value(taken < count).pipe(
    Match.when(true, () => Option.some(firstSeparator)),
    Match.when(false, () => Option.some(lastSeparator)),
    Match.exhaustive,
  )

const sortedWalkOf = (
  walk: SortedWalk,
  sorted: ReadonlyArray<SpanTree.SpanTree>,
  plan: SpanPlan.SpanPlan,
  firstSeparator: string,
  lastSeparator: string,
): SortedWalk =>
  Option.match(Arr.get(sorted, walk.taken), {
    onNone: () => walk,
    onSome: (current) => ({
      taken: walk.taken + 1,
      state: writeModifiedSpan(current, plan, {
        ...walk.state,
        separatorOverride: separatorOverrideFor(walk.taken + 1, sorted.length, firstSeparator, lastSeparator),
      }),
    }),
  })

/*
 * The legacy renderer forks its options object for a sorted child loop, so the children share the writer
 * but their doc-comment state changes never reach the parent span.
 */
const writeSortedChildren = (
  tree: SpanTree.SpanTree,
  plan: SpanPlan.SpanPlan,
  sortedSubset: ReadonlyArray<SpanTree.SpanTree>,
  state: RenderState,
): RenderState => {
  const sorted = Arr.sort(
    sortedSubset,
    Order.mapInput(
      Order.String,
      (child: SpanTree.SpanTree) => Option.getOrElse(SpanPlan.sortKeyOf(plan, child), () => ''),
    ),
  )
  const firstSeparator = innerSeparatorOf(Arr.head(sortedSubset))
  const lastSeparator = innerSeparatorOf(Arr.last(sortedSubset))
  const walked = Arr.reduce(
    tree.children,
    { state: { ...state }, taken: 0 } satisfies SortedWalk,
    (walk, child) =>
      Match.value(Option.isSome(SpanPlan.sortKeyOf(plan, child))).pipe(
        Match.when(false, () => ({
          taken: walk.taken,
          state: writeModifiedSpan(child, plan, { ...walk.state, separatorOverride: Option.none() }),
        })),
        Match.when(true, () => sortedWalkOf(walk, sorted, plan, firstSeparator, lastSeparator)),
        Match.exhaustive,
      ),
  )
  return withWriter(state, walked.state.writer)
}

const writeSequentialChildren = (tree: SpanTree.SpanTree, plan: SpanPlan.SpanPlan, state: RenderState): RenderState =>
  Match.value(SpanPlan.modificationOf(plan, tree).omitChildren).pipe(
    Match.when(true, () => state),
    Match.when(
      false,
      () => Arr.reduce(tree.children, state, (current, child) => writeModifiedSpan(child, plan, current)),
    ),
    Match.exhaustive,
  )

/*
 * With a separator override, only the last child of a span without its own separator may flow its
 * doc-comment state back; every other child renders against a fork.
 */
const writeOverriddenChildren = (
  tree: SpanTree.SpanTree,
  plan: SpanPlan.SpanPlan,
  state: RenderState,
): RenderState =>
  Match.value(SpanPlan.modificationOf(plan, tree).omitChildren).pipe(
    Match.when(true, () => state),
    Match.when(false, () => {
      const lastIndex = tree.children.length - 1
      return Arr.reduce(tree.children, state, (current, child, index) => {
        const flowsToParent = index === lastIndex && tree.separator.length === 0
        return Match.value(flowsToParent).pipe(
          Match.when(true, () => writeModifiedSpan(child, plan, current)),
          Match.when(false, () => {
            const forked = writeModifiedSpan(child, plan, { ...current, separatorOverride: Option.none() })
            return withWriter(current, forked.writer)
          }),
          Match.exhaustive,
        )
      })
    }),
    Match.exhaustive,
  )

const writePlainSeparator = (tree: SpanTree.SpanTree, plan: SpanPlan.SpanPlan, state: RenderState): RenderState =>
  Match.value(SpanPlan.modificationOf(plan, tree).omitSeparatorAfter).pipe(
    Match.when(true, () => state),
    Match.when(false, () => writeDocCommentAware(state, tree.separator)),
    Match.exhaustive,
  )

const writeSeparatorAfter = (
  tree: SpanTree.SpanTree,
  plan: SpanPlan.SpanPlan,
  entry: RenderState,
  state: RenderState,
): RenderState =>
  Match.value(entry.separatorOverride).pipe(
    Match.when(Option.isSome, (override) =>
      Match.value(tree.separator.length > 0 || tree.children.length === 0).pipe(
        Match.when(true, () => writeDocCommentAware(state, override.value)),
        Match.when(false, () => state),
        Match.exhaustive,
      )),
    Match.orElse(() => writePlainSeparator(tree, plan, state)),
  )

const writeChildrenAndSuffix = (
  tree: SpanTree.SpanTree,
  plan: SpanPlan.SpanPlan,
  suffix: string,
  state: RenderState,
): RenderState => {
  const afterChildren = Match.value(state.separatorOverride).pipe(
    Match.when(Option.isSome, () => writeOverriddenChildren(tree, plan, state)),
    Match.orElse(() => writeSequentialChildren(tree, plan, state)),
  )
  return writeSeparatorAfter(tree, plan, state, writeDocCommentAware(afterChildren, suffix))
}

const writeModifiedSpan = (
  tree: SpanTree.SpanTree,
  plan: SpanPlan.SpanPlan,
  state: RenderState,
): RenderState => {
  const prefix = SpanPlan.prefixText(plan, tree)
  const suffix = SpanPlan.suffixText(plan, tree)
  const scope = SpanPlan.modificationOf(plan, tree).indentDocComment

  const opened = openDocCommentScope(scope, adjustIndent(tree.prefix, state))
  const afterPrefix = writeDocCommentAware(opened, prefix)
  const afterPrefixScope = Match.value(scope).pipe(
    Match.when('prefixOnly', () => closeDocCommentScope(scope, afterPrefix)),
    Match.orElse(() => afterPrefix),
  )
  const afterBody = Match.value(sortedSubsetOf(plan, tree)).pipe(
    Match.when(Option.isSome, (sortedSubset) => writeSortedChildren(tree, plan, sortedSubset.value, afterPrefixScope)),
    Match.orElse(() => writeChildrenAndSuffix(tree, plan, suffix, afterPrefixScope)),
  )
  return Match.value(scope).pipe(
    Match.when('spanAndChildren', () => closeDocCommentScope(scope, afterBody)),
    Match.orElse(() => afterBody),
  )
}
