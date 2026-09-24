/**
 * Finds every concurrency-primitive site in a source file, on oxc's AST.
 *
 * A site is a use of `Queue`/`Deferred`/`Ref`/`Semaphore` state, a fiber fork,
 * or a scoped acquisition, reached through a binding imported from `effect`
 * statically or through `await import('effect/…')`. Type positions, `import
 * type`, and the trailing in-source `if (import.meta.vitest …)` block are not
 * sites. Each site carries how its execution is observed:
 *
 *  - `effect` — the call returns an Effect (or a data-last function that
 *    does); it counts when that Effect runs, not when it is built.
 *  - `value`  — an `…Unsafe` member acts on call; it counts when called.
 *  - `inner`  — a Layer or Stream constructor; it counts when an Effect it was
 *    handed runs, so building the Layer or Stream is not running it.
 */

/** @typedef {'fork' | 'queue' | 'deferred' | 'ref' | 'semaphore' | 'scoped'} Primitive */
/** @typedef {'effect' | 'value' | 'inner'} Mode */
/**
 * @typedef {{
 *   readonly id: string, readonly file: string, readonly line: number, readonly column: number,
 *   readonly start: number, readonly end: number, readonly token: string,
 *   readonly primitive: Primitive, readonly mode: Mode, readonly shorthand: boolean
 * }} Site
 */
/** @typedef {{ readonly start: number, readonly end: number }} Span */
/** @typedef {{ readonly start: number, readonly end: number, readonly object: string }} KernelCall */
/** @typedef {{ readonly type: string, readonly start: number, readonly end: number, readonly [key: string]: unknown }} AstNode */
/** @typedef {(filename: string, code: string, options: object) => { program: object, errors: ReadonlyArray<unknown> }} Parse */
/** @typedef {{ readonly module: string } | { readonly callable: Primitive }} Binding */

/** @type {Readonly<Record<string, Primitive>>} */
const STATE_MODULES = { Queue: 'queue', Deferred: 'deferred', Ref: 'ref', Semaphore: 'semaphore' }

/** @type {Readonly<Record<string, (member: string) => Primitive | null>>} */
const MEMBER_RULES = {
  Effect: (member) =>
    /^fork/.test(member)
      ? 'fork'
      : /^(acquireRelease\w*|acquireUseRelease|addFinalizer|scoped)$/.test(member)
      ? 'scoped'
      : null,
  Layer: (member) => (/^(scoped|scopedDiscard)$/.test(member) ? 'scoped' : null),
  Stream: (member) => (/^acquireRelease/.test(member) ? 'scoped' : null),
  Scope: (member) => (/^addFinalizer/.test(member) ? 'scoped' : null),
}

/** Modules whose constructors return a Layer or Stream rather than an Effect. */
const INNER_MODULES = new Set(['Layer', 'Stream'])

/**
 * @param {string} imported
 * @returns {Primitive | null}
 */
const callablePrimitive = (imported) => {
  if (/^fork/.test(imported)) return 'fork'
  if (/^(acquireRelease\w*|acquireUseRelease|addFinalizer|scoped)$/.test(imported)) return 'scoped'
  return null
}

/**
 * @param {unknown} value
 * @returns {value is AstNode}
 */
const isNode = (value) =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'

/**
 * @param {unknown} node
 * @returns {string | undefined}
 */
const nameOf = (node) => {
  if (!isNode(node)) return undefined
  if (node.type === 'Identifier' && typeof node['name'] === 'string') return node['name']
  if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value']
  return undefined
}

/**
 * @param {AstNode} node
 * @param {string} key
 * @returns {ReadonlyArray<AstNode>}
 */
const nodesAt = (node, key) => {
  const value = node[key]
  return Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []
}

/**
 * @param {string} specifier
 * @returns {boolean}
 */
const isEffectSpecifier = (specifier) => /^effect(\/|$)/.test(specifier)

/**
 * @param {string} specifier
 * @returns {string}
 */
const moduleLeaf = (specifier) => (specifier === 'effect' ? 'Effect' : specifier.slice(specifier.lastIndexOf('/') + 1))

/**
 * @param {Map<string, Binding>} out
 * @param {string} local
 * @param {string} imported
 */
