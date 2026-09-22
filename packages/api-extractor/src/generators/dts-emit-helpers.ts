import * as Pipeable from 'effect/Pipeable'
import * as ts from 'typescript'

import { AstDeclaration } from '../analyzer/AstDeclaration.js'
import { AstImport, AstImportKind } from '../analyzer/AstImport.js'
import type { IndentedWriter } from '../analyzer/indented-writer.js'
import { SourceFileLocationFormatter } from '../analyzer/SourceFileLocationFormatter.js'
import type { Span } from '../analyzer/Span.js'
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers.js'
import type { Collector } from '../collector/Collector.js'
import type { CollectorEntity } from '../collector/CollectorEntity.js'
import { ExtractorMessageId } from '../collector/extractor-message-id.js'
import { invariant } from '../utils/invariant.js'

type ImportEmitter = (
  writer: IndentedWriter,
  entity: CollectorEntity,
  astImport: AstImport,
  prefix: string,
) => void

const emitDefaultImport: ImportEmitter = (writer, entity, astImport, prefix) => {
  const name = entity.nameForEmit ?? ''
  const spec = name !== astImport.exportName ? `{ default as ${name} }` : astImport.exportName
  writer.writeLine(`${prefix} ${spec} from '${astImport.modulePath}';`)
}

const emitNamedImport: ImportEmitter = (writer, entity, astImport, prefix) => {
  const name = entity.nameForEmit ?? ''
  const spec = name === astImport.exportName ? astImport.exportName : `${astImport.exportName} as ${name}`
  writer.writeLine(`${prefix} { ${spec} } from '${astImport.modulePath}';`)
}

const emitStarImport: ImportEmitter = (writer, entity, astImport, prefix) => {
  writer.writeLine(`${prefix} * as ${entity.nameForEmit ?? ''} from '${astImport.modulePath}';`)
}

const emitEqualsImport: ImportEmitter = (writer, entity, astImport, prefix) => {
  writer.writeLine(`${prefix} ${entity.nameForEmit ?? ''} = require('${astImport.modulePath}');`)
}

const formatTopExport = (name: string, topExportName: string): string =>
  name === topExportName ? topExportName : `${topExportName} as ${name}`

const emitImportType: ImportEmitter = (writer, entity, astImport, prefix) => {
  if (astImport.exportName.length === 0) {
    writer.writeLine(`${prefix} * as ${entity.nameForEmit ?? ''} from '${astImport.modulePath}';`)
    return
  }
  const topExportName = astImport.exportName.split('.')[0] ?? ''
  const name = entity.nameForEmit ?? ''
  const spec = formatTopExport(name, topExportName)
  writer.writeLine(`${prefix} { ${spec} } from '${astImport.modulePath}';`)
}

const importEmitters: Readonly<Record<AstImportKind, ImportEmitter>> = {
  [AstImportKind.DefaultImport]: emitDefaultImport,
  [AstImportKind.NamedImport]: emitNamedImport,
  [AstImportKind.StarImport]: emitStarImport,
  [AstImportKind.EqualsImport]: emitEqualsImport,
  [AstImportKind.ImportType]: emitImportType,
}

const formatNamedExport = (exportName: string, name: string): string => {
  if (exportName === ts.InternalSymbolName.Default) {
    return `export default ${name};`
  }
  return name !== exportName
    ? `export { ${name} as ${exportName} }`
    : `export { ${exportName} }`
}

const extractTypeArgumentSpans = (span: Span, node: ts.ImportTypeNode): Span[] => {
  const lessThan = span.children.findIndex((c) => c.node.kind === ts.SyntaxKind.LessThanToken)
  const greaterThan = span.children.findIndex((c) => c.node.kind === ts.SyntaxKind.GreaterThanToken)
  if (lessThan < 0 || greaterThan <= lessThan) {
    throw invariant(
      `Invalid type arguments: ${node.getText()}\n${SourceFileLocationFormatter.formatDeclaration(node)}`,
    )
  }
  return span.children.slice(lessThan + 1, greaterThan)
}

