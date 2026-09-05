import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import {
  ACTUAL,
  EXPECTED,
  FIX,
  meta,
  UNRESOLVED_ACTUAL,
  UNRESOLVED_EXPECTED,
  UNRESOLVED_FIX,
  WORKFLOW_FILE_BASENAME,
} from './schema-declaration-location.config.js'
import { isSchemaVocabularyOrigin } from './SchemaVocabulary.js'

export type MessageIds = 'schemaOutsideSchemaFile' | 'unresolvedSchemaChain'

type SchemaVerdict = 'schema' | 'contains' | 'uses' | 'opaque' | 'vocabulary' | 'unresolved'

/** The scope-lookup closure (`context.sourceCode.getScope`). */
type GetScope = (node: ESTree.Node) => unknown

interface ScopeLike {
  readonly upper: ScopeLike | null
  readonly references: readonly {
    readonly identifier: ESTree.Node
    readonly resolved: { readonly defs: readonly DefinitionLike[] } | null
  }[]
}

interface DefinitionLike {
  readonly type: string
  readonly node: ESTree.Node | null
  readonly parent: ESTree.Node | null
}

export const basenameOf = (filename: string): string => {
  const segments = filename.split('/')
  return segments[segments.length - 1] ?? filename
}

/**
 * The member expression (or bare identifier, for a destructured binding) whose
 * chain leads to an import of the Schema vocabulary, walking callee and
 * receiver chains so `S.Struct({...}).pipe(...)` and the curried
 * `Schema.TaggedError<E>()('E', {...})` superclass both resolve to the
 * defining `Schema.<member>`. Resolution is the shared
 * `resolveImportOrigin` contract, not a name match: an alias, a destructure, a
 * namespace import, a computed static-string key, a TS expression wrapper or a
 * comma sequence all resolve to the same origin and are all seen.
 */
export const schemaMemberOf = (node: ESTree.Node | null, getScope: GetScope): ESTree.Node | null => {
  if (node === null) return null
  node = unwrap(node)
  if (node.type === 'MemberExpression') {
    if (resolveImportOrigin(node, getScope) !== null) return node
    return schemaMemberOf(node.object, getScope)
  }
  if (node.type === 'Identifier') return resolveImportOrigin(node, getScope) !== null ? node : null
  if (node.type === 'CallExpression') return schemaMemberOf(node.callee, getScope)
  return null
}

/**
 * Schema members that consume a schema and return a non-schema value — a
 * decoder, an encoder, an arbitrary, or a JSON-schema document. A const
 * initialized to one of these is a *use* of a schema, not a declaration, so
 * it is out of scope for the placement rule.
 *
 * The codec entries are the complete `export const decode*` / `encode*` surface
 * of `repos/effect/packages/effect/src/Schema.ts` — 29 exports — minus the three
 * that return a schema rather than consume one: `decodeTo`, `encodeTo` and
 * `encodeKeys` are transformations, so a const bound to one IS a declaration.
 * An incomplete list here is a false positive, not a miss: this rule reported a
 * legitimate `S.encodeUnknownExit` codec as a misplaced declaration while
 * `encodeUnknownExit` was absent, so the list is derived from the vendored
 * source and never extended by hand from memory.
 */
export const SCHEMA_USE_MEMBERS: Record<string, true> = {
  decode: true,
  decodeEffect: true,
  decodeExit: true,
  decodeOption: true,
  decodePromise: true,
  decodeResult: true,
  decodeSync: true,
  decodeUnknownEffect: true,
  decodeUnknownExit: true,
  decodeUnknownOption: true,
  decodeUnknownPromise: true,
  decodeUnknownResult: true,
  decodeUnknownSync: true,
  encode: true,
  encodeEffect: true,
  encodeExit: true,
  encodeOption: true,
  encodePromise: true,
  encodeResult: true,
  encodeSync: true,
  encodeUnknownEffect: true,
  encodeUnknownExit: true,
  encodeUnknownOption: true,
  encodeUnknownPromise: true,
  encodeUnknownResult: true,
  encodeUnknownSync: true,
  toArbitrary: true,
  toJsonSchemaDocument: true,
  is: true,
  isSchema: true,
  isSchemaError: true,
  isSchemaAST: true,
}

