import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'
import type { Collector } from './Collector.js'
import { ConsoleMessageId } from './message-log.js'

export class PackageDocComment extends Pipeable.Class {
  public static tryFindInSourceFile(
    sourceFile: ts.SourceFile,
    collector: Collector,
  ): ts.TextRange | undefined {
    let packageCommentRange: ts.TextRange | undefined

    for (const commentRange of ts.getLeadingCommentRanges(sourceFile.text, sourceFile.getFullStart()) ?? []) {
      if (commentRange.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        const commentBody = sourceFile.text.substring(commentRange.pos, commentRange.end)

        if (/^\s*\/\*\*/.test(commentBody)) {
          if (/@packageDocumentation/i.test(commentBody)) {
            packageCommentRange = commentRange
          }
          break
        }
      }
    }

    if (packageCommentRange === undefined) {
      for (const statement of sourceFile.statements) {
        const ranges: ts.CommentRange[] = []
        ranges.push(...(ts.getLeadingCommentRanges(sourceFile.text, statement.getFullStart()) ?? []))
        ranges.push(...(ts.getTrailingCommentRanges(sourceFile.text, statement.getEnd()) ?? []))

        for (const commentRange of ranges) {
          const commentBody = sourceFile.text.substring(commentRange.pos, commentRange.end)

          if (/@packageDocumentation/i.test(commentBody)) {
            collector.addConsoleMessage(
              ConsoleMessageId.Preamble,
              'warning',
              'The @packageDocumentation comment must appear at the top of entry point *.d.ts file',
            )
            break
          }
        }
      }
    }

    return packageCommentRange
  }
}
