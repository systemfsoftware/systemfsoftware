import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { type ExportOrigin, moduleFileOf, originOfExport } from './export-origin.js'
import { basenameOf, isTestFile } from './path.js'
import { isPropCallee } from './prop-call.js'
import {
  FOREIGN_SUBJECT_EXPECTED,
  FOREIGN_SUBJECT_FIX,
  FOREIGN_SUBJECT_NAME,
  LOCAL_SUBJECT_EXPECTED,
  LOCAL_SUBJECT_FIX,
  LOCAL_SUBJECT_NAME,
  meta,
  WORKFLOW_PROPERTY_SUFFIX,
} from './workflow-property-subject.config.js'

export type MessageIds = 'localSubject' | 'foreignSubject'

const WORKFLOW_MODULE = /\.workflow\.[cm]?[jt]sx?$/

type Verdict =
  | { readonly _tag: 'Workflow' }
  | { readonly _tag: 'Local'; readonly actual: string }
  | { readonly _tag: 'Foreign'; readonly actual: string }

type GetScope = (node: ESTree.Node) => unknown

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node
  readonly parent?: ESTree.Node | null
}

interface VariableLike {
  readonly defs: readonly DefinitionLike[]
}

interface ReferenceLike {
  readonly identifier: ESTree.Node
  readonly resolved: VariableLike | null
}

interface ScopeLike {
  readonly references: readonly ReferenceLike[]
  readonly upper: unknown
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

const VALUE_DEFINITIONS: ReadonlySet<string> = new Set([
  'ImportBinding',
  'Variable',
  'FunctionName',
  'ClassName',
  'Parameter',
])

const definitionOf = (identifier: ESTree.Node, getScope: GetScope): DefinitionLike | undefined => {
  for (let scope: unknown = getScope(identifier); isScopeLike(scope); scope = scope.upper) {
    const reference = scope.references.find((candidate) => candidate.identifier === identifier)
    if (reference === undefined) continue
    const defs = reference.resolved?.defs ?? []
    return defs.find((definition) => VALUE_DEFINITIONS.has(definition.type)) ?? defs[0]
  }
  return undefined
}

const WRAPPERS: ReadonlySet<string> = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
])

const isNode = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

const unwrap = (node: ESTree.Node): ESTree.Node => {
  if (!WRAPPERS.has(node.type) || !('expression' in node)) return node
  const inner: unknown = node.expression
  return isNode(inner) ? unwrap(inner) : node
}

const NOT_OPTIONS: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'CallExpression',
  'ArrayExpression',
  'MemberExpression',
  'Literal',
  'TemplateLiteral',
])

const SUBJECT_KEY = 'subject'

type OptionsRead =
  | { readonly _tag: 'Subject'; readonly node: ESTree.Node }
  | { readonly _tag: 'Unreadable' }
  | { readonly _tag: 'None' }

const subjectInObject = (object: ESTree.ObjectExpression): OptionsRead => {
  let opaque = false
  for (const property of object.properties) {
    if (property.type !== 'Property') {
      opaque = true
      continue
    }
    if (property.computed) {
      if (property.key.type === 'Literal' && property.key.value === SUBJECT_KEY) {
        return { _tag: 'Subject', node: property.value }
      }
      opaque = true
      continue
    }
    const key = property.key.type === 'Identifier'
      ? property.key.name
      : property.key.type === 'Literal'
      ? property.key.value
      : undefined
    if (key === SUBJECT_KEY) return { _tag: 'Subject', node: property.value }
  }
  return opaque ? { _tag: 'Unreadable' } : { _tag: 'None' }
}

const optionsObjectOf = (raw: ESTree.Node, getScope: GetScope): ESTree.ObjectExpression | 'opaque' | undefined => {
  const argument = unwrap(raw)
  if (argument.type === 'ObjectExpression') return argument
  if (argument.type !== 'Identifier') return undefined
  const definition = definitionOf(argument, getScope)
  if (definition?.type !== 'Variable' || definition.node.type !== 'VariableDeclarator') return undefined
  const declaration = definition.parent
  const init = definition.node.init === null || definition.node.init === undefined
    ? undefined
    : unwrap(definition.node.init)
  if (init !== undefined && NOT_OPTIONS.has(init.type)) return undefined
  if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') return 'opaque'
  return init?.type === 'ObjectExpression' ? init : 'opaque'
}

const subjectOf = (call: ESTree.CallExpression, getScope: GetScope): OptionsRead => {
  let read: OptionsRead = { _tag: 'None' }
  for (const argument of call.arguments) {
    const object = optionsObjectOf(argument, getScope)
    if (object === undefined) continue
    if (object === 'opaque') {
      read = { _tag: 'Unreadable' }
      continue
    }
    const found = subjectInObject(object)
    if (found._tag === 'Subject') return found
    if (found._tag === 'Unreadable') read = found
  }
  return read
}

