import { dual } from 'effect/Function'
import type * as ts from 'typescript'

export interface LineAndColumn {
  readonly line: number
  readonly column: number
}

export const lineAndColumnOf = dual<
  (pos: number) => (sourceFile: ts.SourceFile) => LineAndColumn,
  (sourceFile: ts.SourceFile, pos: number) => LineAndColumn
>(2, (sourceFile: ts.SourceFile, pos: number): LineAndColumn => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos)
  return { line: line + 1, column: character + 1 }
})