/**
 * A member named exactly `Schema` on any object — `Result.Schema({...})`,
 * `Atom.Schema(...)`. A module that wraps a domain type in its own schema
 * constructor names it `Schema` by convention, in this tree and in Effect's own
 * (`repos/effect/packages/effect/src/unstable/*` follows it), and what it
 * returns is a schema. Without this the classifier only sees the `effect`
 * Schema vocabulary, and a legitimate `Result.Schema({ success, error })`
 * reads as a non-schema export.
 */
const isDomainSchemaConstructor = (node: ESTree.Node | null): boolean => {
  if (node === null) return false
  if (node.type === 'CallExpression') return isDomainSchemaConstructor(node.callee)
  if (node.type === 'MemberExpression') return node.property.type === 'Identifier' && node.property.name === 'Schema'
  return false
}

/**
 * The combinator a chain denotes, once the chain is known to resolve to
 * a Schema-vocabulary import: `S.Struct`, `E.Schema.Struct`, `Struct` bound
 * from a destructure and `Schema['Union']` all name `Struct`/`Union` here,
 * regardless of how the local was spelled.
 */
const schemaMemberNameOf = (member: ESTree.Node, getScope: GetScope): string | null => {
  const origin = resolveImportOrigin(member, getScope)
  if (origin === null) return null
  if (origin.source === 'effect/Schema') return origin.importedName
  if (origin.source === 'effect' && origin.importedName === 'Schema') return origin.path[0] ?? null
  return null
}

/** TS expression wrappers that carry a chain without changing what it denotes. */
const unwrap = (node: ESTree.Node): ESTree.Node => {
  let current: ESTree.Node = node
  for (;;) {
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSInstantiationExpression' ||
      current.type === 'ChainExpression'
    ) {
      current = current.expression
      continue
    }
    return current
  }
}

/**
 * The classifier's own recursion ladder (local factory bodies, container
 * nesting, member bases). Overflow is `opaque`, NOT a report: a chain this
 * deep has lost its evidence, and irresolution is not evidence. See
 * `MAX_DEPTH` in `@systemfsoftware/oxlint-import-origin` for the resolver-side cap; alias chains
 * are walked cycle-guarded without consuming the ladder (see
 * `classifyIdentifier`), so a deep alias ladder still resolves its base and
 * reports only when that base is positively the vocabulary.
 */
const MAX_CLASSIFY_DEPTH = 64

/**
 * Scale a set of branch verdicts to one: a conditional whose every arm
 * declares declares; a value that can only be a use is a use; a binding that
 * COULD hold a schema either way — one arm declares, one does not — is a
 * mixture the rule does not claim: without a positive vocabulary base there
 * is no evidence, so it folds to silent `opaque`, and the arm-by-arm
 * declarations a consumer cares about are each decided where they stand.
 *
 * `vocabulary` propagates like `schema`: any arm that is the Schema
 * vocabulary makes the whole value vocabulary-shaped, because a consumer may
 * reach any member of it. `[opaque, vocabulary]` must NOT fold to opaque —
 * that would silently widen a schema-producing handle into plain data. An
 * `unresolved` branch (itself vocabulary-rooted) keeps the whole value
 * unresolved: whichever arm runs, a schema MAY be produced by a known base.
 */
const combineBranchVerdicts = (verdicts: readonly SchemaVerdict[]): SchemaVerdict => {
  if (verdicts.includes('unresolved')) return 'unresolved'
  if (verdicts.length === 0) return 'opaque'
  if (verdicts.includes('vocabulary')) return 'vocabulary'
  if (verdicts.every((verdict) => verdict === 'schema')) return 'schema'
  if (verdicts.every((verdict) => verdict === 'contains')) return 'contains'
  if (verdicts.every((verdict) => verdict === 'schema' || verdict === 'contains')) return 'contains'
  if (verdicts.every((verdict) => verdict === 'uses')) return 'uses'
  if (verdicts.every((verdict) => verdict === 'opaque' || verdict === 'uses')) return 'opaque'
  return 'opaque'
}

/**
 * A wrapper holds schemas when any member value is a schema; a use-only
 * wrapper is silent (a config object of codecs imposes no placement of its
 * own, exactly like a single codec const). An unresolved member value — a
 * can't-decide that is itself vocabulary-rooted, and only those reach
 * `unresolved` — keeps the whole wrapper unresolved: the wrapper then wraps a
 * schema a known base produces but a name the rule cannot give.
 *
 * A wrapper whose ANY member is the vocabulary inherits vocabulary: a spread
 * copy `{ ...Schema }` is a schema-producing handle, not plain data. The
 * member access that later reports happens on the vocabulary label.
 */