const formatTypeArgumentsText = (
  collector: Collector,
  span: Span,
  astDeclaration: AstDeclaration,
  node: ts.ImportTypeNode,
  modifyNestedSpan: (childSpan: Span, childAstDeclaration: AstDeclaration) => void,
): string => {
  if (node.typeArguments === undefined || node.typeArguments.length === 0) {
    return ''
  }
  const typeArgumentsSpans = extractTypeArgumentSpans(span, node)
  for (const childSpan of typeArgumentsSpans) {
    const childDecl = AstDeclaration.isSupportedSyntaxKind(childSpan.kind)
      ? collector.astSymbolTable.getChildAstDeclarationByNode(childSpan.node, astDeclaration)
      : astDeclaration
    modifyNestedSpan(childSpan, childDecl)
  }
  const formatted = typeArgumentsSpans.map((childSpan) => childSpan.getModifiedText())
  return `<${formatted.join(', ')}>`
}

const resolveNestedQualifiersText = (node: ts.ImportTypeNode): string => {
  const qualifiersText = node.qualifier?.getText() ?? ''
  const dotIndex = qualifiersText.indexOf('.')
  return dotIndex >= 0 ? qualifiersText.substring(dotIndex) : ''
}

const buildImportTypeReplacement = (
  entity: CollectorEntity,
  node: ts.ImportTypeNode,
  typeArgsText: string,
  separatorAfter: string,
): string => {
  const name = entity.nameForEmit ?? ''
  const isNestedImportType = entity.astEntity instanceof AstImport &&
    entity.astEntity.importKind === AstImportKind.ImportType &&
    entity.astEntity.exportName.length > 0
  const nestedQualifiers = isNestedImportType ? resolveNestedQualifiersText(node) : ''
  return `${name}${nestedQualifiers}${typeArgsText}${separatorAfter}`
}

const handleResolvedImportType = (
  collector: Collector,
  span: Span,
  astDeclaration: AstDeclaration,
  node: ts.ImportTypeNode,
  referencedEntity: CollectorEntity,
  modifyNestedSpan: (childSpan: Span, childAstDeclaration: AstDeclaration) => void,
): void => {
  if (referencedEntity.nameForEmit === undefined || referencedEntity.nameForEmit.length === 0) {
    throw invariant('referencedEntry.nameForEmit is undefined')
  }
  const typeArgsText = formatTypeArgumentsText(collector, span, astDeclaration, node, modifyNestedSpan)
  const separatorMatch = /(\s*)$/.exec(span.getText())
  const separatorAfter = separatorMatch?.[1] ?? ''
  const replacement = buildImportTypeReplacement(referencedEntity, node, typeArgsText, separatorAfter)
  span.modification.skipAll()
  span.modification.prefix = replacement
}

const handleUnresolvedImportType = (
  collector: Collector,
  astDeclaration: AstDeclaration,
  node: ts.ImportTypeNode,
): void => {
  if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
    return
  }
  const modulePath = node.argument.literal.text
  if (modulePath.startsWith('.')) {
    collector.addAnalyzerIssue(
      ExtractorMessageId.UnresolvedImportPath,
      `The inline import path "${modulePath}" could not be resolved, so it would be emitted unchanged` +
        ` into the .d.ts rollup, where it does not resolve to anything. Import the symbol at the top` +
        ` of the file instead of using an inline import() type.`,
      astDeclaration,
    )
  }
}

const findFirstBindingPatternIndex = (
  nodes: ArrayLike<ts.Node>,
  action: (parameter: ts.ParameterDeclaration, syntheticName: string | undefined) => void,
): number => {
  for (let i = 0; i < nodes.length; ++i) {
    const parameter = nodes[i]
    if (parameter === undefined || !ts.isParameter(parameter)) {
      continue
    }
    action(parameter, undefined)
    if (ts.isObjectBindingPattern(parameter.name) || ts.isArrayBindingPattern(parameter.name)) {
      return i
    }
  }
  return nodes.length
}

const collectAlreadyUsedParamNames = (nodes: ArrayLike<ts.Node>): string[] => {
  const names: string[] = []
  for (let i = 0; i < nodes.length; ++i) {
    const parameter = nodes[i]
    if (parameter === undefined || !ts.isParameter(parameter)) {
      continue
    }
    if (!ts.isObjectBindingPattern(parameter.name) && !ts.isArrayBindingPattern(parameter.name)) {
      names.push(parameter.name.text.trim())
    }
  }
  return names
}

const nextSyntheticName = (alreadyUsed: readonly string[]): string => {
  const baseName = 'input'
  let counter = 2
  let name = baseName
  while (alreadyUsed.includes(name)) {
    name = `${baseName}${counter}`
    counter += 1
  }
  return name
}

