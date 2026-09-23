import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'

import { AstDeclaration } from '../analyzer/AstDeclaration.js'
import type { AstEntity } from '../analyzer/AstEntity.js'
import { AstImport, AstImportKind } from '../analyzer/AstImport.js'
import { AstNamespaceImport } from '../analyzer/AstNamespaceImport.js'
import { AstSymbol } from '../analyzer/AstSymbol.js'
import { IndentedWriter } from '../analyzer/indented-writer.js'
import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import { IndentDocCommentScope, Span, type SpanModification } from '../analyzer/Span.js'
import * as SyntaxHelpers from '../analyzer/SyntaxHelpers.js'
import * as TypeScriptHelpers from '../analyzer/TypeScriptHelpers.js'
import type { ApiItemMetadata } from '../collector/ApiItemMetadata.js'
import type { Collector } from '../collector/Collector.js'
import type { CollectorEntity } from '../collector/CollectorEntity.js'
import type { DeclarationMetadata } from '../collector/DeclarationMetadata.js'
import type { SymbolMetadata } from '../collector/SymbolMetadata.js'
import { UnsupportedStarExportError } from '../errors/index.js'
import { ReleaseTag } from '../model/index.js'
import { invariant } from '../utils/invariant.js'
import { DtsEmitHelpers } from './dts-emit-helpers.js'
import {
  formatAliasDeclarations,
  formatAliasExportClause,
  type NamespaceMember,
  type NamespaceMemberKind,
  planNamespaceAliases,
} from './namespace-aliaser.js'

export enum DtsRollupKind {
  InternalRelease = 0,
  AlphaRelease = 1,
  BetaRelease = 2,
  PublicRelease = 3,
}

const shouldIncludeReleaseTag = (releaseTag: ReleaseTag, dtsKind: DtsRollupKind): boolean => {
  switch (dtsKind) {
    case DtsRollupKind.InternalRelease:
      return true
    case DtsRollupKind.AlphaRelease:
      return (
        releaseTag === ReleaseTag.Alpha ||
        releaseTag === ReleaseTag.Beta ||
        releaseTag === ReleaseTag.Public ||
        releaseTag === ReleaseTag.None
      )
    case DtsRollupKind.BetaRelease:
      return (
        releaseTag === ReleaseTag.Beta ||
        releaseTag === ReleaseTag.Public ||
        releaseTag === ReleaseTag.None
      )
    case DtsRollupKind.PublicRelease:
      return releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None
  }
}

const classifyNamespaceMember = (astEntity: AstEntity): NamespaceMemberKind => {
  if (astEntity instanceof AstNamespaceImport) {
    return 'namespace'
  }
  if (astEntity instanceof AstImport) {
    if (
      astEntity.importKind === AstImportKind.StarImport ||
      astEntity.importKind === AstImportKind.EqualsImport ||
      astEntity.importKind === AstImportKind.ImportType
    ) {
      return 'namespace'
    }
    return astEntity.isTypeOnlyEverywhere ? 'type' : 'value'
  }
  if (astEntity instanceof AstSymbol) {
    const flags = astEntity.followedSymbol.flags
    // eslint-disable-next-line no-bitwise
    if ((flags & ts.SymbolFlags.Namespace) !== 0) {
      return 'namespace'
    }
    // eslint-disable-next-line no-bitwise
    const hasValue = (flags & ts.SymbolFlags.Value) !== 0
    // eslint-disable-next-line no-bitwise
    const hasType = (flags & ts.SymbolFlags.Type) !== 0
    if (hasValue && hasType) {
      return 'both'
    }
    return hasType ? 'type' : 'value'
  }
  return 'value'
}

const isKeywordNeedingModifiers = (kind: ts.SyntaxKind): boolean =>
  kind === ts.SyntaxKind.InterfaceKeyword ||
  kind === ts.SyntaxKind.ClassKeyword ||
  kind === ts.SyntaxKind.EnumKeyword ||
  kind === ts.SyntaxKind.NamespaceKeyword ||
  kind === ts.SyntaxKind.ModuleKeyword ||
  kind === ts.SyntaxKind.TypeKeyword ||
  kind === ts.SyntaxKind.FunctionKeyword