const containerOfVerdict = (
  values: readonly (ESTree.Node | null)[],
  getScope: GetScope,
  depth: number,
): SchemaVerdict => {
  let holdsSchema = false
  for (const value of values) {
    const verdict = classify(value, getScope, depth + 1)
    if (verdict === 'schema' || verdict === 'contains') holdsSchema = true
    else if (verdict === 'unresolved') return 'unresolved'
    else if (verdict === 'vocabulary') return 'vocabulary'
  }
  return holdsSchema ? 'contains' : 'opaque'
}

/**
 * The one function body shape the rule will read: a concise arrow expression,
 * or a block whose single statement is a return of one expression. Anything
 * longer cannot be decided from one file and is `opaque` — a curried factory,
 * a builder, a helper with control flow. Nothing has been smuggled: there is
 * no evidence a schema is produced here, and the rule must not claim there
 * is. Deliberately no transitive calls: the body's own chain is classified,
 * and if IT is a local call, its body is followed the same way, bounded by
 * `MAX_CLASSIFY_DEPTH`.
 */
function functionBodyVerdict(fn: ESTree.Node, getScope: GetScope, depth: number): SchemaVerdict {
  if (fn.type === 'ArrowFunctionExpression') {
    if (fn.body.type !== 'BlockStatement') return classify(fn.body, getScope, depth + 1)
    return singleReturnVerdict(fn.body, getScope, depth)
  }
  if (fn.type === 'FunctionExpression' || fn.type === 'FunctionDeclaration') {
    if (fn.body === null) return 'opaque'
    return singleReturnVerdict(fn.body, getScope, depth)
  }
  return 'opaque'
}

const singleReturnVerdict = (body: ESTree.BlockStatement, getScope: GetScope, depth: number): SchemaVerdict => {
  const only = body.body.length === 1 ? body.body[0] : undefined
  if (only !== undefined && only.type === 'ReturnStatement' && only.argument !== null) {
    return classify(only.argument, getScope, depth + 1)
  }
  return unfoldableBodyVerdict(body, getScope, depth)
}

/**
 * A body that does not fold to a single return. The rule cannot evaluate the
 * statements, so it cannot say what the call produces — but it can classify what
 * the body RETURNS, following local bindings. A returned schema (`const t =
 * S.Struct(...); return t`) is positive evidence that the call binds a schema,
 * which the one file cannot fully decide: that is the fail-closed `unresolved`.
 *
 * A body that returns the result of a *use* — a JSON-schema document, a decoder —
 * carries no such evidence even though a schema was constructed inside it to feed
 * that use, so it stays silent. The returned value is the discriminator, never
 * whether the vocabulary appears somewhere in the body.
 */
const unfoldableBodyVerdict = (body: ESTree.BlockStatement, getScope: GetScope, depth: number): SchemaVerdict => {
  const returned = body.body.findLast((statement) => statement.type === 'ReturnStatement')
  if (returned === undefined || returned.type !== 'ReturnStatement' || returned.argument === null) return 'opaque'
  const verdict = classify(returned.argument, getScope, depth + 1)
  return verdict === 'schema' || verdict === 'vocabulary' ? 'unresolved' : 'opaque'
}

/**
 * A chain that resolved to an import origin but whose member name is unknown —
 * the computed-key case (`S[key](...)` with an unfoldable `key`). When the
 * base IS the Schema vocabulary, that is exactly the can't-decide a smuggle
 * needs, so it is `unresolved`; a non-Schema base (an `E.foo[key]` chain) is
 * an opaque value of some other module's making.
 */
const schemaBaseVerdictOf = (member: ESTree.Node, getScope: GetScope): SchemaVerdict => {
  const origin = resolveImportOrigin(member, getScope)
  if (origin !== null && isSchemaVocabularyOrigin(origin)) return 'unresolved'
  return 'opaque'
}

const isScopeLike = (value: unknown): value is ScopeLike =>
  typeof value === 'object' && value !== null && 'references' in value && 'upper' in value

const bindingOfIdentifier = (
  identifier: ESTree.Node,
  getScope: GetScope,
): { readonly defs: readonly DefinitionLike[] } | null => {
  const scopeValue: unknown = getScope(identifier)
  let scope: ScopeLike | null = isScopeLike(scopeValue) ? scopeValue : null
  while (scope !== null) {
    const found = scope.references.find((reference) => reference.identifier === identifier)
    if (found !== undefined && found.resolved !== null) return { defs: found.resolved.defs }
    if (found !== undefined) return null
    scope = scope.upper
  }
  return null
}

