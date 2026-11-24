import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { findWorkspaceDirSync } from '@pnpm/workspace.root-finder'
import { isImportMetaVitestTest, isInsideConsequent } from '@systemfsoftware/oxlint-import-origin'
import { isPackageOfEnclosingWorkspace, packageNameOf } from '@systemfsoftware/oxlint-import-origin/workspace'
import { realpathSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import {
  CELL_TYPES_PACKAGE,
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
  SCHEMA_CHAIN_MEMBERS,
  SCHEMA_MEMBERS,
  SIDE_EFFECT_IMPORT_ACTUAL,
  SIDE_EFFECT_IMPORT_FIX,
  WORKFLOW_SCHEMA_SLOTS,
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
  | 'sideEffectImport'
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

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const packageRootOf = (filename: string): string | null => {
  let directory = dirname(filename)
  for (;;) {
    if (isFile(resolve(directory, 'package.json'))) return directory
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

const sourceFileCandidatesOf = (specifierPath: string): readonly string[] =>
  specifierPath.endsWith('.js') ? [`${specifierPath.slice(0, -'.js'.length)}.ts`, specifierPath] : [specifierPath]

const realPathOf = (path: string): string | null => {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

const resolvesToDecisionFileOfSamePackage = (source: string, filename: string): boolean => {
  const packageRoot = packageRootOf(filename)
  if (packageRoot === null) return false
  const realSourceRoot = realPathOf(resolve(packageRoot, 'src'))
  const candidate = sourceFileCandidatesOf(resolve(dirname(filename), source)).find(isFile)
  const realCandidate = candidate === undefined ? null : realPathOf(candidate)
  return realSourceRoot !== null && realCandidate !== null && realCandidate.startsWith(`${realSourceRoot}${sep}`) &&
    isDecisionFile(realCandidate)
}

const isOpenPackage = (source: string): boolean =>
  OPEN_PACKAGES.some((name) => source === name || source.startsWith(`${name}/`))

const classifySource = (source: string, filename: string, manifest: DecisionCodeManifest): SourceKind => {
  if (isOpenPackage(source)) return 'open'
  if (isRelative(source)) {
    const basename = basenameOf(source)
    const hasDecisionSuffix = DECISION_MODULE_SUFFIXES.some((suffix) => basename.endsWith(suffix))
    return hasDecisionSuffix && resolvesToDecisionFileOfSamePackage(source, filename) ? 'decisionModule' : 'plainModule'
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

interface SchemaPositions {
  readonly combinatorOf: (call: ESTree.CallExpression) => string | null
  readonly recordReadsOf: (declarator: ESTree.VariableDeclarator) => readonly ESTree.Node[]
  /** An `S.*` / `Schema.*` combinator, referenced or called. */
  readonly isSchemaCombinator: (node: ESTree.Node) => boolean
  /** A call of `Workflow.make` from `@systemfsoftware/effect-cell-types`. */
  readonly isWorkflowMake: (call: ESTree.CallExpression) => boolean
}

const MAX_RECORD_DEPTH = 4

type ArgumentRole = 'schema' | 'fields' | 'members' | 'cases' | 'thunk' | null

interface CombinatorArguments {
  readonly direct: readonly ArgumentRole[]
  readonly curried: readonly ArgumentRole[]
}

const SCHEMA: readonly ArgumentRole[] = ['schema']
const NONE: readonly ArgumentRole[] = []

const takes = (direct: readonly ArgumentRole[], curried: readonly ArgumentRole[] = NONE): CombinatorArguments => ({
  direct,
  curried,
})

const SCHEMA_TAKING = [
  'Array',
  'NonEmptyArray',
  'UniqueArray',
  'ArrayEnsure',
  'mutable',
  'optional',
  'optionalKey',
  'required',
  'requiredKey',
  'mutableKey',
  'readonlyKey',
  'toType',
  'toEncoded',
  'flip',
  'NullOr',
  'UndefinedOr',
  'NullishOr',
  'Option',
  'OptionFromNullOr',
  'OptionFromUndefinedOr',
  'OptionFromNullishOr',
  'OptionFromOptional',
  'OptionFromOptionalKey',
  'OptionFromOptionalNullOr',
  'Redacted',
  'RedactedFromValue',
  'Chunk',
  'HashSet',
  'ReadonlySet',
  'Tree',
  'fromJsonString',
  'fromFormData',
  'fromURLSearchParams',
  'is',
  'asserts',
  'decodeEffect',
  'decodeExit',
  'decodeOption',
  'decodePromise',
  'decodeResult',
  'decodeSync',
  'decodeUnknownEffect',
  'decodeUnknownExit',
  'decodeUnknownOption',
  'decodeUnknownPromise',
  'decodeUnknownResult',
  'decodeUnknownSync',
  'encodeEffect',
  'encodeExit',
  'encodeOption',
  'encodePromise',
  'encodeResult',
  'encodeSync',
  'encodeUnknownEffect',
  'encodeUnknownExit',
  'encodeUnknownOption',
  'encodeUnknownPromise',
  'encodeUnknownResult',
  'encodeUnknownSync',
  'isPropertyNames',
  'overrideToCodecIso',
  'resolveAnnotations',
  'resolveAnnotationsKey',
  'revealBottom',
  'revealCodec',
  'toCodecArrayFromSingle',
  'toCodecGoJson',
  'toCodecIso',
  'toCodecJson',
  'toCodecStringTree',
  'toDifferJsonPatch',
  'toEncoderXml',
  'toEquivalence',
  'toFormatter',
  'toIso',
  'toIsoFocus',
  'toIsoSource',
  'toJsonSchemaDocument',
  'toRepresentation',
  'toStandardJSONSchemaV1',
  'toStandardSchemaV1',
] as const

const SELF_TAKING = [
  'annotate',
  'annotateEncoded',
  'annotateKey',
  'brand',
  'catchDecoding',
  'catchDecodingWithContext',
  'catchEncoding',
  'catchEncodingWithContext',
  'check',
  'decode',
  'encode',
  'encodeKeys',
  'link',
  'middlewareDecoding',
  'middlewareEncoding',
  'Opaque',
  'overrideToEquivalence',
  'overrideToFormatter',
  'refine',
  'toTaggedUnion',
  'withConstructorDefault',
  'withDecodingDefault',
  'withDecodingDefaultKey',
  'withDecodingDefaultType',
  'withDecodingDefaultTypeKey',
] as const

const SCHEMA_ARGUMENTS: ReadonlyMap<string, CombinatorArguments> = new Map([
  ...SCHEMA_TAKING.map((name) => [name, takes(SCHEMA)] as const),
  ...SELF_TAKING.map((name) => [name, takes(NONE, SCHEMA)] as const),
  ['decodeTo', takes(SCHEMA, SCHEMA)],
  ['encodeTo', takes(SCHEMA, SCHEMA)],
  ['Record', takes(['schema', 'schema'])],
  ['ReadonlyMap', takes(['schema', 'schema'])],
  ['HashMap', takes(['schema', 'schema'])],
  ['Result', takes(['schema', 'schema'])],
  ['Cause', takes(['schema', 'schema'])],
  ['CauseReason', takes(['schema', 'schema'])],
  ['Exit', takes(['schema', 'schema', 'schema'])],
  ['Graph', takes([null, 'schema', 'schema'])],
  ['suspend', takes(['thunk'])],
  ['TaggedUnion', takes(['cases'])],
  ['Struct', takes(['fields'])],
  ['TaggedStruct', takes([null, 'fields'])],
  ['fieldsAssign', takes(['fields'], SCHEMA)],
  ['extendTo', takes(['fields'], SCHEMA)],
  ['Class', takes(NONE, ['fields'])],
  ['Error', takes(NONE, ['fields'])],
  ['TaggedClass', takes(NONE, [null, 'fields'])],
  ['TaggedError', takes(NONE, [null, 'fields'])],
  ['Union', takes(['members'])],
  ['Tuple', takes(['members'])],
  ['TemplateLiteral', takes(['members'])],
  ['TemplateLiteralParser', takes(['members'])],
  ['TupleWithRest', takes(['schema', 'members'])],
  ['StructWithRest', takes(['schema', 'members'])],
  ['declareConstructor', takes(NONE, ['members'])],
])

const stripInstantiation = (node: ESTree.Node): ESTree.Node =>
  node.type === 'TSInstantiationExpression' ? node.expression : node

const isCurriedCall = (call: ESTree.CallExpression): boolean =>
  stripInstantiation(call.callee).type === 'CallExpression'

const argumentRoleOf = (call: ESTree.CallExpression, index: number, positions: SchemaPositions): ArgumentRole => {
  const combinator = positions.combinatorOf(call)
  const entry = combinator === null ? undefined : SCHEMA_ARGUMENTS.get(combinator)
  if (entry === undefined || index < 0) return null
  return (isCurriedCall(call) ? entry.curried : entry.direct)[index] ?? null
}

const climbValueWrappers = (expression: ESTree.Node): ESTree.Node => {
  let current = expression
  for (;;) {
    const parent = current.parent
    if (parent === null) return current
    const wraps = EXPRESSION_WRAPPER_TYPES.has(parent.type) && 'expression' in parent && parent.expression === current
    const isBranch = parent.type === 'ConditionalExpression' && parent.test !== current
    if (!wraps && !isBranch) return current
    current = parent
  }
}

const argumentIndexOf = (call: ESTree.Node, node: ESTree.Node): number =>
  call.type === 'CallExpression' && call.callee !== node
    ? call.arguments.findIndex((argument) => argument === node)
    : -1

const isConstRecordDeclarator = (node: ESTree.Node | null): node is ESTree.VariableDeclarator =>
  node !== null && node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.parent !== null &&
  node.parent.type === 'VariableDeclaration' && node.parent.kind === 'const'

const isTaggedUnionCases = (cases: ESTree.Node | null, positions: SchemaPositions): boolean => {
  if (cases === null || cases.type !== 'ObjectExpression') return false
  const node = climbValueWrappers(cases)
  const call = node.parent
  return call !== null && call.type === 'CallExpression' &&
    argumentRoleOf(call, argumentIndexOf(call, node), positions) === 'cases'
}

type ContainerKind = 'fields' | 'members'

const isContainerValue = (
  expression: ESTree.Node,
  kind: ContainerKind,
  positions: SchemaPositions,
  depth: number,
): boolean => {
  if (depth > MAX_RECORD_DEPTH) return false
  const node = climbValueWrappers(expression)
  const parent = node.parent
  if (parent === null) return false
  if (parent.type === 'CallExpression') {
    return argumentRoleOf(parent, argumentIndexOf(parent, node), positions) === kind
  }
  if (
    kind === 'fields' && parent.type === 'Property' && parent.value === node &&
    isTaggedUnionCases(parent.parent, positions)
  ) {
    return true
  }
  const literalType = kind === 'fields' ? 'ObjectExpression' : 'ArrayExpression'
  if (parent.type === 'SpreadElement' && parent.parent !== null && parent.parent.type === literalType) {
    return isContainerValue(parent.parent, kind, positions, depth + 1)
  }
  if (expression.type === literalType && isConstRecordDeclarator(parent) && parent.init === node) {
    return positions.recordReadsOf(parent).every((read) =>
      isInTypePosition(read) || isContainerValue(read, kind, positions, depth + 1)
    )
  }
  return false
}

const isSuspendedSchema = (arrow: ESTree.Node, positions: SchemaPositions): boolean => {
  if (arrow.type !== 'ArrowFunctionExpression' || arrow.async || arrow.params.length > 0) return false
  const call = arrow.parent
  return call !== null && call.type === 'CallExpression' &&
    argumentRoleOf(call, argumentIndexOf(call, arrow), positions) === 'thunk'
}

const isWorkflowSchemaSlot = (property: ESTree.Node, positions: SchemaPositions): boolean => {
  if (property.type !== 'Property' || property.computed || property.key.type !== 'Identifier') return false
  const object = property.parent
  if (!WORKFLOW_SCHEMA_SLOTS.has(property.key.name) || object === null || object.type !== 'ObjectExpression') {
    return false
  }
  const argument = climbValueWrappers(object)
  const call = argument.parent
  return call !== null && call.type === 'CallExpression' && call.arguments[0] === argument &&
    positions.isWorkflowMake(call)
}

const isSchemaPipe = (member: ESTree.MemberExpression, positions: SchemaPositions): boolean => {
  const call = member.parent
  return call !== null && call.type === 'CallExpression' && call.callee === member && call.arguments.length > 0 &&
    call.arguments.every((argument) => positions.isSchemaCombinator(argument))
}

const isSchemaPosition = (expression: ESTree.Node, positions: SchemaPositions): boolean => {
  const node = climbValueWrappers(expression)
  const parent = node.parent
  if (parent === null) return false
  if (parent.type === 'CallExpression') {
    const role = argumentRoleOf(parent, argumentIndexOf(parent, node), positions)
    return role !== null && role !== 'thunk'
  }
  if (parent.type === 'ArrowFunctionExpression' && parent.body === node) return isSuspendedSchema(parent, positions)
  if (parent.type === 'Property' && parent.value === node && parent.parent !== null) {
    if (isWorkflowSchemaSlot(parent, positions)) return true
    return parent.parent.type === 'ObjectExpression' && isContainerValue(parent.parent, 'fields', positions, 0)
  }
  if (parent.type === 'ArrayExpression') return isContainerValue(parent, 'members', positions, 0)
  if (parent.type === 'SpreadElement' && parent.parent !== null) {
    if (parent.parent.type === 'ObjectExpression') return isContainerValue(parent.parent, 'fields', positions, 0)
    if (parent.parent.type === 'ArrayExpression') return isContainerValue(parent.parent, 'members', positions, 0)
  }
  return false
}

const isSchemaChainFrom = (
  start: ESTree.Node,
  firstSchemaMemberIndex: number,
  positions: SchemaPositions,
  admitBareResult: boolean,
): boolean => {
  let end: ESTree.Node = start
  let depth = 0
  for (;;) {
    const parent = end.parent
    if (parent === null || parent.type !== 'MemberExpression' || parent.object !== end) break
    const member = memberNameOf(parent)
    if (member === null) return false
    if (depth >= firstSchemaMemberIndex && SCHEMA_CHAIN_MEMBERS.has(member)) {
      const call = parent.parent
      if (call === null || call.type !== 'CallExpression' || call.callee !== parent) return false
      if (member === 'pipe' && !isSchemaPipe(parent, positions)) return false
      return isSchemaChainFrom(call, 0, positions, true)
    }
    if (depth >= firstSchemaMemberIndex && SCHEMA_MEMBERS.has(member)) return true
    end = parent
    depth += 1
  }
  if (depth < firstSchemaMemberIndex) return false
  if (isSchemaPosition(end, positions)) return true
  return admitBareResult && depth === 0 && isSchemaOnlyConst(end, positions)
}

/** A schema bound to a `const` whose every read in this file is itself a schema use. */
const isSchemaOnlyConst = (expression: ESTree.Node, positions: SchemaPositions): boolean => {
  const target = climbValueWrappers(expression)
  const declarator = target.parent
  if (!isConstRecordDeclarator(declarator) || declarator.init !== target) return false
  return positions.recordReadsOf(declarator).every((read) =>
    isInTypePosition(read) || isSchemaChainFrom(read, 0, positions, false)
  )
}

const isSchemaUse = (identifier: ESTree.Node, isNamespace: boolean, positions: SchemaPositions): boolean =>
  isSchemaChainFrom(identifier, isNamespace ? 1 : 0, positions, false)

const isRequireIdentifier = (node: ESTree.Node): boolean => {
  if (node.type !== 'Identifier' || node.name !== 'require') return false
  const parent = node.parent
  if (parent === null) return true
  if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return false
  return !TYPE_CONTEXT_TYPES.has(parent.type)
}

const isRequireReference = (node: ESTree.Node): boolean =>
  isRequireIdentifier(node) ||
  (node.type === 'MemberExpression' && node.computed && node.property.type === 'Literal' &&
    node.property.value === 'require')

const calleeRootOf = (callee: ESTree.Node): ESTree.Node => {
  let current = callee
  for (;;) {
    if (current.type === 'MemberExpression') current = current.object
    else if (current.type === 'CallExpression') current = current.callee
    else if (current.type === 'TSInstantiationExpression') current = current.expression
    else return current
  }
}

const importedNameOf = (specifier: ESTree.Node): string | null =>
  specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' ? specifier.imported.name : null

type SchemaBinding = { readonly combinator: string | null } | null

const schemaBindingOf = (declaration: ESTree.ImportDeclaration, specifier: ESTree.Node): SchemaBinding => {
  const source = declaration.source.value
  const importedName = importedNameOf(specifier)
  if (source === 'effect/Schema') return { combinator: importedName }
  return source === 'effect' && importedName === 'Schema' ? { combinator: null } : null
}

const combinatorNameOf = (callee: ESTree.Node, schemaRoots: ReadonlyMap<ESTree.Node, string | null>): string | null => {
  const node = stripInstantiation(callee)
  if (node.type === 'CallExpression') return combinatorNameOf(node.callee, schemaRoots)
  if (node.type === 'MemberExpression') return memberNameOf(node)
  return schemaRoots.get(node) ?? null
}

export const decisionCodeImports = defineRule({
  meta,
  create(context: Context) {
    const filename = context.filename
    if (!isDecisionFile(filename)) return {}

    const root = findWorkspaceDirSync(dirname(filename))
    const read = readDecisionCodeManifest(root)

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

        const schemaRoots = new Map<ESTree.Node, string | null>()
        const workflowRoots = new Set<ESTree.Node>()
        const cellTypesNamespaces = new Set<ESTree.Node>()
        const registerReferences = (declaration: ESTree.Node, into: Set<ESTree.Node>): void => {
          for (const variable of context.sourceCode.getDeclaredVariables(declaration)) {
            for (const reference of variable.references) into.add(reference.identifier)
          }
        }
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
              const binding = schemaBindingOf(statement, specifier)
              if (binding === null) continue
              for (const variable of context.sourceCode.getDeclaredVariables(specifier)) {
                for (const reference of variable.references) schemaRoots.set(reference.identifier, binding.combinator)
              }
            }
            const kind = classifySource(source, filename, manifest)
            for (const specifier of valueSpecifiersOf(statement)) {
              if (source === CELL_TYPES_PACKAGE && importedNameOf(specifier) === 'Workflow') {
                registerReferences(specifier, workflowRoots)
              }
              if (source === CELL_TYPES_PACKAGE && specifier.type === 'ImportNamespaceSpecifier') {
                registerReferences(specifier, cellTypesNamespaces)
              }
            }
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
                  messageId: 'sideEffectImport',
                  name: `a side-effect import of ${source}`,
                  actual: SIDE_EFFECT_IMPORT_ACTUAL.replace('{{source}}', source),
                  fix: SIDE_EFFECT_IMPORT_FIX.replace('{{source}}', source),
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
          } else if (isRequireReference(node)) {
            findings.push({
              node,
              messageId: 'dynamicImport',
              name: 'a reference to require',
              actual: DYNAMIC_IMPORT_ACTUAL.replace('{{form}}', 'require'),
              fix: DYNAMIC_IMPORT_FIX,
            })
          } else if (
            node.type === 'TSImportEqualsDeclaration' && node.importKind !== 'type' &&
            node.moduleReference.type === 'TSExternalModuleReference'
          ) {
            findings.push({
              node,
              messageId: 'dynamicImport',
              name: 'an import = require(...) declaration',
              actual: DYNAMIC_IMPORT_ACTUAL.replace('{{form}}', 'import = require(...)'),
              fix: DYNAMIC_IMPORT_FIX,
            })
            return
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
          combinatorOf: (call) =>
            schemaRoots.has(calleeRootOf(call.callee)) ? combinatorNameOf(call.callee, schemaRoots) : null,
          isSchemaCombinator: (node) => {
            const target = stripInstantiation(node)
            return schemaRoots.has(calleeRootOf(target.type === 'CallExpression' ? target.callee : target))
          },
          isWorkflowMake: (call) => {
            const callee = stripInstantiation(call.callee)
            if (callee.type !== 'MemberExpression' || memberNameOf(callee) !== 'make') return false
            const owner = callee.object
            return workflowRoots.has(owner) ||
              (owner.type === 'MemberExpression' && memberNameOf(owner) === 'Workflow' &&
                cellTypesNamespaces.has(owner.object))
          },
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

        for (const finding of findings) report(finding)
      },
    }
  },
})
