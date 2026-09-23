import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'

import { IndentedWriter } from '../analyzer/indented-writer.js'
import * as SourceFileLocationFormatter from '../analyzer/SourceFileLocationFormatter.js'
import { IndentDocCommentScope, Span, type SpanModification } from '../analyzer/Span.js'
import * as SyntaxHelpers from '../analyzer/SyntaxHelpers.js'
import * as TypeScriptHelpers from '../analyzer/TypeScriptHelpers.js'
import * as Snapshot from '../collector/analysis-snapshot.js'
import type { ApiItemMetadata } from '../collector/ApiItemMetadata.js'
import type { CollectorEntity } from '../collector/CollectorEntity.js'
import type { DeclarationMetadata } from '../collector/DeclarationMetadata.js'
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

const requireSome = <A>(option: Option.Option<A>, message: string): A => {
  if (Option.isNone(option)) {
    throw invariant(message)
  }
  return option.value
}

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

const classifyNamespaceMember = (
  snapshot: Snapshot.AnalysisSnapshot,
  astEntity: Snapshot.AstEntity,
): NamespaceMemberKind =>
  Match.value(Snapshot.refOf(astEntity)).pipe(
    Match.tag('AstNamespaceImportRef', (): NamespaceMemberKind => 'namespace'),
    Match.tag('AstImportRef', (): NamespaceMemberKind => {
      const astImport = requireSome(Snapshot.astImportOf(astEntity), 'Missing AstImport for an AstImportRef')
      if (
        astImport.importKind === Snapshot.AstImportKind.StarImport ||
        astImport.importKind === Snapshot.AstImportKind.EqualsImport ||
        astImport.importKind === Snapshot.AstImportKind.ImportType
      ) {
        return 'namespace'
      }
      return astImport.isTypeOnlyEverywhere ? 'type' : 'value'
    }),
    Match.tag('AstSymbolRef', (): NamespaceMemberKind => {
      const flags = Snapshot.symbolFlags(
        snapshot,
        requireSome(Snapshot.astSymbolOf(astEntity), 'Missing AstSymbol for an AstSymbolRef'),
      )
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
    }),
    Match.tag('AstNamespaceExportRef', (): NamespaceMemberKind => 'value'),
    Match.exhaustive,
  )

const isKeywordNeedingModifiers = (kind: ts.SyntaxKind): boolean =>
  kind === ts.SyntaxKind.InterfaceKeyword ||
  kind === ts.SyntaxKind.ClassKeyword ||
  kind === ts.SyntaxKind.EnumKeyword ||
  kind === ts.SyntaxKind.NamespaceKeyword ||
  kind === ts.SyntaxKind.ModuleKeyword ||
  kind === ts.SyntaxKind.TypeKeyword ||
  kind === ts.SyntaxKind.FunctionKeyword