const declaratorOfDef = (def: DefinitionLike): ESTree.VariableDeclarator | null => {
  if (def.node === null) return null
  if (def.node.type === 'VariableDeclarator') return def.node
  if (def.parent !== null && def.parent.type === 'VariableDeclarator') return def.parent
  return null
}

/**
 * A call of a module-local binding whose body the rule cannot see. An
 * imported callee is a call into another module (decided, silent), a
 * parameter is genuinely opaque (silent), and a module-scope local whose body
 * does not fold to a single return is a curried factory or builder — a
 * can't-decide with NO positive vocabulary evidence, so it is silent
 * `opaque`. The rule reports can't-decides only when the base positively
 * resolves to the schema vocabulary (see `classifyMember` /
 * `schemaBaseVerdictOf`).
 */
const localCaleeVerdict = (callee: ESTree.Node, getScope: GetScope, depth: number): SchemaVerdict => {
  const binding = bindingOfIdentifier(callee, getScope)
  if (binding === null) return 'opaque'
  const def = binding.defs[binding.defs.length - 1]
  if (def === undefined) return 'opaque'
  if (def.type === 'ImportBinding') return 'opaque'
  if (def.type === 'FunctionName' && def.node !== null && def.node.type === 'FunctionDeclaration') {
    return functionBodyVerdict(def.node, getScope, depth + 1)
  }
  const declarator = declaratorOfDef(def)
  if (declarator === null) return 'opaque'
  const initNode = declarator.init
  if (initNode === null) return 'opaque'
  const init = unwrap(initNode)
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    return functionBodyVerdict(init, getScope, depth + 1)
  }
  if (init.type === 'Identifier') return classify(init, getScope, depth + 1)
  return 'opaque'
}

const isObjectAssignCall = (node: ESTree.Node): boolean =>
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.object.type === 'Identifier' &&
  node.object.name === 'Object' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'assign'

const classifyCall = (node: ESTree.CallExpression, getScope: GetScope, depth: number): SchemaVerdict => {
  const callee = unwrap(node.callee)
  if (callee.type === 'ArrowFunctionExpression' || callee.type === 'FunctionExpression') {
    return functionBodyVerdict(callee, getScope, depth + 1)
  }
  const member = schemaMemberOf(node, getScope)
  if (member !== null) {
    const memberName = schemaMemberNameOf(member, getScope)
    if (memberName !== null) return SCHEMA_USE_MEMBERS[memberName] === true ? 'uses' : 'schema'
    if (isDomainSchemaConstructor(node)) return 'schema'
    return schemaBaseVerdictOf(member, getScope)
  }
  if (isDomainSchemaConstructor(node)) return 'schema'
  if (isObjectAssignCall(callee) && node.arguments.length > 0) {
    return containerOfVerdict(
      node.arguments.map((argument) => (argument.type === 'SpreadElement' ? argument.argument : argument)),
      getScope,
      depth,
    )
  }
  if (callee.type === 'Identifier') return resolveCaleeVerdict(callee, getScope, depth)
  if (callee.type === 'MemberExpression') return classifyMember(callee, getScope, depth)
  return 'opaque'
}

/**
 * A call whose callee is a plain identifier: resolve the callee's own chain.
 * An imported callee stays silent (a call into another module). A module-local
 * factory with a single-return body is followed (route 12: the call binds the
 * schema). Anything else a module-local binding call is a can't-decide with
 * no vocabulary evidence (a builder whose body the rule cannot fold), and it
 * is silent `opaque`, not a report.
 */
const resolveCaleeVerdict = (callee: ESTree.Node, getScope: GetScope, depth: number): SchemaVerdict => {
  const origin = resolveImportOrigin(callee, getScope)
  if (origin !== null) {
    if (isSchemaVocabularyOrigin(origin) && origin.path.length === 0) return 'opaque'
    return 'schema'
  }
  return localCaleeVerdict(callee, getScope, depth)
}

/**
 * A member expression. A resolved chain classifies by its member name. A
 * chain that resolves to a base origin with an unknown member is the computed-
 * key can't-decide. A chain that does not resolve at all — a member of a local
 * object, of a factory call — classifies its base, so `{ schema:
 * S.Struct(...) }.schema` and `make().inner` carry their base's verdict.
 */
