import babel from '@babel/core'

interface Position {
  line: number
  column: number
}

function eqPosition(a: Position, b: Position): boolean {
  return a.line === b.line && a.column === b.column
}

function eqLocation(
  a: babel.types.SourceLocation,
  b: babel.types.SourceLocation,
): boolean {
  return eqPosition(a.start, b.start) && eqPosition(a.end, b.end)
}

export function eqNode<T extends babel.types.Node>(
  a: T,
  b: babel.types.Node,
): b is T {
  return a.type === b.type && !!a.loc && !!b.loc && eqLocation(a.loc, b.loc)
}
