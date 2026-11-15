import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { findWorkspaceDirSync } from '@pnpm/workspace.root-finder'
import { isImportMetaVitestTest, isInsideConsequent } from '@systemfsoftware/oxlint-import-origin'
import { isPackageOfEnclosingWorkspace, packageNameOf } from '@systemfsoftware/oxlint-import-origin/workspace'
import { dirname, relative, sep } from 'node:path'
import {
  DECISION_FILE_SUFFIXES,
  DECISION_MODULE_SUFFIXES,
  DISABLE_DIRECTIVE_ACTUAL,
  DISABLE_DIRECTIVE_FIX,
  DYNAMIC_IMPORT_ACTUAL,
  DYNAMIC_IMPORT_FIX,
  EXPECTED,
  FOREIGN_SOURCE_ACTUAL,
  FOREIGN_SOURCE_FIX,
  MANIFEST_UNREADABLE_ACTUAL,
  MANIFEST_UNREADABLE_FIX,
  meta,
  OPEN_PACKAGES,
  PLAIN_MODULE_ACTUAL,
  PLAIN_MODULE_FIX,
  RE_EXPORT_ACTUAL,
  RE_EXPORT_FIX,
  RULE_NAME,
  SCHEMA_MEMBERS,
  STALE_LEGACY_ACTUAL,
  STALE_LEGACY_FIX,
  WORKSPACE_BINDING_ACTUAL,
  WORKSPACE_BINDING_FIX,
} from './decision-code-imports.config.js'
import { type DecisionCodeManifest, readDecisionCodeManifest } from './DecisionCodeManifest.js'
import { isTestFile } from './workflow-match-exhaustive.config.js'

export type MessageIds =
  | 'plainModuleImport'
  | 'foreignSourceImport'
  | 'workspaceBindingUse'
  | 'dynamicImport'
  | 'reExport'
  | 'disableDirective'
  | 'staleLegacyEntry'
  | 'manifestUnreadable'

interface Finding {
  readonly node: ESTree.Node
  readonly messageId: MessageIds
  readonly name: string
  readonly actual: string
  readonly fix: string
}

type SourceKind = 'open' | 'decisionModule' | 'plainModule' | 'workspace' | 'foreign'

type ScopeVariable = ReturnType<Context['sourceCode']['getDeclaredVariables']>[number]

const FILE_START = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const

const DIRECTIVE_PATTERN = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?=\s|$)([\s\S]*)$/

const TYPE_CONTEXT_TYPES: ReadonlySet<string> = new Set([
  'TSTypeReference',
  'TSTypeQuery',
  'TSQualifiedName',
  'TSClassImplements',
  'TSInterfaceHeritage',
  'TSImportType',
  'TSTypeAnnotation',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
])

const EXPRESSION_WRAPPER_TYPES: ReadonlySet<string> = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
])

const isWalkable = (value: unknown): value is Record<string, unknown> & ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const basenameOf = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

const isDecisionFile = (filename: string): boolean =>
  DECISION_FILE_SUFFIXES.some((suffix) => basenameOf(filename).endsWith(suffix)) &&
  /[\\/]src[\\/]/.test(filename) &&
  !isTestFile(filename)

const isRelative = (source: string): boolean => source.startsWith('./') || source.startsWith('../')

const isOpenPackage = (source: string): boolean =>
  OPEN_PACKAGES.some((name) => source === name || source.startsWith(`${name}/`))

const classifySource = (source: string, filename: string, manifest: DecisionCodeManifest): SourceKind => {
  if (isOpenPackage(source)) return 'open'
  if (isRelative(source)) {
    const basename = basenameOf(source)
    return DECISION_MODULE_SUFFIXES.some((suffix) => basename.endsWith(suffix)) ? 'decisionModule' : 'plainModule'
  }
  const packageName = packageNameOf(source)
  if (packageName !== null && manifest.kernels.has(packageName)) return 'open'
  if (isPackageOfEnclosingWorkspace(source, filename)) return 'workspace'
  return 'foreign'
}