/**
 * The nullary schema VALUES: members whose bare reference already denotes a schema,
 * as opposed to a combinator that must be called to produce one. `Schema.String` is a
 * schema; `Schema.Struct` is a function, and binding it declares nothing.
 *
 * Derived from the vendored `repos/effect/packages/effect/src/Schema.ts` by taking the
 * exports whose declared type is neither a call signature nor generic — never from
 * recall, and re-derivable when the vendored tree moves. An export missing from this
 * list is a documented MISS in the safe direction: a bare reference to it stays silent
 * rather than reporting a binding that declares nothing, which is the defect this list
 * exists to prevent.
 */
const SCHEMA_VALUE_MEMBERS: Record<string, true> = {
  Any: true,
  BigDecimal: true,
  BigDecimalFromString: true,
  BigInt: true,
  BigIntFromString: true,
  Boolean: true,
  BooleanFromBit: true,
  Char: true,
  Date: true,
  DateFromMillis: true,
  DateFromString: true,
  DateTimeUtc: true,
  DateTimeUtcFromDate: true,
  DateTimeUtcFromMillis: true,
  DateTimeUtcFromString: true,
  DateTimeZoned: true,
  DateTimeZonedFromString: true,
  Duration: true,
  DurationFromMillis: true,
  DurationFromNanos: true,
  DurationFromString: true,
  Error: true,
  File: true,
  Finite: true,
  FiniteFromString: true,
  FormData: true,
  Int: true,
  Json: true,
  MutableJson: true,
  Natural: true,
  Never: true,
  NonEmptyString: true,
  Null: true,
  Number: true,
  NumberFromString: true,
  ObjectKeyword: true,
  RegExp: true,
  String: true,
  StringFromBase64: true,
  StringFromBase64Url: true,
  StringFromHex: true,
  StringFromUriComponent: true,
  Symbol: true,
  TimeZone: true,
  TimeZoneFromString: true,
  TimeZoneNamed: true,
  TimeZoneNamedFromString: true,
  TimeZoneOffset: true,
  Trim: true,
  Trimmed: true,
  URL: true,
  URLFromString: true,
  URLSearchParams: true,
  Uint8Array: true,
  Uint8ArrayFromBase64: true,
  Uint8ArrayFromBase64Url: true,
  Uint8ArrayFromHex: true,
  Undefined: true,
  Unknown: true,
  UnknownFromJsonString: true,
  Void: true,
}

const classifyMember = (node: ESTree.MemberExpression, getScope: GetScope, depth: number): SchemaVerdict => {
  const member = schemaMemberOf(node, getScope)
  if (member !== null) {
    const memberName = schemaMemberNameOf(member, getScope)
    if (memberName !== null) {
      if (SCHEMA_USE_MEMBERS[memberName] === true) return 'uses'
      // A resolved member *call* is decided in `classifyCall` before reaching here, so
      // this is an UNCALLED reference. `Schema.String` already denotes a schema;
      // `Schema.Struct` is the combinator function, and binding it aliases the
      // vocabulary rather than declaring anything, so it carries no obligation here.
      return SCHEMA_VALUE_MEMBERS[memberName] === true ? 'schema' : 'vocabulary'
    }
    if (isDomainSchemaConstructor(node)) return 'schema'
    return schemaBaseVerdictOf(member, getScope)
  }
  if (isDomainSchemaConstructor(node)) return 'schema'
  const base = classify(node.object, getScope, depth + 1)
  if (base === 'vocabulary') return 'unresolved'
  return base
}

/**
 * A bare identifier. An import or vocabulary-destructure origin decides it; a
 * module-local binding is followed to its own init (an alias, a factory, a
 * schema value); a parameter or function value is opaque.
 *
 * A pure alias hop (`const s = t`, wherever t aliases) is followed WITHOUT
 * consuming the classification ladder: it is a linear, acyclic def-chain in a
 * single module, so the ladder must not cap it — a deep alias chain rooted in
 * `Schema` is still a schema-producing chain, and the positive-evidence
 * predicate needs to see its base. Cycles (`let a = a`) are guarded by the
 * declarators already on the current path; a cycle is undecidable and folds
 * to `opaque`, exactly like any other no-evidence shape.
 */
