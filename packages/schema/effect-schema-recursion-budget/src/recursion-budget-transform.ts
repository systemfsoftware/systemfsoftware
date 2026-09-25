import { parseSync } from 'oxc-parser'

export interface RecursionBudgetPlugin {
  readonly name: string
  readonly enforce: 'pre'
  readonly transform: (code: string, id: string) => string | undefined
}

/**
 * The package subpath the transform injects. Resolving it from this package's
 * own location keeps the generated import working for consumers under strict
 * node_modules, where this package is only a transitive dependency.
 */
export const RECURSION_BUDGET_RUNTIME_SPECIFIER = '@systemfsoftware/effect-schema-recursion-budget/runtime' as const

const ANNOTATION_KEY = 'recursionBudget'
const HOOK_KEY = 'toCodecArbitrary'

const SUSPEND_MEMBER = 'suspend'
const ANNOTATE_MEMBER = 'annotate'
const INJECTED_ALIAS = '__esRecursionBudget'

interface OxcNode extends Record<string, unknown> {
  readonly type: string
  readonly start: number
  readonly end: number
}

const isNode = (value: unknown): value is OxcNode => {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || !('start' in value) || !('end' in value)) return false
  return typeof value.type === 'string' && typeof value.start === 'number' && typeof value.end === 'number'
}

const childNodesOf = (current: OxcNode): ReadonlyArray<OxcNode> => {
  const children: OxcNode[] = []
  for (const value of Object.values(current)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) children.push(item)
      }
      continue
    }
    if (isNode(value)) children.push(value)
  }
  return children
}

const declaratorsOf = (program: OxcNode): ReadonlyArray<OxcNode> => {
  const found: OxcNode[] = []
  const visit = (current: OxcNode): void => {
    if (current.type === 'VariableDeclarator') found.push(current)
    for (const child of childNodesOf(current)) visit(child)
  }
  visit(program)
  return found
}

const memberNameOf = (current: OxcNode): string | undefined => {
  if (current.type === 'Identifier') return typeof current['name'] === 'string' ? current['name'] : undefined
  if (current.type !== 'MemberExpression' || current['computed'] === true) return undefined
  const property = current['property']
  if (!isNode(property) || property.type !== 'Identifier') return undefined
  return typeof property['name'] === 'string' ? property['name'] : undefined
}

const propertyKeyOf = (property: OxcNode): string | undefined => {
  if (property.type !== 'Property' || property['computed'] === true) return undefined
  const key = property['key']
  if (!isNode(key) || key.type !== 'Identifier') return undefined
  return typeof key['name'] === 'string' ? key['name'] : undefined
}

const propertyNamed = (properties: ReadonlyArray<unknown>, name: string): OxcNode | undefined => {
  for (const candidate of properties) {
    if (isNode(candidate) && propertyKeyOf(candidate) === name) return candidate
  }
  return undefined
}

const isSuspendCall = (call: OxcNode): boolean => {
  if (call.type !== 'CallExpression') return false
  const callee = call['callee']
  if (!isNode(callee) || memberNameOf(callee) !== SUSPEND_MEMBER) return false
  const args = call['arguments']
  return Array.isArray(args) && args.length === 1
}

interface Injection {
  readonly binding: string
  readonly budgetStart: number
  readonly budgetEnd: number
  readonly insertAt: number
}

const injectionOf = (declarator: OxcNode): Injection | undefined => {
  const id = declarator['id']
  const init = declarator['init']
  if (!isNode(id) || id.type !== 'Identifier' || !isNode(init) || init.type !== 'CallExpression') return undefined
  const callee = init['callee']
  if (!isNode(callee) || memberNameOf(callee) !== ANNOTATE_MEMBER) return undefined
  const receiver = callee['object']
  if (!isNode(receiver) || !isSuspendCall(receiver)) return undefined
  const rawArgs = init['arguments']
  const args: ReadonlyArray<unknown> = Array.isArray(rawArgs) ? rawArgs : []
  const options = args[0]
  if (!isNode(options) || options.type !== 'ObjectExpression') return undefined
  const rawProperties = options['properties']
  const properties: ReadonlyArray<unknown> = Array.isArray(rawProperties) ? rawProperties : []
  if (propertyNamed(properties, HOOK_KEY) !== undefined) return undefined

  const budget = propertyNamed(properties, ANNOTATION_KEY)
  if (budget === undefined) return undefined
  const value: unknown = budget['value']
  if (!isNode(value)) return undefined
  return {
    binding: String(id['name']),
    budgetStart: value.start,
    budgetEnd: value.end,
    insertAt: budget.end,
  }
}

const hookTextFor = (code: string, injection: Injection): string => {
  const budgetText = code.slice(injection.budgetStart, injection.budgetEnd)
  return `, ${HOOK_KEY}: ${INJECTED_ALIAS}(() => ${injection.binding}, ${budgetText})`
}

const splice = (code: string, injections: ReadonlyArray<Injection>, importAt: number): string => {
  let out = code
  for (const injection of [...injections].sort((left, right) => right.insertAt - left.insertAt)) {
    out = out.slice(0, injection.insertAt) + hookTextFor(code, injection) + out.slice(injection.insertAt)
  }
  const importLine = `import { budgetToArbitrary as ${INJECTED_ALIAS} } from '${RECURSION_BUDGET_RUNTIME_SPECIFIER}'\n`
  return out.slice(0, importAt) + importLine + out.slice(importAt)
}

export const recursionBudgetTransform = (): RecursionBudgetPlugin => ({
  name: '@systemfsoftware/recursion-budget',
  enforce: 'pre',
  transform: (code, id) => {
    const moduleId = id.split('?')[0] ?? id
    if (!moduleId.endsWith('.ts') || moduleId.startsWith('\0') || moduleId.includes('/node_modules/')) {
      return undefined
    }
    if (!code.includes(ANNOTATION_KEY)) return undefined
    const parsed = parseSync(moduleId, code)
    const program: unknown = parsed.program
    if (!isNode(program)) return undefined
    const rawBody = program['body']
    const body: ReadonlyArray<unknown> = Array.isArray(rawBody) ? rawBody : []
    const anchor = body[0]
    if (!isNode(anchor)) return undefined
    const injections: Injection[] = []
    for (const declarator of declaratorsOf(program)) {
      const injection = injectionOf(declarator)
      if (injection !== undefined) injections.push(injection)
    }
    return injections.length === 0 ? undefined : splice(code, injections, anchor.start)
  },
})
