import type { ESTree } from '@oxlint/plugins'

/**
 * The import-origin resolver: "what module and exported name does this
 * identifier or member expression ultimately denote?"
 *
 * The red-team defect this closes: the make-boundary rules matched a syntactic
 * shape — callee object is an ImportBinding, callee property is an Identifier —
 * instead of resolving where an identifier actually comes from. Every
 * indirection walked past: a namespace alias (`const W = Workflow`), a chain of
 * aliases, a destructured `const { make } = Workflow`, a computed
 * `Workflow['make']`, and a `Workflow.make.bind(Workflow)(...)` indirection all
 * produced zero findings. The same defect inverted produced a false positive:
 * `import { Array as Arr } from 'effect'` reported `unsealedImport` because the
 * classification keyed on the local binding name (`Arr`) when the sealed-pure
 * check keys on the imported name (`Array`) and the source module.
 *
 * One resolver answers both directions: resolve an expression to `{ source,
 * importedName, path }` and let the callers key their verdicts on the origin,
 * never on the local spelling.
 *
 * Resolution semantics:
 *
 * - import specifiers: named (`import { x as y }` → `source`, imported `x`),
 *   default (`import x` → imported `default`), namespace (`import * as x` →
 *   imported name `null` until a member is taken off it).
 * - module-scope aliases and chains of them — `const`, `let` and `var` alike
 *   (`const W = Workflow`, `let W = Workflow`). A reassigned `let`
 *   mis-resolves — an accepted approximation; the resolver never looks past
 *   the declaration it can see.
 * - a comma sequence resolves to its last expression (`const S = (0, Schema)`
 *   is the same alias as `const S = Schema`).
 * - destructuring from a resolvable initializer (`const { make } = Workflow`,
 *   `const { make: m } = Workflow`, `const { ['make']: m } = Workflow` — a
 *   computed pattern key is walked when it folds to a static string).
 * - member access: identifier properties and computed keys that fold to a
 *   static string (`Workflow['make']`, `Workflow['ma' + 'ke']`,
 *   `Workflow[Symbol.for('make')]`); the first member taken off a namespace
 *   import becomes the imported name. A computed key that does NOT fold — a
 *   variable subscript — never has its member name guessed from the
 *   variable's identifier: that would read `S[decoder]` as the member
 *   `decoder`.
 * - `.bind` / `.call` / `.apply` on a resolved value — as a member or as the
 *   entire callee call — forward to the same origin (`Workflow.make.bind(W)`).
 * - TS expression wrappers (`as`, `satisfies`, `!`, `<Type>`, instantiation)
 *   are transparent.
 *
 * Anything else — an object literal, a function, a call with a non-forwarding
 * callee, a parameter, a local `const` shadowing an import — resolves to
 * `null` (see the depth-limit note for the overflow case). `null` is
 * deliberately "undetermined", not "not an import": a caller that needs
 * fail-closed semantics treats a member or call chain rooted in a
 * module-local binding whose origin is null as a reportable can't-decide
 * (schema-declaration-location does exactly that).
 *
 * The resolver is deliberately self-contained (no import of `MakeBoundary.ts`):
 * it is mirrored byte-identically into the core plugin, which cannot depend on
 * the effect-workflow package, and any plugin that gates on import origin
 * (make-boundary, no-effect-service, schema-declaration-location) imports this
 * single contract. `getScope` is the scope-lookup closure
 * (`context.sourceCode.getScope`), which makes the resolver shadow-correct: a
 * reference resolves through its own binding, never through a same-scope
 * redeclaration.
 */

/** The origin of a value: the module it was imported from plus the export path. */
export interface ImportOrigin {
  /** The module specifier exactly as the import declaration writes it. */
  readonly source: string
  /**
   * The exported name the value denotes. `null` only for a namespace import
   * (or a memberless alias chain) that has not yet had a member taken off it.
   */
  readonly importedName: string | null
  /** The member path beyond the imported binding (`Workflow.make` → `['make']`). */
  readonly path: readonly string[]
}

/**
 * The flattened member path of an origin: the imported name (when a member has
 * been taken off a namespace or a named binding was reached) followed by the
 * dotted path. `Workflow.make` is `['Workflow', 'make']`, `const { make } =
 * Workflow` followed by a call is `['Workflow', 'make']`, and
 * `import * as W …; W.make` is `['make']`. Callers match on this sequence —
 * the first element names the imported binding, the last names the member the
 * expression currently denotes.
 */
export const originMemberSequence = (origin: ImportOrigin): readonly string[] =>
  origin.importedName === null ? origin.path : [origin.importedName, ...origin.path]

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly {
    readonly identifier: ESTree.Node
    readonly resolved: { readonly defs: readonly DefinitionLike[] } | null
  }[]
}

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node
  readonly parent: ESTree.Node | null
  /** The binding identifier a pattern declaration declares (`name` of the def). */
  readonly name: ESTree.Node | null
}

