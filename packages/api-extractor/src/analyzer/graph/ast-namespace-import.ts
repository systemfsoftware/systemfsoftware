import { Data } from 'effect'

import type { NodeId, SymbolId } from '../TypeScriptInternals.js'

export interface AstNamespaceImportFields {
  readonly localName: string
  readonly astModuleId: SymbolId
  readonly declarationId: NodeId
  readonly symbolId: SymbolId
  readonly isExport: boolean
}

export class AstNamespaceImport extends Data.TaggedClass('AstNamespaceImport')<AstNamespaceImportFields> {}