const bindNamed = (out, local, imported) => {
  if (imported in STATE_MODULES || imported in MEMBER_RULES) {
    out.set(local, { module: imported })
    return
  }
  const callable = callablePrimitive(imported)
  if (callable !== null) out.set(local, { callable })
}

/**
 * @param {Map<string, Binding>} out
 * @param {AstNode} statement
 */
const bindStatic = (out, statement) => {
  if (statement['importKind'] === 'type') return
  const specifier = nameOf(statement['source'])
  if (specifier === undefined || !isEffectSpecifier(specifier)) return
  for (const spec of nodesAt(statement, 'specifiers')) {
    if (spec['importKind'] === 'type') continue
    const local = nameOf(spec['local'])
    if (local === undefined) continue
    if (spec.type === 'ImportNamespaceSpecifier') out.set(local, { module: moduleLeaf(specifier) })
    else if (spec.type === 'ImportDefaultSpecifier') continue
    else bindNamed(out, local, nameOf(spec['imported']) ?? local)
  }
}

/**
 * `const Q = await import('effect/Queue')` or `const { Queue } = await import('effect')`.
 * @param {Map<string, Binding>} out
 * @param {AstNode} declarator
 */
const bindDynamic = (out, declarator) => {
  const init = nodesAt(declarator, 'init')[0]
  const imported = init?.type === 'AwaitExpression' ? nodesAt(init, 'argument')[0] : undefined
  if (imported?.type !== 'ImportExpression') return
  const specifier = nameOf(imported['source'])
  if (specifier === undefined || !isEffectSpecifier(specifier)) return
  const target = nodesAt(declarator, 'id')[0]
  if (target === undefined) return
  const local = nameOf(target)
  if (local !== undefined) {
    out.set(local, { module: moduleLeaf(specifier) })
    return
  }
  if (target.type !== 'ObjectPattern') return
  for (const property of nodesAt(target, 'properties')) {
    const key = nameOf(property['key'])
    const value = nameOf(property['value'])
    if (key !== undefined && value !== undefined) bindNamed(out, value, key)
  }
}

/**
 * @param {AstNode} node
 * @returns {Generator<[AstNode, string]>}
 */
const children = function*(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    if (Array.isArray(value)) { for (const item of value) if (isNode(item)) yield [item, key] }
    if (isNode(value)) yield [value, key]
  }
}

/**
 * @param {AstNode} node
 * @param {(node: AstNode) => void} each
 */
const walk = (node, each) => {
  each(node)
  for (const [child] of children(node)) walk(child, each)
}

/**
 * @param {AstNode} program
 * @returns {Map<string, Binding>}
 */
const bindingsOf = (program) => {
  /** @type {Map<string, Binding>} */
  const out = new Map()
  walk(program, (node) => {
    if (node.type === 'ImportDeclaration') bindStatic(out, node)
    if (node.type === 'VariableDeclarator') bindDynamic(out, node)
  })
  return out
}

/**
 * @param {AstNode} node
 * @param {string} code
 * @returns {boolean}
 */
const isInSourceTestBlock = (node, code) => {
  if (node.type !== 'IfStatement') return false
  const test = nodesAt(node, 'test')[0]
  return test !== undefined && code.slice(test.start, test.end).includes('import.meta.vitest')
}

/**
 * @param {string} code
 * @param {number} offset
 * @returns {{ line: number, column: number }}
 */
const lineColumn = (code, offset) => {
  const before = code.slice(0, offset)
  const lastBreak = before.lastIndexOf('\n')
  return { line: before.split('\n').length, column: offset - lastBreak }
}

/**
 * @param {string} member
 * @param {string} module
 * @returns {Mode}
 */
const modeOf = (member, module) => member.endsWith('Unsafe') ? 'value' : INNER_MODULES.has(module) ? 'inner' : 'effect'

/**
 * @param {AstNode} node
 * @param {Map<string, Binding>} bindings
 * @returns {{ token: string, primitive: Primitive, mode: Mode } | undefined}
 */