const isTypeOnlySpecifier = (specifier: ESTree.Node): boolean =>
  ('importKind' in specifier && specifier.importKind === 'type') ||
  ('exportKind' in specifier && specifier.exportKind === 'type')

const valueSpecifiersOf = (node: ESTree.ImportDeclaration): readonly ESTree.Node[] =>
  node.importKind === 'type' ? [] : node.specifiers.filter((specifier) => !isTypeOnlySpecifier(specifier))

const isTypeOnlyImport = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind === 'type' || (node.specifiers.length > 0 && valueSpecifiersOf(node).length === 0)

const memberNameOf = (node: ESTree.MemberExpression): string | null => {
  const property = node.property
  if (!node.computed && property.type === 'Identifier') return property.name
  return property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
}

const isInTypePosition = (identifier: ESTree.Node): boolean => {
  let current: ESTree.Node | null = identifier.parent
  while (current !== null) {
    if (TYPE_CONTEXT_TYPES.has(current.type)) return true
    current = current.parent
  }
  return false
}

const directiveSilencingRule = (comment: { readonly value: string }): string | null => {
  const match = DIRECTIVE_PATTERN.exec(comment.value)
  if (match === null) return null
  const ruleList = (match[1] ?? '').split('--')[0] ?? ''
  const rules = ruleList.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '')
  const silences = rules.length === 0 || rules.some((rule) => rule === RULE_NAME || rule.endsWith(`/${RULE_NAME}`))
  return silences ? comment.value.trim() : null
}

const repoRelativePath = (root: string | undefined, filename: string): string | null =>
  root === undefined ? null : relative(root, filename).split(sep).join('/')

interface SchemaPositions {
  readonly isSchemaCallee: (callee: ESTree.Node) => boolean
  readonly recordReadsOf: (declarator: ESTree.VariableDeclarator) => readonly ESTree.Node[]
}

const MAX_RECORD_DEPTH = 4

const isSchemaUse = (identifier: ESTree.Node, isNamespace: boolean, positions: SchemaPositions): boolean => {
  const firstSchemaMemberIndex = isNamespace ? 1 : 0
  let end: ESTree.Node = identifier
  let depth = 0
  for (;;) {
    const parent = end.parent
    if (parent === null || parent.type !== 'MemberExpression' || parent.object !== end) break
    const member = memberNameOf(parent)
    if (member === null) return false
    if (depth >= firstSchemaMemberIndex && SCHEMA_MEMBERS.has(member)) return true
    end = parent
    depth += 1
  }
  return depth >= firstSchemaMemberIndex && isSchemaArgument(end, positions, 0)
}

const isConstRecordDeclarator = (node: ESTree.Node): node is ESTree.VariableDeclarator =>
  node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.parent !== null &&
  node.parent.type === 'VariableDeclaration' && node.parent.kind === 'const'

const isSchemaArgument = (expression: ESTree.Node, positions: SchemaPositions, recordDepth: number): boolean => {
  let current = expression
  let insideContainer = false
  for (;;) {
    const parent = current.parent
    if (parent === null) return false
    if (EXPRESSION_WRAPPER_TYPES.has(parent.type) && 'expression' in parent && parent.expression === current) {
      current = parent
      continue
    }
    if (parent.type === 'ArrayExpression' || parent.type === 'ObjectExpression' || parent.type === 'SpreadElement') {
      insideContainer = insideContainer || parent.type !== 'SpreadElement'
      current = parent
      continue
    }
    if (parent.type === 'Property') {
      if (parent.value !== current) return false
      current = parent
      continue
    }
    if (parent.type === 'CallExpression') {
      return parent.callee !== current && parent.arguments.some((argument) => argument === current) &&
        positions.isSchemaCallee(parent.callee)
    }
    if (insideContainer && isConstRecordDeclarator(parent) && parent.init === current) {
      if (recordDepth >= MAX_RECORD_DEPTH) return false
      return positions.recordReadsOf(parent).every((read) =>
        isInTypePosition(read) || isSchemaArgument(read, positions, recordDepth + 1)
      )
    }
    return false
  }
}

