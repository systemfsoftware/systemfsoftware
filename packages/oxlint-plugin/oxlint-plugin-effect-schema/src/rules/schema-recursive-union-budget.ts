import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { originFinalMember, resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import {
  actualWithSuspends,
  ANNOTATE_MEMBER,
  ANNOTATION_MEMBER,
  BUDGET_MEMBER,
  EXPECTED,
  FIX,
  meta,
  NAME,
  SUSPEND_BUDGET_THRESHOLD,
  SUSPEND_MEMBER,
  UNBUDGETED_ACTUAL,
  UNBUDGETED_EXPECTED,
  UNBUDGETED_FIX,
  UNBUDGETED_NAME,
  UNION_MEMBER,
} from './schema-recursive-union-budget.config.js'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type MessageIds = 'recursiveUnionBudget' | 'unbudgetedRecursionUnion'

const MESSAGE_ID: MessageIds = 'recursiveUnionBudget'

const UNBUDGETED_MESSAGE_ID: MessageIds = 'unbudgetedRecursionUnion'

type GetScope = (node: ESTree.Node) => unknown

type Bindings = ReadonlyMap<string, ESTree.Node>

type References = ReadonlyMap<string, readonly string[]>

interface CycleIndex {
  readonly bindings: Bindings
  readonly references: References
  readonly getScope: GetScope
}

interface BudgetReport {
  readonly node: ESTree.Node
  readonly count: number
}

const NON_REFERENCE_KEYS: Readonly<Record<string, true>> = {
  parent: true,
  typeAnnotation: true,
  typeArguments: true,
  typeParameters: true,
  typeParams: true,
  returnType: true,
  superTypeArguments: true,
  implements: true,
  id: true,
  params: true,
  key: true,
  property: true,
  local: true,
  imported: true,
}

const isNodeValue = (value: unknown): value is ESTree.Node =>
  typeof value === 'object' && value !== null && 'type' in value

const childValuesOf = (node: ESTree.Node): readonly ESTree.Node[] => {
  const children: ESTree.Node[] = []
  for (const [key, value] of Object.entries(node)) {
    if (NON_REFERENCE_KEYS[key] === true) continue
    if (isNodeValue(value)) children.push(value)
    if (!Array.isArray(value)) continue
    for (const element of value) {
      if (isNodeValue(element)) children.push(element)
    }
  }
  return children
}

const collectReferences = (node: ESTree.Node, into: Set<string>): void => {
  if (node.type === 'Identifier') into.add(node.name)
  for (const child of childValuesOf(node)) collectReferences(child, into)
}

const hasValueNode = (node: ESTree.Node, predicate: (node: ESTree.Node) => boolean): boolean =>
  predicate(node) || childValuesOf(node).some((child) => hasValueNode(child, predicate))

const recordInitializer = (statement: ESTree.Node, record: (name: string, value: ESTree.Node) => void): void => {
  if (statement.type === 'VariableDeclaration') {
    for (const declarator of statement.declarations) {
      if (declarator.id.type !== 'Identifier' || declarator.init === null) continue
      record(declarator.id.name, declarator.init)
    }
    return
  }
  if (statement.type === 'ExportNamedDeclaration') {
    const declaration = statement.declaration
    if (declaration !== null) recordInitializer(declaration, record)
    return
  }
  if (statement.type !== 'ExpressionStatement') return
  const expression = statement.expression
  if (expression.type !== 'AssignmentExpression' || expression.operator !== '=') return
  if (expression.left.type !== 'Identifier') return
  record(expression.left.name, expression.right)
}

const moduleBindingsOf = (program: ESTree.Program): Bindings => {
  const bindings = new Map<string, ESTree.Node>()
  for (const statement of program.body) recordInitializer(statement, (name, value) => bindings.set(name, value))
  return bindings
}

const referencesOf = (bindings: Bindings): References => {
  const references = new Map<string, readonly string[]>()
  for (const [name, initializer] of bindings) {
    const names = new Set<string>()
    collectReferences(initializer, names)
    references.set(name, [...names])
  }
  return references
}

const reachableFrom = (references: References, name: string): ReadonlySet<string> => {
  const reached = new Set<string>()
  const advance = (from: string): void => {
    for (const next of references.get(from) ?? []) {
      if (reached.has(next)) continue
      reached.add(next)
      advance(next)
    }
  }
  advance(name)
  return reached
}

const cycleMembersOf = (forward: ReadonlySet<string>, name: string, references: References): readonly string[] => {
  const members = [name]
  for (const candidate of references.keys()) {
    if (candidate === name || !forward.has(candidate)) continue
    if (reachableFrom(references, candidate).has(name)) members.push(candidate)
  }
  return members
}

const vocabularyMemberOf = (initializer: ESTree.Node, getScope: GetScope): string | null => {
  if (initializer.type !== 'CallExpression') return null
  const origin = resolveImportOrigin(initializer.callee, getScope)
  if (origin === null || !isSchemaVocabularyOrigin(origin)) return null
  return originFinalMember(origin)
}

const suspendMembersOf = (cycle: readonly string[], bindings: Bindings, getScope: GetScope): ReadonlySet<string> => {
  const suspends = new Set<string>()
  for (const name of cycle) {
    const initializer = bindings.get(name) ?? null
    if (initializer !== null && vocabularyMemberOf(initializer, getScope) === SUSPEND_MEMBER) suspends.add(name)
  }
  return suspends
}

const listedMembersOf = (initializer: ESTree.Node): readonly ESTree.Node[] => {
  if (initializer.type !== 'CallExpression') return []
  const listed: ESTree.Node[] = []
  for (const argument of initializer.arguments) {
    if (argument.type !== 'ArrayExpression') {
      listed.push(argument)
      continue
    }
    for (const element of argument.elements) {
      if (element !== null) listed.push(element)
    }
  }
  return listed
}

const countedSuspends = (initializer: ESTree.Node, suspends: ReadonlySet<string>): number => {
  const counted = new Set<string>()
  for (const member of listedMembersOf(initializer)) {
    if (member.type === 'Identifier' && suspends.has(member.name)) counted.add(member.name)
  }
  return counted.size
}

const isAnnotationNode = (node: ESTree.Node): boolean => {
  if (node.type === 'Identifier') return node.name === ANNOTATION_MEMBER
  if (node.type === 'MemberExpression') {
    return !node.computed && node.property.type === 'Identifier' && node.property.name === ANNOTATION_MEMBER
  }
  if (node.type === 'Property') {
    return !node.computed && node.key.type === 'Identifier' && node.key.name === ANNOTATION_MEMBER
  }
  return false
}

const budgetReportOf = (name: string, index: CycleIndex): BudgetReport | null => {
  const forward = reachableFrom(index.references, name)
  if (!forward.has(name)) return null
  const suspends = suspendMembersOf(cycleMembersOf(forward, name, index.references), index.bindings, index.getScope)
  if (suspends.size < SUSPEND_BUDGET_THRESHOLD) return null
  const initializer = index.bindings.get(name) ?? null
  if (initializer === null || vocabularyMemberOf(initializer, index.getScope) === null) return null
  const count = countedSuspends(initializer, suspends)
  if (count < SUSPEND_BUDGET_THRESHOLD) return null
  const annotated = [name, ...suspends].some((member) => {
    const memberInitializer = index.bindings.get(member) ?? null
    return memberInitializer !== null && hasValueNode(memberInitializer, isAnnotationNode)
  })
  if (annotated) return null
  return { node: initializer, count }
}

const annotateSubjectOf = (
  initializer: ESTree.Node,
): { readonly subject: ESTree.Node; readonly options: ESTree.Node | null } | null => {
  if (initializer.type !== 'CallExpression') return null
  const callee = initializer.callee
  if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') return null
  if (callee.property.name !== ANNOTATE_MEMBER) return { subject: initializer, options: null }
  const options = initializer.arguments.find((argument) => argument.type === 'ObjectExpression') ?? null
  return { subject: callee.object, options }
}

const returnedExpressionOf = (thunk: ESTree.Node | undefined): ESTree.Node | null => {
  if (thunk === undefined) return null
  if (thunk.type !== 'ArrowFunctionExpression' && thunk.type !== 'FunctionExpression') return null
  const body = thunk.body
  if (body === null) return null
  if (body.type !== 'BlockStatement') return body
  for (const statement of body.body) {
    if (statement.type === 'ReturnStatement' && statement.argument !== null) return statement.argument
  }
  return null
}

const declaresGenerationIntent = (options: ESTree.Node | null): boolean =>
  options !== null &&
  hasValueNode(options, (node) => {
    if (node.type !== 'Property' || node.computed) return false
    const key = node.key
    const name = key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
    return name === BUDGET_MEMBER || name === ANNOTATION_MEMBER
  })

const unbudgetedReportOf = (name: string, index: CycleIndex): BudgetReport | null => {
  const forward = reachableFrom(index.references, name)
  if (!forward.has(name)) return null
  const initializer = index.bindings.get(name) ?? null
  if (initializer === null) return null
  const annotation = annotateSubjectOf(initializer)
  if (annotation === null) return null
  const { subject, options } = annotation
  if (vocabularyMemberOf(subject, index.getScope) !== SUSPEND_MEMBER) return null
  if (declaresGenerationIntent(options)) return null
  if (subject.type !== 'CallExpression') return null
  const returned = returnedExpressionOf(subject.arguments[0])
  if (returned === null || vocabularyMemberOf(returned, index.getScope) !== UNION_MEMBER) return null
  return { node: initializer, count: 0 }
}

export const schemaRecursiveUnionBudget = defineRule({
  meta,
  create(context: Context) {
    const getScope: GetScope = context.sourceCode.getScope
    return {
      Program(node: ESTree.Program) {
        const bindings = moduleBindingsOf(node)
        const index: CycleIndex = { bindings, references: referencesOf(bindings), getScope }
        const reportedCycles = new Set<string>()
        for (const name of index.references.keys()) {
          const report = budgetReportOf(name, index)
          if (report === null) continue
          reportedCycles.add(name)
          context.report({
            node: report.node,
            messageId: MESSAGE_ID,
            data: { name: NAME, expected: EXPECTED, actual: actualWithSuspends(report.count), fix: FIX },
          })
        }
        for (const name of index.references.keys()) {
          const report = unbudgetedReportOf(name, index)
          if (report === null) continue
          const cycle = cycleMembersOf(reachableFrom(index.references, name), name, index.references)
          if (cycle.some((member) => reportedCycles.has(member))) continue
          context.report({
            node: report.node,
            messageId: UNBUDGETED_MESSAGE_ID,
            data: {
              name: UNBUDGETED_NAME,
              expected: UNBUDGETED_EXPECTED,
              actual: UNBUDGETED_ACTUAL,
              fix: UNBUDGETED_FIX,
            },
          })
        }
      },
    }
  },
})