const handleKeywordModifiers = (
  span: Span,
  entity: CollectorEntity,
  snapshot: Snapshot.AnalysisSnapshot,
  astDeclaration: Snapshot.AstDeclaration,
): void => {
  let replacedModifiers: string = ''
  if (Option.isNone(Snapshot.parentAstDeclaration(snapshot, astDeclaration))) {
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
  snapshot: Snapshot.AnalysisSnapshot,
  span: Span,
  entity: CollectorEntity,
  astDeclaration: Snapshot.AstDeclaration,
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

  const declarationMetadata: DeclarationMetadata = Snapshot.fetchDeclarationMetadata(snapshot, astDeclaration)
  if (declarationMetadata.tsdocParserContext !== undefined) {
    let originalComment: string = declarationMetadata.tsdocParserContext.sourceRange.toString()
    if (!/\r?\n\s*$/.test(originalComment)) {
      originalComment += '\n'
    }
    span.modification.indentDocComment = IndentDocCommentScope.PrefixOnly
    span.modification.prefix = originalComment + span.modification.prefix
  }
}

const handleIdentifier = (snapshot: Snapshot.AnalysisSnapshot, span: Span): void => {
  if (!ts.isIdentifier(span.node)) {
    return
  }
  Option.match(Snapshot.tryGetEntityForNode(snapshot, span.node), {
    onNone: () => undefined,
    onSome: (referencedEntity) => {
      if (referencedEntity.nameForEmit === undefined || referencedEntity.nameForEmit.length === 0) {
        throw invariant('referencedEntry.nameForEmit is undefined')
      }
      span.modification.prefix = referencedEntity.nameForEmit
    },
  })
}

const trimChildSpan = (
  snapshot: Snapshot.AnalysisSnapshot,
  child: Span,
  childAstDeclaration: Snapshot.AstDeclaration,
  dtsKind: DtsRollupKind,
): boolean => {
  const releaseTag = Snapshot.fetchApiItemMetadata(snapshot, childAstDeclaration).effectiveReleaseTag
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
  const name: string = Snapshot.localName(snapshot, childAstDeclaration)
  modification.omitChildren = true

  if (Snapshot.extractorConfig(snapshot).dtsRollup.omitTrimmingComments !== true) {
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
  snapshot: Snapshot.AnalysisSnapshot,
  span: Span,
  entity: CollectorEntity,
  astDeclaration: Snapshot.AstDeclaration,
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
    handleKeywordModifiers(span, entity, snapshot, astDeclaration)
  } else if (span.kind === ts.SyntaxKind.VariableDeclaration) {
    handleVariableDeclaration(snapshot, span, entity, astDeclaration)
  } else if (span.kind === ts.SyntaxKind.Identifier) {
    handleIdentifier(snapshot, span)
  } else if (span.kind === ts.SyntaxKind.ImportType) {
    DtsEmitHelpers.modifyImportTypeSpan(
      snapshot,
      span,
      astDeclaration,
      (childSpan, childAstDeclaration) => {
        modifySpan(snapshot, childSpan, entity, childAstDeclaration, dtsKind)
      },
    )
  }

  if (!recurseChildren) {
    return
  }

  for (const child of span.children) {
    let childAstDeclaration: Snapshot.AstDeclaration = astDeclaration
    let trimmed = false
    if (Snapshot.isSupportedDeclarationKind(child.kind)) {
      childAstDeclaration = Snapshot.childDeclarationByNode(snapshot, child.node, astDeclaration)
      trimmed = trimChildSpan(snapshot, child, childAstDeclaration, dtsKind)
    }

    if (!trimmed) {
      modifySpan(snapshot, child, entity, childAstDeclaration, dtsKind)
    }
  }
}

const emitNamespaceBlock = (
  writer: IndentedWriter,
  snapshot: Snapshot.AnalysisSnapshot,
  entity: CollectorEntity,
  astEntity: Snapshot.AstNamespaceImport,
  reservedNames: Set<string>,
  dtsKind: DtsRollupKind,
): void => {
  const astModuleExportInfo = Snapshot.fetchAstModuleExportInfo(snapshot, astEntity)
  const namespaceName = entity.nameForEmit

  if (namespaceName === undefined || namespaceName.length === 0) {
    throw invariant('referencedEntry.nameForEmit is undefined')
  }

  if (astModuleExportInfo.starExportedExternalModules.size > 0) {
    throw new UnsupportedStarExportError({
      namespaceName,
      moduleSpecifier: SourceFileLocationFormatter.formatDeclaration(Snapshot.declaration(snapshot, astEntity)),
    })
  }

  const members: NamespaceMember[] = []
  for (const [exportedName, exportedEntity] of astModuleExportInfo.exportedLocalEntities) {
    const memberEntity = requireSome(
      Snapshot.tryGetCollectorEntity(snapshot, exportedEntity),
      `Cannot find collector entity for ${namespaceName}.${Snapshot.localName(snapshot, exportedEntity)}`,
    )

    const exportedMaxReleaseTag = Option.match(Snapshot.tryFetchMetadataForAstEntity(snapshot, exportedEntity), {
      onNone: () => ReleaseTag.None,
      onSome: (exportedMetadata) => exportedMetadata.maxEffectiveReleaseTag,
    })
    if (!shouldIncludeReleaseTag(exportedMaxReleaseTag, dtsKind)) {
      continue
    }

    const targetName = memberEntity.nameForEmit
    if (targetName === undefined || targetName.length === 0) {
      throw invariant(`referencedEntry.nameForEmit is undefined for ${Snapshot.localName(snapshot, exportedEntity)}`)
    }

    members.push({
      memberName: exportedName,
      targetName,
      kind: classifyNamespaceMember(snapshot, exportedEntity),
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

const collectInitialReservedNames = (snapshot: Snapshot.AnalysisSnapshot): Set<string> => {
  const reserved = new Set<string>()
  for (const entity of Snapshot.entities(snapshot)) {
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
  snapshot: Snapshot.AnalysisSnapshot,
  writer: IndentedWriter,
  dtsKind: DtsRollupKind,
): void => {
  const workingPackage = Snapshot.workingPackage(snapshot)
  if (workingPackage.tsdocParserContext !== undefined) {
    writer.trimLeadingSpaces = false
    writer.writeLine(workingPackage.tsdocParserContext.sourceRange.toString())
    writer.trimLeadingSpaces = true
    writer.ensureSkippedLine()
  }

  for (const typeDirective of Snapshot.dtsTypeReferenceDirectives(snapshot)) {
    writer.writeLine(`/// <reference types="${typeDirective}" />`)
  }
  for (const libDirective of Snapshot.dtsLibReferenceDirectives(snapshot)) {
    writer.writeLine(`/// <reference lib="${libDirective}" />`)
  }
  writer.ensureSkippedLine()

  for (const entity of Snapshot.entities(snapshot)) {
    const astEntity = Snapshot.astEntityOf(entity)
    Match.value(Snapshot.refOf(astEntity)).pipe(
      Match.tag('AstImportRef', () =>
        DtsEmitHelpers.emitImport(
          writer,
          entity,
          requireSome(Snapshot.astImportOf(astEntity), 'Missing AstImport for an AstImportRef'),
        )),
      Match.orElse(() => undefined),
    )
  }
  writer.ensureSkippedLine()

  const reservedNames = collectInitialReservedNames(snapshot)

  for (const entity of Snapshot.entities(snapshot)) {
    const astEntity = Snapshot.astEntityOf(entity)
    const maxReleaseTag = Option.match(Snapshot.tryFetchMetadataForAstEntity(snapshot, astEntity), {
      onNone: () => ReleaseTag.None,
      onSome: (symbolMetadata) => symbolMetadata.maxEffectiveReleaseTag,
    })

    if (!shouldIncludeReleaseTag(maxReleaseTag, dtsKind)) {
      if (Snapshot.extractorConfig(snapshot).dtsRollup.omitTrimmingComments !== true) {
        writer.ensureSkippedLine()
        writer.writeLine(`/* Excluded from this release type: ${entity.nameForEmit} */`)
      }
      continue
    }

    Match.value(Snapshot.refOf(astEntity)).pipe(
      Match.tag('AstSymbolRef', () => {
        const astSymbol = requireSome(Snapshot.astSymbolOf(astEntity), 'Missing AstSymbol for an AstSymbolRef')
        for (const astDeclaration of Snapshot.astDeclarations(snapshot, astSymbol)) {
          const apiItemMetadata: ApiItemMetadata = Snapshot.fetchApiItemMetadata(snapshot, astDeclaration)
          if (!shouldIncludeReleaseTag(apiItemMetadata.effectiveReleaseTag, dtsKind)) {
            if (Snapshot.extractorConfig(snapshot).dtsRollup.omitTrimmingComments !== true) {
              writer.ensureSkippedLine()
              writer.writeLine(`/* Excluded declaration from this release type: ${entity.nameForEmit} */`)
            }
            continue
          }

          const span = new Span(Snapshot.declaration(snapshot, astDeclaration))
          modifySpan(snapshot, span, entity, astDeclaration, dtsKind)
          writer.ensureSkippedLine()
          span.writeModifiedText(writer)
          writer.ensureNewLine()
        }
      }),
      Match.tag('AstNamespaceImportRef', () => {
        emitNamespaceBlock(
          writer,
          snapshot,
          entity,
          requireSome(
            Snapshot.astNamespaceImportOf(astEntity),
            'Missing AstNamespaceImport for an AstNamespaceImportRef',
          ),
          reservedNames,
          dtsKind,
        )
      }),
      Match.orElse(() => undefined),
    )

    if (!entity.shouldInlineExport) {
      for (const exportName of entity.exportNames) {
        DtsEmitHelpers.emitNamedExport(writer, exportName, entity)
      }
    }

    writer.ensureSkippedLine()
  }

  DtsEmitHelpers.emitStarExports(writer, snapshot)

  writer.ensureSkippedLine()
  writer.writeLine('export { }')
}

export class DtsRollupGenerator extends Pipeable.Class {
  public static generateTypingsFileContent(
    snapshot: Snapshot.AnalysisSnapshot,
    dtsKind: DtsRollupKind,
  ): string {
    const writer = new IndentedWriter()
    writer.trimLeadingSpaces = true
    generateTypingsFileContent(snapshot, writer, dtsKind)
    return writer.getText()
  }
}