const calleeRootOf = (callee: ESTree.Node): ESTree.Node => {
  let current = callee
  for (;;) {
    if (current.type === 'MemberExpression') current = current.object
    else if (current.type === 'CallExpression') current = current.callee
    else if (current.type === 'TSInstantiationExpression') current = current.expression
    else return current
  }
}

const isEffectSchemaImport = (declaration: ESTree.ImportDeclaration, specifier: ESTree.Node): boolean => {
  const source = declaration.source.value
  if (source === 'effect/Schema') return true
  if (source !== 'effect' || specifier.type !== 'ImportSpecifier') return false
  return specifier.imported.type === 'Identifier' && specifier.imported.name === 'Schema'
}

export const decisionCodeImports = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isDecisionFile(filename)) return {}

    const root = findWorkspaceDirSync(dirname(filename))
    const read = readDecisionCodeManifest(root)
    const relativePath = repoRelativePath(root, filename)

    const report = (finding: Finding): void => {
      context.report({
        node: finding.node,
        messageId: finding.messageId,
        data: { name: finding.name, expected: EXPECTED, actual: finding.actual, fix: finding.fix },
      })
    }

    const reportAtFileStart = (messageId: MessageIds, name: string, actual: string, fix: string): void => {
      context.report({ loc: FILE_START, messageId, data: { name, expected: EXPECTED, actual, fix } })
    }

    return {
      Program(program: ESTree.Program) {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive = directiveSilencingRule(comment)
          if (directive === null) continue
          reportAtFileStart(
            'disableDirective',
            'an inline disable directive',
            DISABLE_DIRECTIVE_ACTUAL.replace('{{directive}}', directive),
            DISABLE_DIRECTIVE_FIX,
          )
        }

        if (read.kind === 'unreadable') {
          reportAtFileStart(
            'manifestUnreadable',
            'an unreadable decision-code.json',
            MANIFEST_UNREADABLE_ACTUAL.replace('{{path}}', read.path).replace('{{reason}}', read.reason),
            MANIFEST_UNREADABLE_FIX,
          )
          return
        }
        const manifest = read.manifest
        const findings: Finding[] = []

        const guardConsequents: ESTree.Node[] = []
        const insideVitestGuard = (node: ESTree.Node): boolean =>
          guardConsequents.some((consequent) => isInsideConsequent(node, consequent))

        const schemaCalleeRoots = new Set<ESTree.Node>()
        const workspaceBindings: Array<{
          readonly variable: ScopeVariable
          readonly isNamespace: boolean
          readonly source: string
        }> = []

        for (const statement of program.body) {
          if (statement.type === 'ImportDeclaration') {
            if (isTypeOnlyImport(statement)) continue
            const source = statement.source.value
            for (const specifier of valueSpecifiersOf(statement)) {
              if (!isEffectSchemaImport(statement, specifier)) continue
              for (const variable of context.sourceCode.getDeclaredVariables(specifier)) {
                for (const reference of variable.references) schemaCalleeRoots.add(reference.identifier)
              }
            }
            const kind = classifySource(source, filename, manifest)
            if (kind === 'plainModule') {
              findings.push({
                node: statement,
                messageId: 'plainModuleImport',
                name: `an import of ${source}`,
                actual: PLAIN_MODULE_ACTUAL.replace('{{source}}', source),
                fix: PLAIN_MODULE_FIX,
              })
            } else if (kind === 'foreign') {
              findings.push({
                node: statement,
                messageId: 'foreignSourceImport',
                name: `an import of ${source}`,
                actual: FOREIGN_SOURCE_ACTUAL.replace('{{source}}', source),
                fix: FOREIGN_SOURCE_FIX,
              })
            } else if (kind === 'workspace') {
              const specifiers = valueSpecifiersOf(statement)
              if (specifiers.length === 0) {
                findings.push({
                  node: statement,
                  messageId: 'foreignSourceImport',
                  name: `a side-effect import of ${source}`,
                  actual: FOREIGN_SOURCE_ACTUAL.replace('{{source}}', source),
                  fix: FOREIGN_SOURCE_FIX,
                })
              }
              for (const specifier of specifiers) {
                for (const variable of context.sourceCode.getDeclaredVariables(specifier)) {
                  workspaceBindings.push({
                    variable,
                    isNamespace: specifier.type === 'ImportNamespaceSpecifier',
                    source,
                  })
                }
              }
            }
          } else if (statement.type === 'ExportAllDeclaration' || statement.type === 'ExportNamedDeclaration') {
            if (statement.source === null || statement.source === undefined) continue
            if (statement.exportKind === 'type') continue
            if (statement.type === 'ExportNamedDeclaration' && statement.specifiers.every(isTypeOnlySpecifier)) continue
            const source = statement.source.value
            findings.push({
              node: statement,
              messageId: 'reExport',
              name: `a re-export from ${source}`,
              actual: RE_EXPORT_ACTUAL.replace('{{source}}', source),
              fix: RE_EXPORT_FIX.replace('{{source}}', source),
            })
          } else if (statement.type === 'TSImportEqualsDeclaration' && statement.importKind !== 'type') {
            if (statement.moduleReference.type !== 'TSExternalModuleReference') continue
            findings.push({
              node: statement,
              messageId: 'dynamicImport',
              name: 'an import = require(...) declaration',
              actual: DYNAMIC_IMPORT_ACTUAL.replace('{{form}}', 'import = require(...)'),
              fix: DYNAMIC_IMPORT_FIX,
            })
          }
        }

        const visitorKeys = context.sourceCode.visitorKeys
        const walk = (value: unknown): void => {
          if (!isWalkable(value)) return
          const node = value
          if (node.type === 'IfStatement' && isImportMetaVitestTest(node.test)) {
            guardConsequents.push(node.consequent)
            walk(node.test)
            walk(node.alternate)
            return
          }
          if (node.type === 'ImportExpression') {
            findings.push({
              node,
              messageId: 'dynamicImport',
              name: 'an import() expression',
              actual: DYNAMIC_IMPORT_ACTUAL.replace('{{form}}', 'import()'),
              fix: DYNAMIC_IMPORT_FIX,
            })
          } else if (
            node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require'
          ) {
            findings.push({
              node,
              messageId: 'dynamicImport',
              name: 'a require() call',
              actual: DYNAMIC_IMPORT_ACTUAL.replace('{{form}}', 'require()'),
              fix: DYNAMIC_IMPORT_FIX,
            })
          }
          for (const key of visitorKeys[node.type] ?? []) {
            const child = value[key]
            if (Array.isArray(child)) {
              for (const entry of child) walk(entry)
            } else {
              walk(child)
            }
          }
        }
        walk(program)

        const positions: SchemaPositions = {
          isSchemaCallee: (callee) => schemaCalleeRoots.has(calleeRootOf(callee)),
          recordReadsOf: (declarator) =>
            context.sourceCode.getDeclaredVariables(declarator).flatMap((variable) =>
              variable.references.filter((reference) => !reference.isWrite()).map((reference) => reference.identifier)
            ),
        }
        for (const { variable, isNamespace, source } of workspaceBindings) {
          for (const reference of variable.references) {
            const identifier = reference.identifier
            if (insideVitestGuard(identifier) || isInTypePosition(identifier)) continue
            if (isSchemaUse(identifier, isNamespace, positions)) continue
            findings.push({
              node: identifier,
              messageId: 'workspaceBindingUse',
              name: `a use of ${variable.name}`,
              actual: WORKSPACE_BINDING_ACTUAL.replace('{{binding}}', variable.name).replace('{{source}}', source),
              fix: WORKSPACE_BINDING_FIX,
            })
          }
        }

        if (relativePath !== null && manifest.legacy.has(relativePath)) {
          if (findings.length > 0) return
          reportAtFileStart(
            'staleLegacyEntry',
            'a stale legacy entry',
            STALE_LEGACY_ACTUAL.replace('{{path}}', relativePath),
            STALE_LEGACY_FIX.replace('{{path}}', relativePath),
          )
          return
        }
        for (const finding of findings) report(finding)
      },
    }
  },
})