const classifyIdentifier = (
  node: ESTree.Node,
  getScope: GetScope,
  depth: number,
  seen: ReadonlySet<ESTree.VariableDeclarator> = new Set(),
): SchemaVerdict => {
  const origin = resolveImportOrigin(node, getScope)
  if (origin !== null) {
    if (origin.source === 'effect/Schema') {
      const name = origin.importedName
      if (name !== null && origin.path.length === 0) return SCHEMA_USE_MEMBERS[name] === true ? 'uses' : 'schema'
      return 'vocabulary'
    }
    if (origin.source === 'effect' && origin.importedName === 'Schema' && origin.path.length === 0) return 'vocabulary'
    return 'opaque'
  }
  const binding = bindingOfIdentifier(node, getScope)
  if (binding === null) return 'opaque'
  const def = binding.defs[binding.defs.length - 1]
  if (def === undefined) return 'opaque'
  if (def.type === 'ImportBinding') return 'opaque'
  const declarator = declaratorOfDef(def)
  if (declarator === null || declarator.init === null) return 'opaque'
  const init = unwrap(declarator.init)
  if (init.type === 'Identifier') {
    if (seen.has(declarator)) return 'opaque'
    const next = new Set(seen)
    next.add(declarator)
    return classifyIdentifier(init, getScope, depth, next)
  }
  return classify(init, getScope, depth + 1)
}

/**
 * The classifier. `unresolved` — the only reported can't-decide — requires
 * POSITIVE evidence: a member or call chain whose base is the Schema
 * vocabulary (the namespace, an alias of it, or a value already labelled
 * `vocabulary`), where only the member, key, or intermediate hop is what
 * could not be determined. Everything else that cannot be decided —
 * literals, a call into another module, a parameter, a curried factory or
 * multi-statement builder, a chain past the classification depth — is
 * `opaque`: genuinely undetermined values are not schema-placement
 * questions, and the rule must not claim them.
 */
const classify = (node: ESTree.Node | null, getScope: GetScope, depth: number = 0): SchemaVerdict => {
  if (node === null) return 'opaque'
  if (depth > MAX_CLASSIFY_DEPTH) return 'opaque'
  node = unwrap(node)
  switch (node.type) {
    case 'ConditionalExpression':
      return combineBranchVerdicts(
        [node.consequent, node.alternate].map((branch) => classify(branch, getScope, depth + 1)),
      )
    case 'LogicalExpression':
      return combineBranchVerdicts([node.left, node.right].map((branch) => classify(branch, getScope, depth + 1)))
    case 'ObjectExpression':
      return containerOfVerdict(
        node.properties.map((property) => (property.type === 'SpreadElement' ? property.argument : property.value)),
        getScope,
        depth,
      )
    case 'ArrayExpression':
      return containerOfVerdict(
        node.elements.map((
          element,
        ) => (element !== null && element.type === 'SpreadElement' ? element.argument : element)),
        getScope,
        depth,
      )
    case 'CallExpression':
      return classifyCall(node, getScope, depth)
    case 'MemberExpression':
      return classifyMember(node, getScope, depth)
    case 'Identifier':
      return classifyIdentifier(node, getScope, depth)
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return 'opaque'
    default:
      return 'opaque'
  }
}

/**
 * True when `node` is a schema *declaration*: its defining `Schema.<member>`
 * is a schema-producing combinator, not a use combinator — or it is a wrapper
 * whose member values declare schemas. This is the shared predicate the
 * sibling `schema-file-exports-schemas-only` rule classifies exports with; it
 * returns true ONLY for what a schema file may export, never for the
 * unresolved shape.
 */
export const isSchemaDeclaration = (node: ESTree.Node | null, getScope: GetScope): boolean => {
  const verdict = classify(node, getScope)
  return verdict === 'schema' || verdict === 'contains'
}

/**
 * The subset of `SCHEMA_USE_MEMBERS` that returns a *predicate* over a
 * schema rather than a decoder/encoder: `S.is`, `S.isSchema`,
 * `S.isSchemaError`, `S.isSchemaAST`. A guard does not consume its schema
 * into a use — it returns a boolean over it — so the sibling rule that
 * evicts codecs from a schema file leaves guards next to their schema.
 */
export const SCHEMA_PREDICATE_MEMBERS: Record<string, true> = {
  is: true,
  isSchema: true,
  isSchemaError: true,
  isSchemaAST: true,
}

const fieldNameOf = (element: ESTree.PropertyDefinition, className: string | null): string => {
  const key = element.key
  const keyName = key.type === 'Identifier'
    ? key.name
    : key.type === 'Literal' && typeof key.value === 'string'
    ? key.value
    : null
  if (className !== null && keyName !== null) return `${className}.${keyName}`
  return className ?? keyName ?? 'class field'
}