const verdictOfOrigin = (origin: ExportOrigin, label: string, source: string): Verdict => {
  if (origin._tag === 'Unresolved') {
    return { _tag: 'Foreign', actual: `${label}, imported from ${source}, which the rule could not resolve` }
  }
  if (origin._tag === 'Untraceable') {
    return {
      _tag: 'Foreign',
      actual: `${label}, imported from ${source}, whose declaration the rule could not trace past ${
        basenameOf(origin.file)
      }`,
    }
  }
  if (origin._tag === 'Namespace') {
    return { _tag: 'Foreign', actual: `${label}, a namespace re-exported through ${source}` }
  }
  return WORKFLOW_MODULE.test(basenameOf(origin.file))
    ? { _tag: 'Workflow' }
    : { _tag: 'Foreign', actual: `${label}, imported from ${source} and declared in ${basenameOf(origin.file)}` }
}

const importVerdict = (
  definition: DefinitionLike,
  member: string | undefined,
  label: string,
  filename: string,
): Verdict => {
  const declaration = definition.parent
  const specifier = definition.node
  if (declaration?.type !== 'ImportDeclaration') return { _tag: 'Local', actual: `${label}, declared in the test file` }
  const source = declaration.source.value
  const file = moduleFileOf(source, filename)
  if (file === undefined) return verdictOfOrigin({ _tag: 'Unresolved', specifier: source }, label, source)
  if (specifier.type === 'ImportNamespaceSpecifier') {
    if (member === undefined) return { _tag: 'Local', actual: `${label}, a whole module namespace` }
    return verdictOfOrigin(originOfExport(file, member), label, source)
  }
  const imported = specifier.type === 'ImportSpecifier'
    ? (specifier.imported.type === 'Literal' ? String(specifier.imported.value) : specifier.imported.name)
    : 'default'
  const origin = originOfExport(file, imported)
  if (member === undefined) return verdictOfOrigin(origin, label, source)
  return origin._tag === 'Namespace'
    ? verdictOfOrigin(originOfExport(origin.file, member), label, source)
    : { _tag: 'Local', actual: `${label}, a member of an imported value` }
}

const verdictOf = (raw: ESTree.Node, getScope: GetScope, filename: string): Verdict => {
  const subject = unwrap(raw)
  const expression = subject.type === 'MemberExpression' && !subject.computed && subject.property.type === 'Identifier'
    ? { root: unwrap(subject.object), member: subject.property.name }
    : { root: subject, member: undefined }
  if (expression.root.type !== 'Identifier') {
    return { _tag: 'Local', actual: 'a subject built in the test file as an expression' }
  }
  const label = expression.member === undefined
    ? `the subject ${expression.root.name}`
    : `the subject ${expression.root.name}.${expression.member}`
  const definition = definitionOf(expression.root, getScope)
  if (definition === undefined) return { _tag: 'Local', actual: `${label}, which resolves to no declaration` }
  if (definition.type !== 'ImportBinding') return { _tag: 'Local', actual: `${label}, declared in the test file` }
  return importVerdict(definition, expression.member, label, filename)
}

export const workflowPropertySubject = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (!isTestFile(basename)) return {}
    const namedWorkflowProperty = basename.endsWith(WORKFLOW_PROPERTY_SUFFIX)
    const getScope: GetScope = (node) => context.sourceCode.getScope(node)
    const findings: Array<{ readonly node: ESTree.Node; readonly verdict: Verdict }> = []

    return {
      'CallExpression:exit'(node: ESTree.CallExpression) {
        if (!isPropCallee(node.callee)) return
        const read = subjectOf(node, getScope)
        if (read._tag === 'None') return
        const verdict: Verdict = read._tag === 'Unreadable'
          ? { _tag: 'Local', actual: 'a subject hidden behind a spread, a computed key or a non-literal options value' }
          : verdictOf(read.node, getScope, context.filename)
        findings.push({ node: read._tag === 'Subject' ? read.node : node, verdict })
      },
      'Program:exit'() {
        const testsAWorkflow = namedWorkflowProperty || findings.some(({ verdict }) => verdict._tag === 'Workflow')
        if (!testsAWorkflow) return
        for (const { node, verdict } of findings) {
          if (verdict._tag === 'Workflow') continue
          context.report({
            node,
            messageId: verdict._tag === 'Local' ? 'localSubject' : 'foreignSubject',
            data: verdict._tag === 'Local'
              ? {
                name: LOCAL_SUBJECT_NAME,
                expected: LOCAL_SUBJECT_EXPECTED,
                actual: verdict.actual,
                fix: LOCAL_SUBJECT_FIX,
              }
              : {
                name: FOREIGN_SUBJECT_NAME,
                expected: FOREIGN_SUBJECT_EXPECTED,
                actual: verdict.actual,
                fix: FOREIGN_SUBJECT_FIX,
              },
          })
        }
      },
    }
  },
})