type IdentifierNode = ESTree.Node & { readonly type: 'Identifier'; readonly name: string }
type MemberExpressionNode = ESTree.Node & {
  readonly type: 'MemberExpression'
  readonly object: ESTree.Node
  readonly property: ESTree.Node
  readonly computed: boolean
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

const isIdentifier = (node: ESTree.Node): node is IdentifierNode => node.type === 'Identifier'

const isMemberExpression = (node: ESTree.Node): node is MemberExpressionNode => node.type === 'MemberExpression'

const isVariableDeclarator = (node: ESTree.Node): node is ESTree.VariableDeclarator =>
  node.type === 'VariableDeclarator'

/**
 * The variable a reference identifier resolves to: the reference's own
 * `resolved` binding, found by identity in the scope tree. Name-based scope
 * lookups merge same-scope re-declarations (an import plus a shadowing const
 * collapse into one variable), so only the reference knows the shadow.
 */
const variableOfIdentifier = (
  identifier: IdentifierNode,
  getScope: (node: ESTree.Node) => unknown,
): { readonly defs: readonly DefinitionLike[] } | null => {
  const scopeValue: unknown = getScope(identifier)
  let scope: ScopeLike | null = isScopeLike(scopeValue) ? scopeValue : null
  while (scope !== null) {
    const found = scope.references.find((reference) => reference.identifier === identifier)
    if (found !== undefined && found.resolved !== null) {
      return { defs: found.resolved.defs }
    }
    if (found !== undefined) return null
    scope = scope.upper
  }
  return null
}

/** The member names that forward, rather than extend, an origin. */
const FORWARDING_MEMBERS: Readonly<Record<string, true>> = {
  bind: true,
  call: true,
  apply: true,
}

/** TS wrappers that carry an expression without changing what it denotes. */
const TS_EXPRESSION_WRAPPERS: Readonly<Record<string, true>> = {
  TSAsExpression: true,
  TSSatisfiesExpression: true,
  TSNonNullExpression: true,
  TSTypeAssertion: true,
  TSInstantiationExpression: true,
}

const isExpressionWrapper = (node: ESTree.Node): node is ESTree.Node & { readonly expression: ESTree.Node } =>
  TS_EXPRESSION_WRAPPERS[node.type] === true

const unwrapExpression = (node: ESTree.Node): ESTree.Node => {
  let current = node
  while (isExpressionWrapper(current)) current = current.expression
  return current
}

/**
 * The statically known string value of an expression that evaluates to a
 * string: a string literal, a template with no substitutions, a `+`
 * concatenation of two such, or `Symbol.for('name')`. Anything not foldable
 * from syntax alone is `null` — never a guessed name. The `Symbol.for` fold is
 * the well-known-symbol member addressing: `S[Symbol.for('Struct')]` names the
 * same member as `S.Struct`. A shadowed `Symbol` binding would break the fold —
 * the same permissiveness the resolver already extends to local aliases.
 */
const staticStringValue = (node: ESTree.Node | null, depth: number = 0): string | null => {
  if (node === null || depth > 64) return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = staticStringValue(node.left, depth + 1)
    if (left === null) return null
    const right = staticStringValue(node.right, depth + 1)
    return right === null ? null : left + right
  }
  if (node.type === 'CallExpression' && node.arguments.length === 1) {
    const argument = node.arguments[0]
    if (
      argument !== undefined &&
      argument.type === 'Literal' &&
      typeof argument.value === 'string' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'Symbol' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'for'
    ) {
      return argument.value
    }
  }
  return null
}

/**
 * The declared member name of a member expression: an identifier property in a
 * non-computed position, or a computed property whose key folds to a static
 * string (`S['Union']`, `S['Stru' + 'ct']`, `S[Symbol.for('Struct')]`).
 * Everything else — a variable subscript `S[key]` — is `null`: the member is
 * not statically known. Never fall back to the subscript variable's name; that
 * would read `S[decoder]` as the member `decoder` and misclassify a codec use
 * as a schema construction.
 */
const memberNameOf = (node: MemberExpressionNode): string | null => {
  const property = node.property
  if (!node.computed && property.type === 'Identifier') return property.name
  return staticStringValue(property)
}

/**
 * The alias-chain ladder guard. 64 levels of alias/member indirection is
 * beyond any real chain; a chain that exhausts it resolves to `null` — the
 * "undetermined" value, not "definitely not an import". Callers that must
 * fail closed treat that exhausted-`null` the same as any other unresolved
 * module-local chain (schema-declaration-location reports it), so a deep
 * ladder can no longer park a schema silently. Tune the cap, never the
 * semantics: a depth overflow is a report, not a pass.
 */
const MAX_DEPTH = 64

/**
 * What this expression ultimately denotes: `{ source, importedName, path }`
 * for an identifier or member chain that reaches an import binding, `null`
 * for everything the resolver cannot prove — my "undetermined", not "this is
 * not an import".
 */