const handleKeywordModifiers = (span: Span, entity: CollectorEntity, astDeclaration: AstDeclaration): void => {
  let replacedModifiers: string = ''
  if (!astDeclaration.parent) {
    replacedModifiers += 'declare '
  }
  if (entity.shouldInlineExport) {
    replacedModifiers = 'export ' + replacedModifiers
  }
  const previousSpan = span.previousSibling
  if (previousSpan !== undefined && previousSpan.kind === ts.SyntaxKind.SyntaxList) {
    previousSpan.modification.prefix = replacedModifiers + previousSpan.modification.prefix
  } else {
    span.modification.prefix = replacedModifiers + span.modification.prefix
  }
}

const handleVariableDeclaration = (
  collector: Collector,
  span: Span,
  entity: CollectorEntity,
  astDeclaration: AstDeclaration,
): void => {
  if (span.parent !== undefined) {
    return
  }
  const list = TypeScriptHelpers.matchAncestor<ts.VariableDeclarationList>(span.node, [
    ts.SyntaxKind.VariableDeclarationList,
    ts.SyntaxKind.VariableDeclaration,
  ])
  if (list === undefined) {
    throw invariant('Unsupported variable declaration')
  }
  const sourceFile = list.getSourceFile()
  const firstDeclStart = list.declarations[0]?.getStart() ?? list.getStart()
  const listPrefix = sourceFile.text.substring(list.getStart(), firstDeclStart)
  span.modification.prefix = 'declare ' + listPrefix + span.modification.prefix
  span.modification.suffix = ';'

  if (entity.shouldInlineExport) {
    span.modification.prefix = 'export ' + span.modification.prefix
  }

  const declarationMetadata: DeclarationMetadata = collector.fetchDeclarationMetadata(astDeclaration)
  if (declarationMetadata.tsdocParserContext !== undefined) {
    let originalComment: string = declarationMetadata.tsdocParserContext.sourceRange.toString()
    if (!/\r?\n\s*$/.test(originalComment)) {
      originalComment += '\n'
    }
    span.modification.indentDocComment = IndentDocCommentScope.PrefixOnly
    span.modification.prefix = originalComment + span.modification.prefix
  }
}

const handleIdentifier = (collector: Collector, span: Span): void => {
  if (!ts.isIdentifier(span.node)) {
    return
  }
  const referencedEntity = collector.tryGetEntityForNode(span.node)
  if (referencedEntity !== undefined) {
    if (referencedEntity.nameForEmit === undefined || referencedEntity.nameForEmit.length === 0) {
      throw invariant('referencedEntry.nameForEmit is undefined')
    }
    span.modification.prefix = referencedEntity.nameForEmit
  }
}

const trimChildSpan = (
  collector: Collector,
  child: Span,
  childAstDeclaration: AstDeclaration,
  dtsKind: DtsRollupKind,
): boolean => {
  const releaseTag = collector.fetchApiItemMetadata(childAstDeclaration).effectiveReleaseTag
  if (shouldIncludeReleaseTag(releaseTag, dtsKind)) {
    return false
  }
  let nodeToTrim: Span = child
  if (child.kind === ts.SyntaxKind.VariableDeclaration) {
    const variableStatement = child.findFirstParent(ts.SyntaxKind.VariableStatement)
    if (variableStatement !== undefined) {
      nodeToTrim = variableStatement
    }
  }

  const modification: SpanModification = nodeToTrim.modification
  const name: string = childAstDeclaration.astSymbol.localName
  modification.omitChildren = true

  if (collector.extractorConfig.dtsRollup.omitTrimmingComments !== true) {
    modification.prefix = `/* Excluded from this release type: ${name} */`
  } else {
    modification.prefix = ''
  }
  modification.suffix = ''

  if (nodeToTrim.children.length > 0) {
    modification.suffix = nodeToTrim.children[nodeToTrim.children.length - 1]?.separator ?? ''
  }

  if (nodeToTrim.nextSibling?.kind === ts.SyntaxKind.CommaToken) {
    modification.suffix += nodeToTrim.nextSibling.separator
    nodeToTrim.nextSibling.modification.skipAll()
  }

  if (modification.suffix.trim().length === 0 && modification.prefix.trim().length === 0) {
    modification.suffix = ''
    modification.prefix = ''
  }

  return true
}

