import { Chunk, Data, Option } from 'effect'

import type { NodeId, SymbolId } from '../TypeScriptInternals.js'
import type { AstEntityRef } from './ast-entity.js'

export interface AstModuleFields {
  readonly sourceFileId: NodeId
  readonly moduleSymbolId: SymbolId
  readonly externalModulePath: Option.Option<string>
}

export class AstModule extends Data.TaggedClass('AstModule')<AstModuleFields> {}

export const isExternalModule = (astModule: AstModule): boolean => Option.isSome(astModule.externalModulePath)

export interface AstModuleExportInfoFields {
  readonly visitedAstModules: Chunk.Chunk<SymbolId>
  readonly exportedLocalEntities: Chunk.Chunk<readonly [string, AstEntityRef]>
  readonly starExportedExternalModules: Chunk.Chunk<SymbolId>
}

export class AstModuleExportInfo extends Data.TaggedClass('AstModuleExportInfo')<AstModuleExportInfoFields> {}

export const emptyAstModuleExportInfo: AstModuleExportInfo = new AstModuleExportInfo({
  visitedAstModules: Chunk.empty(),
  exportedLocalEntities: Chunk.empty(),
  starExportedExternalModules: Chunk.empty(),
})