const memberSite = (node, bindings) => {
  if (node.type !== 'MemberExpression' || node['computed'] === true) return undefined
  const object = nameOf(node['object'])
  const member = nameOf(node['property'])
  if (object === undefined || member === undefined || !/^[a-z]/.test(member)) return undefined
  const binding = bindings.get(object)
  if (binding === undefined || !('module' in binding)) return undefined
  const primitive = STATE_MODULES[binding.module] ?? MEMBER_RULES[binding.module]?.(member) ?? null
  if (primitive === null) return undefined
  return { token: `${object}.${member}`, primitive, mode: modeOf(member, binding.module) }
}

/**
 * @param {AstNode} node
 * @param {AstNode | undefined} parent
 * @param {string} key
 * @param {Map<string, Binding>} bindings
 * @returns {{ token: string, primitive: Primitive, mode: Mode } | undefined}
 */
const callableSite = (node, parent, key, bindings) => {
  if (node.type !== 'Identifier' || parent === undefined) return undefined
  if (parent.type === 'MemberExpression' && key === 'property') return undefined
  if (parent.type === 'Property' && key === 'key') return undefined
  if (parent.type === 'VariableDeclarator' && key === 'id') return undefined
  if (parent.type.startsWith('Import') || parent.type.startsWith('Export')) return undefined
  const name = nameOf(node)
  const binding = name === undefined ? undefined : bindings.get(name)
  if (binding === undefined || !('callable' in binding) || name === undefined) return undefined
  return { token: name, primitive: binding.callable, mode: 'effect' }
}

/**
 * The parsed program; a file oxc cannot parse throws rather than reporting no sites.
 * @param {Parse} parse
 * @param {string} file
 * @param {string} code
 * @returns {AstNode}
 */
const programOf = (parse, file, code) => {
  const parsed = parse(file, code, { sourceType: 'module', lang: file.endsWith('x') ? 'tsx' : 'ts' })
  if (parsed.errors.length > 0 || !isNode(parsed.program)) throw new Error(`${file}: oxc could not parse it`)
  return parsed.program
}

/**
 * @param {Parse} parse
 * @param {string} file  path reported and used in site ids, relative to the project root
 * @param {string} code
 * @returns {ReadonlyArray<Site>}
 */
export const scanSites = (parse, file, code) => {
  const program = programOf(parse, file, code)
  const bindings = bindingsOf(program)
  if (bindings.size === 0) return []
  /** @type {Array<Site>} */
  const sites = []
  /**
   * @param {AstNode} node
   * @param {AstNode | undefined} parent
   * @param {string} key
   */
  const visit = (node, parent, key) => {
    if (node.type === 'ImportDeclaration' || node.type.startsWith('TS')) return
    if (isInSourceTestBlock(node, code)) return
    const found = memberSite(node, bindings) ?? callableSite(node, parent, key, bindings)
    if (found !== undefined) {
      const { line, column } = lineColumn(code, node.start)
      const shorthand = parent?.type === 'Property' && parent['shorthand'] === true
      sites.push({
        id: `${file}:${line}:${column}`,
        file,
        line,
        column,
        start: node.start,
        end: node.end,
        shorthand,
        ...found,
      })
      return
    }
    for (const [child, childKey] of children(node)) visit(child, node, childKey)
  }
  visit(program, undefined, 'program')
  return sites
}

/**
 * Every `Kernel.run(…)` / `Kernel.search(…)` call in a checker's source: the
 * programs a check drives go through these. Each carries the identifier the
 * call was made on, so the runtime is handed the kernel namespace itself.
 * @param {Parse} parse
 * @param {string} file
 * @param {string} code
 * @returns {ReadonlyArray<KernelCall>}
 */
export const scanKernelCalls = (parse, file, code) => {
  const program = programOf(parse, file, code)
  /** @type {Array<KernelCall>} */
  const calls = []
  walk(program, (node) => {
    if (node.type !== 'CallExpression') return
    const callee = nodesAt(node, 'callee')[0]
    if (callee?.type !== 'MemberExpression') return
    if (nameOf(callee['object']) !== 'Kernel') return
    const member = nameOf(callee['property'])
    if (member === 'run' || member === 'search') {
      calls.push({ start: node.start, end: node.end, object: 'Kernel' })
    }
  })
  return calls
}