/** The bound identifiers of a declarator id: one report per binding that holds a schema. */
const boundNamesOf = (pattern: ESTree.Node): readonly { readonly node: ESTree.Node; readonly name: string }[] => {
  if (pattern.type === 'Identifier') return [{ node: pattern, name: pattern.name }]
  if (pattern.type === 'AssignmentPattern') return boundNamesOf(pattern.left)
  const out: { readonly node: ESTree.Node; readonly name: string }[] = []
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      if (property.type === 'Property') out.push(...boundNamesOf(property.value))
      else out.push(...boundNamesOf(property.argument))
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      if (element !== null) out.push(...boundNamesOf(element))
    }
  }
  return out
}

/**
 * The default expressions a pattern binds when its source lacks the key: an
 * `AssignmentPattern` right side, found at any depth of an ObjectPattern or
 * ArrayPattern id (`const { zz = S.Struct({...}) } = {}`). The bound name is
 * the left identifier; the value is the expression the default evaluates.
 */
const patternDefaultsOf = (
  pattern: ESTree.Node,
): { readonly bound: { readonly node: ESTree.Node; readonly name: string }; readonly value: ESTree.Node }[] => {
  const out: { readonly bound: { readonly node: ESTree.Node; readonly name: string }; readonly value: ESTree.Node }[] =
    []
  const collect = (node: ESTree.Node): void => {
    if (node.type === 'ObjectPattern') {
      for (const property of node.properties) {
        if (property.type !== 'Property') continue
        const value = property.value
        if (value.type === 'AssignmentPattern') {
          if (value.left.type === 'Identifier') {
            out.push({ bound: { node: value.left, name: value.left.name }, value: value.right })
          }
        } else if (value.type === 'ObjectPattern' || value.type === 'ArrayPattern') {
          collect(value)
        }
      }
    } else if (node.type === 'ArrayPattern') {
      for (const element of node.elements) {
        if (element === null) continue
        if (element.type === 'AssignmentPattern') {
          if (element.left.type === 'Identifier') {
            out.push({ bound: { node: element.left, name: element.left.name }, value: element.right })
          }
        } else if (element.type === 'ObjectPattern' || element.type === 'ArrayPattern') {
          collect(element)
        }
      }
    }
  }
  collect(pattern)
  return out
}

/**
 * Schema declarations are module-scope constructions: a class extending a
 * Schema factory, a module-scope const initialized to a `Schema.<member>(...)`
 * call, a class field whose initializer is one, a destructured pattern
 * whose initializer is one, and an object/array wrapper that holds one. A
 * schema bound inside a function body is deliberately NOT recorded here —
 * the value it denotes is created at call time, so the module has no
 * schema *value* to place. `unresolved` — a can't-decide with a positively
 * vocabulary-rooted base — is reported with its own message; `opaque` never
 * reports.
 *
 * The `if (import.meta.vitest)` block is the single block exemption: a
 * module-scope fixture that only runs in tests is a deliberate exception the
 * file's purpose grants, and the guard is keyed to that exact positive shape
 * (`import.meta.vitest !== void 0`). Any other block that builds a schema
 * and binds it at module scope is a smuggling route and is reported.
 */
