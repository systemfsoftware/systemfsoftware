import { Chunk, Data, Option } from 'effect'

import type { NodeId, SymbolId } from '../TypeScriptInternals.js'

export interface AstSymbolFields {
  readonly followedSymbolId: SymbolId
  readonly localName: string
  readonly isExternal: boolean
  readonly nominalAnalysis: boolean
  readonly parentAstSymbolId: Option.Option<SymbolId>
  readonly rootAstSymbolId: SymbolId
  readonly declarationIds: Chunk.Chunk<NodeId>
}

export class AstSymbol extends Data.TaggedClass('AstSymbol')<AstSymbolFields> {}
