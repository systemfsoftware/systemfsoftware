import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

/**
 * The subset of vite's `Plugin` this transform uses. Typed structurally so the
 * package needs no vite dependency; the returned object is assignable to
 * `Plugin` at the composition site.
 */
export interface RecursionBudgetPlugin {
  readonly name: string
  readonly enforce: 'pre'
  readonly resolveId: (source: string) => string | null
  readonly transform: (code: string, id: string) => string | undefined
}

/**
 * The specifier the transform injects. It resolves to the runtime module's real
 * path, never to a `\0`-prefixed virtual id: a real path keeps sourcemaps and
 * the related-file walks (vitest, Stryker) intact.
 */
export const RECURSION_BUDGET_VIRTUAL_ID = 'virtual:effect-schema-recursion-budget' as const

const RUNTIME_FILES: ReadonlyArray<string> = [
  './recursion-budget-runtime.ts',
  './recursion-budget-runtime.mjs',
  './recursion-budget-runtime.js',
]

const ANNOTATION_KEY = 'recursionBudget'
const HOOK_KEY = 'toArbitrary'
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

const childNodesOf = (node: OxcNode): ReadonlyArray<OxcNode> => {
  const children: OxcNode[] = []
  for (const value of Object.values(node)) {
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

/**
 * Every `VariableDeclarator` in the module, at any block depth: canonical
 * schemas also live inside `if (import.meta.vitest)` blocks and local builder
 * functions, and the transform must reach them there too.
 */
const declaratorsOf = (program: OxcNode): ReadonlyArray<OxcNode> => {
  const found: OxcNode[] = []
  const visit = (node: OxcNode): void => {
    if (node.type === 'VariableDeclarator') found.push(node)
    for (const child of childNodesOf(node)) visit(child)
  }
  visit(program)
  return found
}

/** The member name a callee resolves to: `S.suspend` and a bare `suspend` both answer `suspend`. */
const memberNameOf = (node: OxcNode): string | undefined => {
  if (node.type === 'Identifier') return typeof node['name'] === 'string' ? node['name'] : undefined
  if (node.type !== 'MemberExpression' || node['computed'] === true) return undefined
  const property = node['property']
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

/**
 * The one shape the transform materializes: a binding whose initializer is
 * `S.suspend(thunk).annotate({ ..., recursionBudget })`. A hand-written
 * `toArbitrary` in the same literal wins — the transform leaves it alone, which
 * also makes a re-run over already-transformed code a no-op.
 */
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

const hookTextFor = (code: string, moduleId: string, injection: Injection): string => {
  const budgetText = code.slice(injection.budgetStart, injection.budgetEnd)
  const depthIdentifier = JSON.stringify(`${moduleId}#${injection.binding}`)
  return `, toArbitrary: ${INJECTED_ALIAS}(() => ${injection.binding}, ${budgetText}, ${depthIdentifier})`
}

const splice = (code: string, moduleId: string, injections: ReadonlyArray<Injection>, importAt: number): string => {
  let out = code
  for (const injection of [...injections].sort((left, right) => right.insertAt - left.insertAt)) {
    out = out.slice(0, injection.insertAt) + hookTextFor(code, moduleId, injection) + out.slice(injection.insertAt)
  }
  const importLine = `import { budgetToArbitrary as ${INJECTED_ALIAS} } from '${RECURSION_BUDGET_VIRTUAL_ID}'\n`
  return out.slice(0, importAt) + importLine + out.slice(importAt)
}

let resolvedRuntimePath: string | null | undefined

const runtimePath = (): string | null => {
  if (resolvedRuntimePath !== undefined) return resolvedRuntimePath
  const found =
    RUNTIME_FILES.map((relative) => fileURLToPath(new URL(relative, import.meta.url))).find((path) =>
      existsSync(path)
    ) ?? null
  resolvedRuntimePath = found
  return found
}

/**
 * Materializes every `recursionBudget` annotation in a module into the
 * arbitrary-derivation hook that honors it, leaving the schema source in stock
 * Effect vocabulary. The annotation states ceiling and shape; the depth
 * identifier is derived from the module and binding, so two cycles can never
 * share one.
 */
export const recursionBudgetTransform = (): RecursionBudgetPlugin => ({
  name: '@systemfsoftware/recursion-budget',
  enforce: 'pre',
  resolveId: (source) => (source === RECURSION_BUDGET_VIRTUAL_ID ? runtimePath() : null),
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
    return injections.length === 0 ? undefined : splice(code, moduleId, injections, anchor.start)
  },
})