const modifySpan = (
  collector: Collector,
  span: Span,
  entity: CollectorEntity,
  astDeclaration: AstDeclaration,
  dtsKind: DtsRollupKind,
): void => {
  let recurseChildren = true

  if (span.kind === ts.SyntaxKind.JSDocComment) {
    if (span.node.getText().match(/(?:\s|\*)@packageDocumentation(?:\s|\*)/gi)) {
      span.modification.skipAll()
    }
    recurseChildren = false
  } else if (span.kind === ts.SyntaxKind.ExportKeyword) {
    if (!DtsEmitHelpers.isExportKeywordInNamespaceExportDeclaration(span.node)) {
      span.modification.skipAll()
    }
  } else if (span.kind === ts.SyntaxKind.DefaultKeyword || span.kind === ts.SyntaxKind.DeclareKeyword) {
    span.modification.skipAll()
  } else if (isKeywordNeedingModifiers(span.kind)) {
    handleKeywordModifiers(span, entity, astDeclaration)
  } else if (span.kind === ts.SyntaxKind.VariableDeclaration) {
    handleVariableDeclaration(collector, span, entity, astDeclaration)
  } else if (span.kind === ts.SyntaxKind.Identifier) {
    handleIdentifier(collector, span)
  } else if (span.kind === ts.SyntaxKind.ImportType) {
    DtsEmitHelpers.modifyImportTypeSpan(
      collector,
      span,
      astDeclaration,
      (childSpan, childAstDeclaration) => {
        modifySpan(collector, childSpan, entity, childAstDeclaration, dtsKind)
      },
    )
  }

  if (!recurseChildren) {
    return
  }

  for (const child of span.children) {
    let childAstDeclaration: AstDeclaration = astDeclaration
    let trimmed = false
    if (AstDeclaration.isSupportedSyntaxKind(child.kind)) {
      childAstDeclaration = collector.astSymbolTable.getChildAstDeclarationByNode(
        child.node,
        astDeclaration,
      )
      trimmed = trimChildSpan(collector, child, childAstDeclaration, dtsKind)
    }

    if (!trimmed) {
      modifySpan(collector, child, entity, childAstDeclaration, dtsKind)
    }
  }
}

const emitNamespaceBlock = (
  writer: IndentedWriter,
  collector: Collector,
  entity: CollectorEntity,
  astEntity: AstNamespaceImport,
  reservedNames: Set<string>,
  dtsKind: DtsRollupKind,
): void => {
  const astModuleExportInfo = astEntity.fetchAstModuleExportInfo(collector)
  const namespaceName = entity.nameForEmit

  if (namespaceName === undefined || namespaceName.length === 0) {
    throw invariant('referencedEntry.nameForEmit is undefined')
  }

  if (astModuleExportInfo.starExportedExternalModules.size > 0) {
    throw new UnsupportedStarExportError({
      namespaceName,
      moduleSpecifier: SourceFileLocationFormatter.formatDeclaration(astEntity.declaration),
    })
  }

  const members: NamespaceMember[] = []
  for (const [exportedName, exportedEntity] of astModuleExportInfo.exportedLocalEntities) {
    const memberEntity = collector.tryGetCollectorEntity(exportedEntity)
    if (memberEntity === undefined) {
      throw invariant(`Cannot find collector entity for ${namespaceName}.${exportedEntity.localName}`)
    }

    const exportedMetadata: SymbolMetadata | undefined = collector.tryFetchMetadataForAstEntity(exportedEntity)
    const exportedMaxReleaseTag: ReleaseTag = exportedMetadata?.maxEffectiveReleaseTag ?? ReleaseTag.None
    if (!shouldIncludeReleaseTag(exportedMaxReleaseTag, dtsKind)) {
      continue
    }

    const targetName = memberEntity.nameForEmit
    if (targetName === undefined || targetName.length === 0) {
      throw invariant(`referencedEntry.nameForEmit is undefined for ${exportedEntity.localName}`)
    }

    members.push({
      memberName: exportedName,
      targetName,
      kind: classifyNamespaceMember(exportedEntity),
    })
  }

  const aliases = planNamespaceAliases(namespaceName, members, reservedNames)
  for (const alias of aliases) {
    reservedNames.add(alias.aliasName)
  }

  writer.ensureSkippedLine()
  for (const alias of aliases) {
    for (const decl of formatAliasDeclarations(alias)) {
      writer.writeLine(decl)
    }
  }

  writer.ensureSkippedLine()
  if (entity.shouldInlineExport) {
    writer.write('export ')
  }
  writer.writeLine(`declare namespace ${namespaceName} {`)
  writer.increaseIndent()
  writer.writeLine('export {')
  writer.increaseIndent()

  const exportClauses = aliases.map((alias) =>
    formatAliasExportClause(alias, (name) => SyntaxHelpers.isSafeUnquotedMemberIdentifier(name))
  )
  writer.writeLine(exportClauses.join(',\n'))

  writer.decreaseIndent()
  writer.writeLine('}')
  writer.decreaseIndent()
  writer.writeLine('}')
}