export const schemaDeclarationLocation = defineRule({
  meta,
  create(context: Context) {
    const basename = basenameOf(context.filename)
    if (basename.endsWith('.schema.ts') || WORKFLOW_FILE_BASENAME.test(basename)) return {}
    const getScope: GetScope = context.sourceCode.getScope
    return {
      Program(node: ESTree.Program) {
        const report = (id: ESTree.Node, name: string, messageId: MessageIds): void =>
          context.report({
            node: id,
            messageId,
            data: messageId === 'unresolvedSchemaChain'
              ? { name, expected: UNRESOLVED_EXPECTED, actual: UNRESOLVED_ACTUAL, fix: UNRESOLVED_FIX }
              : { name, expected: EXPECTED, actual: ACTUAL, fix: FIX },
          })

        const verdictReport = (id: ESTree.Node, name: string, verdict: SchemaVerdict): void => {
          if (verdict === 'opaque' || verdict === 'uses' || verdict === 'vocabulary') return
          report(id, name, verdict === 'unresolved' ? 'unresolvedSchemaChain' : 'schemaOutsideSchemaFile')
        }

        const isImportMetaVitestMember = (node: ESTree.Node | null): boolean =>
          node !== null &&
          node.type === 'MemberExpression' &&
          !node.computed &&
          node.object.type === 'MetaProperty' &&
          node.object.meta.type === 'Identifier' &&
          node.object.meta.name === 'import' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'meta' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'vitest'

        const isUndefinedSentinel = (node: ESTree.Node): boolean =>
          (node.type === 'UnaryExpression' && node.operator === 'void' && node.argument.type === 'Literal' &&
            node.argument.value === 0) ||
          (node.type === 'Literal' && node.value === null) ||
          (node.type === 'Identifier' && node.name === 'undefined')

        const isImportMetaVitestTest = (test: ESTree.Node | null): boolean => {
          if (isImportMetaVitestMember(test)) return true
          if (test !== null && test.type === 'BinaryExpression') {
            const binary = test
            if (binary.operator !== '!==' && binary.operator !== '!=') return false
            return (
              (isImportMetaVitestMember(binary.left) && isUndefinedSentinel(binary.right)) ||
              (isUndefinedSentinel(binary.left) && isImportMetaVitestMember(binary.right))
            )
          }
          return false
        }

        const reportClassDeclaration = (declaration: ESTree.Node): void => {
          if (declaration.type !== 'ClassDeclaration') return
          if (declaration.id !== null) {
            verdictReport(declaration.id, declaration.id.name, classify(declaration.superClass, getScope))
          }
          for (const element of declaration.body.body) {
            if (element.type !== 'PropertyDefinition' || element.value === null || element.value === undefined) continue
            verdictReport(
              element,
              fieldNameOf(element, declaration.id?.name ?? null),
              classify(element.value, getScope),
            )
          }
        }

        const reportVariableDeclaration = (declaration: ESTree.VariableDeclaration): void => {
          for (const declarator of declaration.declarations) {
            const verdict = classify(declarator.init, getScope)
            for (const bound of boundNamesOf(declarator.id)) verdictReport(bound.node, bound.name, verdict)
            if (verdict === 'opaque' || verdict === 'uses') {
              for (const fallback of patternDefaultsOf(declarator.id)) {
                verdictReport(fallback.bound.node, fallback.bound.name, classify(fallback.value, getScope))
              }
            }
          }
        }

        const visitStatement = (statement: ESTree.Node): void => {
          let declaration: ESTree.Node | null = statement
          if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
            declaration = statement.declaration
          }
          if (
            declaration !== null && declaration.type !== 'ImportDeclaration' &&
            declaration.type !== 'FunctionDeclaration'
          ) {
            if (declaration.type === 'ClassDeclaration') reportClassDeclaration(declaration)
            else if (declaration.type === 'VariableDeclaration') reportVariableDeclaration(declaration)
            else if (
              declaration.type === 'ExpressionStatement' &&
              declaration.expression.type === 'AssignmentExpression' &&
              declaration.expression.operator === '=' &&
              declaration.expression.left.type === 'Identifier'
            ) {
              verdictReport(
                declaration.expression.left,
                declaration.expression.left.name,
                classify(declaration.expression.right, getScope),
              )
            } else if (statement.type === 'ExportDefaultDeclaration') {
              verdictReport(declaration, 'default', classify(declaration, getScope))
            }
          }
          descendInto(statement, visitStatement)
        }

        const descendInto = (statement: ESTree.Node, visit: (node: ESTree.Node) => void): void => {
          switch (statement.type) {
            case 'BlockStatement':
              for (const nested of statement.body) visit(nested)
              break
            case 'IfStatement':
              if (isImportMetaVitestTest(statement.test)) return
              visit(statement.consequent)
              if (statement.alternate !== null) visit(statement.alternate)
              break
            case 'ForStatement':
              if (statement.init !== null && statement.init.type === 'VariableDeclaration') visit(statement.init)
              visit(statement.body)
              break
            case 'ForInStatement':
            case 'ForOfStatement':
              if (statement.left.type === 'VariableDeclaration') visit(statement.left)
              visit(statement.body)
              break
            case 'WhileStatement':
            case 'DoWhileStatement':
              visit(statement.body)
              break
            case 'TryStatement':
              for (const nested of statement.block.body) visit(nested)
              if (statement.handler !== null) { for (const nested of statement.handler.body.body) visit(nested) }
              if (statement.finalizer !== null) { for (const nested of statement.finalizer.body) visit(nested) }
              break
            case 'SwitchStatement':
              for (const switchCase of statement.cases) {
                for (const nested of switchCase.consequent) visit(nested)
              }
              break
            case 'LabeledStatement':
              visit(statement.body)
              break
            default:
              break
          }
        }

        for (const statement of node.body) visitStatement(statement)
      },
    }
  },
})
