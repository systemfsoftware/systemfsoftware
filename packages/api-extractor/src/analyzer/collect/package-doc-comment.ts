import type * as tsdoc from '@microsoft/tsdoc'
import { Data, Option } from 'effect'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as ts from 'typescript'

import { ConsoleMessageId, MessageLog } from '../../collector/message-log.js'

export interface PackageDocCommentFields {
  readonly parserContext: tsdoc.ParserContext
  readonly docComment: tsdoc.DocComment
}

export class PackageDocComment extends Data.TaggedClass('PackageDocComment')<PackageDocCommentFields> {}

const PREAMBLE_WARNING = 'The @packageDocumentation comment must appear at the top of entry point *.d.ts file'

const isPackageDocumentationComment = (sourceFile: ts.SourceFile, range: ts.TextRange): boolean =>
  /@packageDocumentation/i.test(sourceFile.text.substring(range.pos, range.end))

const isDocCommentStart = (sourceFile: ts.SourceFile, range: ts.CommentRange): boolean =>
  Match.value(range.kind === ts.SyntaxKind.MultiLineCommentTrivia).pipe(
    Match.when(true, () => /^\s*\/\*\*/.test(sourceFile.text.substring(range.pos, range.end))),
    Match.when(false, () => false),
    Match.exhaustive,
  )

const leadingRangeOf = (sourceFile: ts.SourceFile): Option.Option<ts.TextRange> =>
  Option.filter(
    Arr.findFirst(
      Option.getOrElse(
        Option.fromNullishOr(ts.getLeadingCommentRanges(sourceFile.text, sourceFile.getFullStart())),
        () => [],
      ),
      (range) => isDocCommentStart(sourceFile, range),
    ),
    (range) => isPackageDocumentationComment(sourceFile, range),
  )

const rangesOfStatement = (sourceFile: ts.SourceFile, statement: ts.Statement): ReadonlyArray<ts.CommentRange> => [
  ...Option.getOrElse(
    Option.fromNullishOr(ts.getLeadingCommentRanges(sourceFile.text, statement.getFullStart())),
    () => [],
  ),
  ...Option.getOrElse(
    Option.fromNullishOr(ts.getTrailingCommentRanges(sourceFile.text, statement.getEnd())),
    () => [],
  ),
]

const warningLogOf = (sourceFile: ts.SourceFile, log: MessageLog, statement: ts.Statement): MessageLog =>
  Option.match(
    Arr.findFirst(
      rangesOfStatement(sourceFile, statement),
      (range) => isPackageDocumentationComment(sourceFile, range),
    ),
    {
      onNone: () => log,
      onSome: () => MessageLog.addConsoleMessage(log, ConsoleMessageId.Preamble, 'warning', PREAMBLE_WARNING),
    },
  )

export const findPackageDocComment = (
  sourceFile: ts.SourceFile,
  log: MessageLog,
): readonly [MessageLog, Option.Option<ts.TextRange>] => {
  const leading = leadingRangeOf(sourceFile)
  const withWarnings = (accumulated: MessageLog, statement: ts.Statement): MessageLog =>
    Option.match(leading, {
      onSome: () => accumulated,
      onNone: () => warningLogOf(sourceFile, accumulated, statement),
    })
  return [
    Arr.reduce(sourceFile.statements, log, withWarnings),
    leading,
  ]
}
