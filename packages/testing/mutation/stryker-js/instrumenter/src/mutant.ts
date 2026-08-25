import babel, { type types } from '@babel/core'
import { type Location, type Mutant as ApiMutant, type Position } from '@systemfsoftware/stryker-js-plugin-api/core'
import { generate as generator } from './babel/babel-generator.js'

import { deepCloneNode } from './babel/clone.js'
import { eqNode } from './babel/equality.js'

const { traverse } = babel

export interface Mutable {
  mutatorName: string
  ignoreReason?: string | undefined
  replacement: types.Node
}

export interface Mutant extends Mutable {
  readonly id: string
  readonly fileName: string
  readonly original: types.Node
  readonly offset: Position
  readonly replacementCode: string
}

export function createMutant(
  id: string,
  fileName: string,
  original: types.Node,
  specs: Mutable,
  offset: Position = { column: 0, line: 0 },
): Mutant {
  return {
    id,
    fileName,
    original,
    offset,
    replacement: specs.replacement,
    mutatorName: specs.mutatorName,
    ignoreReason: specs.ignoreReason,
    replacementCode: generator(specs.replacement).code,
  }
}

export function toApiMutant(mutant: Mutant): ApiMutant {
  const loc = mutant.original.loc
  if (loc === undefined || loc === null) {
    throw new Error('Babel node without a source location')
  }
  return {
    fileName: mutant.fileName,
    id: mutant.id,
    location: toApiLocation(loc, mutant.offset),
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacementCode,
    ...(mutant.ignoreReason === undefined
      ? {}
      : { statusReason: mutant.ignoreReason }),
    ...(mutant.ignoreReason === undefined ? {} : { status: 'Ignored' as const }),
  }
}

/**
 * Applies the mutant in (a copy of) the AST, without changing provided AST.
 * Can the tree itself (in which case the replacement is returned),
 * or can be nested in the given tree.
 *
 * Returns a plain node rather than the argument's own type: whether the
 * replacement fits a given position is the placer's claim, and the placer
 * checks it with a Babel predicate. A generic return would have to assert it
 * here, where nothing can check it.
 * @param mutant the mutant to apply
 * @param originalTree The original node, which will be treated as readonly
 */
export function applyMutant(mutant: Mutant, originalTree: types.Node): types.Node {
  if (originalTree === mutant.original) {
    return mutant.replacement
  }
  const mutatedAst = deepCloneNode(originalTree)
  let applied = false
  const { original, replacement } = mutant
  traverse(mutatedAst, {
    noScope: true,
    enter(path) {
      if (eqNode(path.node, original)) {
        path.replaceWith(replacement)
        path.stop()
        applied = true
      }
    },
  })
  if (!applied) {
    throw new Error(
      `Could not apply mutant ${JSON.stringify(replacement)}.`,
    )
  }
  return mutatedAst
}

function toApiLocation(
  source: types.SourceLocation,
  offset: Position,
): Location {
  const loc = {
    start: toPosition(source.start, offset),
    end: toPosition(source.end, offset),
  }
  return loc
}

function toPosition(source: Position, offset: Position): Position {
  return {
    column: source.column + (source.line === 1 ? offset.column : 0),
    line: source.line + offset.line - 1,
  }
}