export const resolveImportOrigin = (
  node: ESTree.Node,
  getScope: (node: ESTree.Node) => unknown,
  depth: number = 0,
): ImportOrigin | null => {
  if (depth > MAX_DEPTH) return null
  node = unwrapExpression(node)
  if (isIdentifier(node)) return resolveIdentifierOrigin(node, getScope, depth)
  // `(0, Schema)` and `(side, chain)` evaluate to their last expression:
  // the sequence is the alias it ends on.
  if (node.type === 'SequenceExpression') {
    const last = node.expressions[node.expressions.length - 1]
    return last === undefined ? null : resolveImportOrigin(last, getScope, depth + 1)
  }
  if (isMemberExpression(node)) {
    const object = resolveImportOrigin(node.object, getScope, depth + 1)
    if (object === null) return null
    const member = memberNameOf(node)
    if (member === null || FORWARDING_MEMBERS[member] === true) return object
    return object.importedName === null
      ? { ...object, importedName: member }
      : { ...object, path: [...object.path, member] }
  }
  // A call forwards only when its callee is a forwarding member
  // (`Workflow.make.bind(Workflow)`). Any other call executes code and its
  // result is a value born here, not an import alias.
  if (node.type === 'CallExpression' && isMemberExpression(node.callee)) {
    const member = memberNameOf(node.callee)
    if (member !== null && FORWARDING_MEMBERS[member] === true) {
      return resolveImportOrigin(node.callee.object, getScope, depth + 1)
    }
  }
  return null
}

const resolveIdentifierOrigin = (
  identifier: IdentifierNode,
  getScope: (node: ESTree.Node) => unknown,
  depth: number,
): ImportOrigin | null => {
  const variable = variableOfIdentifier(identifier, getScope)
  if (variable === null) return null
  // A same-scope redeclaration shadows an import: the oxc defs hold both
  // bindings with the later declaration last, and only the last one resolves —
  // the same last-def rule the old kernel used with `defs[defs.length - 1]`
  // for its callee-object check. A resolution never falls through to an
  // earlier def.
  const def = variable.defs[variable.defs.length - 1]
  if (def === undefined) return null
  if (def.type === 'ImportBinding') {
    const declaration = def.parent
    if (declaration === null || declaration.type !== 'ImportDeclaration') return null
    const source = declaration.source.value
    if (typeof source !== 'string') return null
    const specifier = def.node
    if (specifier.type === 'ImportSpecifier') {
      if (specifier.imported.type !== 'Identifier') return null
      return { source, importedName: specifier.imported.name, path: [] }
    }
    if (specifier.type === 'ImportDefaultSpecifier') return { source, importedName: 'default', path: [] }
    return { source, importedName: null, path: [] }
  }
  if (def.type !== 'Variable') return null
  const declarator = isVariableDeclarator(def.node)
    ? def.node
    : def.parent !== null && isVariableDeclarator(def.parent)
    ? def.parent
    : null
  if (declarator === null) return null
  const declaration = declarator.parent
  // No `kind` gate here: `const S = Schema`, `let S = Schema` and
  // `var S = Schema` are all aliases of the same value for the references a
  // single module can see. The cost — a reassigned `let` resolves to the
  // import it was initialized from — is the approximation already paid for
  // every `const` alias.
  if (declaration === null || declaration.type !== 'VariableDeclaration') return null
  const init = declarator.init
  if (init === null) return null
  const base = resolveImportOrigin(init, getScope, depth + 1)
  if (base === null) return null
  // A destructured binding takes the member named by its pattern key off the
  // initializer's origin: `const { make } = Workflow` and `const { make: m } =
  // Workflow` both resolve `make`/`m` to the `make` member. The def node is
  // the shared declarator (its id is the ObjectPattern), so the property is
  // matched by the value identifier carrying the caller's name.
  if (declarator.id.type === 'ObjectPattern') {
    // oxc defs carry the pattern's binding identifier on `def.name`; match the
    // pattern property whose bound identifier IS that node. AssignmentPattern
    // defaults bind their left identifier. This resolves the shorthand
    // `const { make } = Workflow`, the renamed `const { make: m } = Workflow`,
    // and the computed-literal `const { ['make']: m } = Workflow` to the
    // `make` member of the initializer's origin. An unfoldable computed key
    // steps over (null), never guessing a member name.
    const bound = def.name
    if (bound === null) return null
    for (const property of declarator.id.properties) {
      if (property.type !== 'Property') continue
      const key = property.key
      const keyName = !property.computed && key.type === 'Identifier' ? key.name : staticStringValue(key)
      if (keyName === null) continue
      let binding: ESTree.Node = property.value
      if (binding.type === 'AssignmentPattern') {
        if (binding.left.type !== 'Identifier') continue
        binding = binding.left
      }
      if (binding !== bound) continue
      return base.importedName === null
        ? { ...base, importedName: keyName }
        : { ...base, path: [...base.path, keyName] }
    }
    return null
  }
  // A simple binding is a pure alias.
  return base
}
