import * as tsdoc from '@microsoft/tsdoc'
import { Chunk, Data, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Result from 'effect/Result'

export interface EffectiveDocCommentFields {
  readonly summarySection: tsdoc.DocSection
  readonly remarksBlock: Option.Option<tsdoc.DocBlock>
  readonly privateRemarks: Option.Option<tsdoc.DocBlock>
  readonly deprecatedBlock: Option.Option<tsdoc.DocBlock>
  readonly params: tsdoc.DocParamCollection
  readonly typeParams: tsdoc.DocParamCollection
  readonly returnsBlock: Option.Option<tsdoc.DocBlock>
  readonly customBlocks: Chunk.Chunk<tsdoc.DocBlock>
  readonly seeBlocks: Chunk.Chunk<tsdoc.DocBlock>
  readonly inheritDocTag: Option.Option<tsdoc.DocInheritDocTag>
  readonly modifierTagSet: tsdoc.StandardModifierTagSet
}

export class EffectiveDocComment extends Data.TaggedClass('EffectiveDocComment')<EffectiveDocCommentFields> {}

export const fromParsedDocComment = (docComment: tsdoc.DocComment): EffectiveDocComment =>
  new EffectiveDocComment({
    summarySection: docComment.summarySection,
    remarksBlock: Option.fromUndefinedOr(docComment.remarksBlock),
    privateRemarks: Option.fromUndefinedOr(docComment.privateRemarks),
    deprecatedBlock: Option.fromUndefinedOr(docComment.deprecatedBlock),
    params: docComment.params,
    typeParams: docComment.typeParams,
    returnsBlock: Option.fromUndefinedOr(docComment.returnsBlock),
    customBlocks: Chunk.fromIterable(docComment.customBlocks),
    seeBlocks: Chunk.fromIterable(docComment.seeBlocks),
    inheritDocTag: Option.fromUndefinedOr(docComment.inheritDocTag),
    modifierTagSet: docComment.modifierTagSet,
  })

export const childNodesOf = (record: EffectiveDocComment): ReadonlyArray<tsdoc.DocNode> => {
  const optionalNodes: ReadonlyArray<Option.Option<tsdoc.DocNode>> = [
    Option.map(Option.some(record.summarySection), (node) => node),
    Option.map(record.remarksBlock, (node) => node),
    Option.map(record.privateRemarks, (node) => node),
    Option.map(record.deprecatedBlock, (node) => node),
    Option.map(
      Option.filter(Option.some(record.params), (collection) => collection.count > 0),
      (node) => node,
    ),
    Option.map(
      Option.filter(Option.some(record.typeParams), (collection) => collection.count > 0),
      (node) => node,
    ),
    Option.map(record.returnsBlock, (node) => node),
    ...Chunk.toReadonlyArray(
      Chunk.map(
        Chunk.appendAll(record.customBlocks, record.seeBlocks),
        (block) => Option.map(Option.some(block), (node) => node),
      ),
    ),
    Option.map(record.inheritDocTag, (node) => node),
  ]
  return Arr.appendAll(
    Arr.filterMap(optionalNodes, (node) => Result.fromOption(node, () => undefined)),
    record.modifierTagSet.nodes,
  )
}