const normalizeRestParameters = (
  nodes: ArrayLike<ts.Node>,
  startIndex: number,
  alreadyUsedNames: string[],
  action: (parameter: ts.ParameterDeclaration, syntheticName: string | undefined) => void,
): void => {
  for (let i = startIndex; i < nodes.length; ++i) {
    const parameter = nodes[i]
    if (parameter === undefined || !ts.isParameter(parameter)) {
      continue
    }
    if (ts.isObjectBindingPattern(parameter.name) || ts.isArrayBindingPattern(parameter.name)) {
      const syntheticName = nextSyntheticName(alreadyUsedNames)
      alreadyUsedNames.push(syntheticName)
      action(parameter, syntheticName)
    } else {
      action(parameter, undefined)
    }
  }
}

const applySyntheticNames = (signatureSpan: Span, syntheticNames: ReadonlyMap<ts.Node, string>): void => {
  signatureSpan.forEach((childSpan) => {
    const syntheticName = syntheticNames.get(childSpan.node)
    if (syntheticName !== undefined) {
      childSpan.modification.prefix = syntheticName
    }
  })
}

/*
 * Some common code shared between DtsRollupGenerator and ApiReportGenerator.
 */
export class DtsEmitHelpers extends Pipeable.Class {
  public static emitImport(
    writer: IndentedWriter,
    collectorEntity: CollectorEntity,
    astImport: AstImport,
  ): void {
    const importPrefix = astImport.isTypeOnlyEverywhere ? 'import type' : 'import'
    const emitter = importEmitters[astImport.importKind]
    emitter(writer, collectorEntity, astImport, importPrefix)
  }

  public static emitNamedExport(
    writer: IndentedWriter,
    exportName: string,
    collectorEntity: CollectorEntity,
  ): void {
    writer.writeLine(formatNamedExport(exportName, collectorEntity.nameForEmit ?? ''))
  }

  public static emitStarExports(writer: IndentedWriter, collector: Collector): void {
    if (collector.starExportedExternalModulePaths.length === 0) {
      return
    }
    writer.writeLine()
    for (const starExportedExternalModulePath of collector.starExportedExternalModulePaths) {
      writer.writeLine(`export * from "${starExportedExternalModulePath}";`)
    }
  }

  public static modifyImportTypeSpan(
    collector: Collector,
    span: Span,
    astDeclaration: AstDeclaration,
    modifyNestedSpan: (childSpan: Span, childAstDeclaration: AstDeclaration) => void,
  ): void {
    if (!ts.isImportTypeNode(span.node)) {
      return
    }
    const referencedEntity = collector.tryGetEntityForNode(span.node)
    if (referencedEntity !== undefined) {
      handleResolvedImportType(collector, span, astDeclaration, span.node, referencedEntity, modifyNestedSpan)
    } else {
      handleUnresolvedImportType(collector, astDeclaration, span.node)
    }
  }

  public static isExportKeywordInNamespaceExportDeclaration(node: ts.Node): boolean {
    if (!ts.isExportDeclaration(node.parent)) {
      return false
    }
    const moduleBlock = TypeScriptHelpers.findFirstParent<ts.ModuleBlock>(
      node,
      ts.SyntaxKind.ModuleBlock,
    )
    return moduleBlock !== undefined
  }

  public static forEachParameterToNormalize(
    nodes: ArrayLike<ts.Node>,
    action: (parameter: ts.ParameterDeclaration, syntheticName: string | undefined) => void,
  ): void {
    const firstBinding = findFirstBindingPatternIndex(nodes, action)
    if (firstBinding === nodes.length) {
      return
    }
    const alreadyUsedNames = collectAlreadyUsedParamNames(nodes)
    normalizeRestParameters(nodes, firstBinding, alreadyUsedNames, action)
  }

  public static normalizeParameterNames(signatureSpan: Span): void {
    const syntheticNamesByNode = new Map<ts.Node, string>()
    DtsEmitHelpers.forEachParameterToNormalize(
      signatureSpan.node.getChildren(),
      (parameter, syntheticName) => {
        if (syntheticName !== undefined) {
          syntheticNamesByNode.set(parameter.name, syntheticName)
        }
      },
    )
    if (syntheticNamesByNode.size > 0) {
      applySyntheticNames(signatureSpan, syntheticNamesByNode)
    }
  }
}
