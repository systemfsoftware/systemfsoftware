import babel, { type types } from '@babel/core'
import { type Location, type Mutant as ApiMutant, type Position } from '@systemfsoftware/stryker-js-plugin-api/core'
import { generate as generator } from './util/babel-generator.js'

import { deepCloneNode, eqNode } from './util/index.js'

const { traverse } = babel

export interface Mutable {
  mutatorName: string
  ignoreReason?: string | undefined
  replacement: types.Node
}

export class Mutant implements Mutable {
  public readonly replacementCode: string
  public readonly replacement: types.Node
  public readonly mutatorName: string
  public readonly ignoreReason: string | undefined

  constructor(
    public readonly id: string,
    public readonly fileName: string,
    public readonly original: types.Node,
    specs: Mutable,
    public readonly offset: Position = { column: 0, line: 0 },
  ) {
    this.replacement = specs.replacement
    this.mutatorName = specs.mutatorName
    this.ignoreReason = specs.ignoreReason
    this.replacementCode = generator(this.replacement).code
  }

  public toApiMutant(): ApiMutant {
    const loc = this.original.loc
    if (loc === undefined || loc === null) {
      throw new Error('Babel node without a source location')
    }
    return {
      fileName: this.fileName,
      id: this.id,
      location: toApiLocation(loc, this.offset),
      mutatorName: this.mutatorName,
      replacement: this.replacementCode,
      ...(this.ignoreReason === undefined
        ? {}
        : { statusReason: this.ignoreReason }),
      ...(this.ignoreReason === undefined ? {} : { status: 'Ignored' as const }),
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
   * @param originalTree The original node, which will be treated as readonly
   */
  public applied(originalTree: types.Node): types.Node {
    if (originalTree === this.original) {
      return this.replacement
    } else {
      const mutatedAst = deepCloneNode(originalTree)
      let applied = false
      const { original, replacement } = this
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
          `Could not apply mutant ${JSON.stringify(this.replacement)}.`,
        )
      }
      return mutatedAst
    }
  }
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
    column: source.column + (source.line === 1 ? offset.column : 0), // offset is zero-based
    line: source.line + offset.line - 1, // Stryker works 0-based internally, offset is zero based as well
  }
}