const collectInitialReservedNames = (collector: Collector): Set<string> => {
  const reserved = new Set<string>()
  for (const entity of collector.entities) {
    if (entity.nameForEmit !== undefined && entity.nameForEmit.length > 0) {
      reserved.add(entity.nameForEmit)
    }
    for (const exportName of entity.exportNames) {
      reserved.add(exportName)
    }
  }
  return reserved
}

const generateTypingsFileContent = (
  collector: Collector,
  writer: IndentedWriter,
  dtsKind: DtsRollupKind,
): void => {
  if (collector.workingPackage.tsdocParserContext !== undefined) {
    writer.trimLeadingSpaces = false
    writer.writeLine(collector.workingPackage.tsdocParserContext.sourceRange.toString())
    writer.trimLeadingSpaces = true
    writer.ensureSkippedLine()
  }

  for (const typeDirective of collector.dtsTypeReferenceDirectives) {
    writer.writeLine(`/// <reference types="${typeDirective}" />`)
  }
  for (const libDirective of collector.dtsLibReferenceDirectives) {
    writer.writeLine(`/// <reference lib="${libDirective}" />`)
  }
  writer.ensureSkippedLine()

  for (const entity of collector.entities) {
    if (entity.astEntity instanceof AstImport) {
      DtsEmitHelpers.emitImport(writer, entity, entity.astEntity)
    }
  }
  writer.ensureSkippedLine()

  const reservedNames = collectInitialReservedNames(collector)

  for (const entity of collector.entities) {
    const astEntity = entity.astEntity
    const symbolMetadata = collector.tryFetchMetadataForAstEntity(astEntity)
    const maxReleaseTag = symbolMetadata?.maxEffectiveReleaseTag ?? ReleaseTag.None

    if (!shouldIncludeReleaseTag(maxReleaseTag, dtsKind)) {
      if (collector.extractorConfig.dtsRollup.omitTrimmingComments !== true) {
        writer.ensureSkippedLine()
        writer.writeLine(`/* Excluded from this release type: ${entity.nameForEmit} */`)
      }
      continue
    }

    if (astEntity instanceof AstSymbol) {
      for (const astDeclaration of astEntity.astDeclarations) {
        const apiItemMetadata: ApiItemMetadata = collector.fetchApiItemMetadata(astDeclaration)
        if (!shouldIncludeReleaseTag(apiItemMetadata.effectiveReleaseTag, dtsKind)) {
          if (collector.extractorConfig.dtsRollup.omitTrimmingComments !== true) {
            writer.ensureSkippedLine()
            writer.writeLine(`/* Excluded declaration from this release type: ${entity.nameForEmit} */`)
          }
          continue
        }

        const span = new Span(astDeclaration.declaration)
        modifySpan(collector, span, entity, astDeclaration, dtsKind)
        writer.ensureSkippedLine()
        span.writeModifiedText(writer)
        writer.ensureNewLine()
      }
    }

    if (astEntity instanceof AstNamespaceImport) {
      emitNamespaceBlock(writer, collector, entity, astEntity, reservedNames, dtsKind)
    }

    if (!entity.shouldInlineExport) {
      for (const exportName of entity.exportNames) {
        DtsEmitHelpers.emitNamedExport(writer, exportName, entity)
      }
    }

    writer.ensureSkippedLine()
  }

  DtsEmitHelpers.emitStarExports(writer, collector)

  writer.ensureSkippedLine()
  writer.writeLine('export { }')
}

export class DtsRollupGenerator extends Pipeable.Class {
  public static generateTypingsFileContent(
    collector: Collector,
    dtsKind: DtsRollupKind,
  ): string {
    const writer = new IndentedWriter()
    writer.trimLeadingSpaces = true
    generateTypingsFileContent(collector, writer, dtsKind)
    return writer.getText()
  }
}
