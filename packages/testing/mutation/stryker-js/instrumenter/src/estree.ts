// oxlint-disable typescript/no-unsafe-type-assertion typescript/no-unnecessary-type-assertion
// ^ An AST toolkit: builders and a walker over plain oxc nodes whose shapes the
// type system cannot express (estree unions vs oxc serializer output).
/**
 * ESTree toolkit — node builders, kind classification and a walker with
 * parent-chain paths. The walker replaces the previous traversal stack: oxc hands
 * back standard ESTree, so the instrumenter owns the traversal instead of
 * without pulling scope machinery along.
 */
import type {
  BlockStatement,
  Expression,
  Identifier,
  Node,
  Program,
  Statement,
  TemplateElement,
  UnaryOperator,
} from 'estree'

import { computeLineStarts, positionFromOffset } from './Syntax.js'

export type { Expression, Program, Statement }

// ---------------------------------------------------------------------------
// Kind classification
// ---------------------------------------------------------------------------

const EXPRESSION_KINDS: ReadonlySet<string> = new Set([
  'ArrayExpression',
  'ArrowFunctionExpression',
  'AwaitExpression',
  'BinaryExpression',
  'CallExpression',
  'ChainExpression',
  'ClassExpression',
  'ConditionalExpression',
  'FunctionExpression',
  'Identifier',
  'Import',
  'ImportExpression',
  'JSXElement',
  'JSXFragment',
  'Literal',
  'LogicalExpression',
  'MetaProperty',
  'NewExpression',
  'ObjectExpression',
  'PrivateIdentifier',
  'SequenceExpression',
  'Super',
  'TaggedTemplateExpression',
  'TemplateLiteral',
  'ThisExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'UnaryExpression',
  'UpdateExpression',
  'YieldExpression',
])

const STATEMENT_KINDS: ReadonlySet<string> = new Set([
  'BlockStatement',
  'BreakStatement',
  'ClassDeclaration',
  'ContinueStatement',
  'DebuggerStatement',
  'DoWhileStatement',
  'ExportAllDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'ExpressionStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'FunctionDeclaration',
  'IfStatement',
  'ImportDeclaration',
  'LabeledStatement',
  'ReturnStatement',
  'SwitchStatement',
  'ThrowStatement',
  'TSExportAssignment',
  'TSImportEqualsDeclaration',
  'TSInterfaceDeclaration',
  'TSModuleDeclaration',
  'TSTypeAliasDeclaration',
  'VariableDeclaration',
  'WhileStatement',
  'WithStatement',
])

/**
 * The node's [start, end) offsets. oxc is invoked with `range: true`, so every
 * parsed node carries one; synthesized builders omit it.
 */
export function spanOf(node: Node): { start: number; end: number } | undefined {
  const range = node.range
  if (range === undefined) return undefined
  return { start: range[0], end: range[1] }
}

/**
 * The node's `type` tag, for checks against kinds outside the @types/estree
 * union (TS and JSX extensions oxc emits).
 */
export function nodeType(node: unknown): string | undefined {
  return isAstNode(node) ? node.type : undefined
}

export function isExpressionKind(node: Node | undefined | null): boolean {
  return node !== undefined && node !== null && EXPRESSION_KINDS.has(node.type)
}

export function isStatementKind(node: Node | undefined | null): boolean {
  return node !== undefined && node !== null && STATEMENT_KINDS.has(node.type)
}

// ---------------------------------------------------------------------------
// Builders — the shapes oxc's ESTree serializer emits, so a synthesized node
// is indistinguishable from a parsed one when printed.
// ---------------------------------------------------------------------------

type Loc = { start: number; end: number } | undefined

function mark<T extends object>(node: T, loc: Loc): T {
  if (loc !== undefined) {
    return Object.assign(node, { start: loc.start, end: loc.end })
  }
  return node
}

export function identifier(name: string, loc?: Loc): Identifier {
  return mark({ type: 'Identifier', name }, loc)
}

export function stringLiteral(value: string, loc?: Loc): Expression {
  return mark({ type: 'Literal', value }, loc)
}

export function booleanLiteral(value: boolean, loc?: Loc): Expression {
  return mark({ type: 'Literal', value }, loc)
}

export function regExpLiteral(pattern: string, flags: string, loc?: Loc): Expression {
  return mark({ type: 'Literal', value: null, regex: { pattern, flags } }, loc)
}

export function arrayExpression(elements: ReadonlyArray<Expression | null> = [], loc?: Loc): Expression {
  const elementList: Expression[] = []
  for (const element of elements) {
    if (element !== null) elementList.push(element)
  }
  return mark<Expression>({ type: 'ArrayExpression', elements: elementList }, loc)
}

export function callExpression(
  callee: Expression,
  args: ReadonlyArray<Expression> = [],
  optional = false,
  loc?: Loc,
): Expression {
  return mark<Expression>({ type: 'CallExpression', callee, arguments: [...args], optional }, loc)
}

export function newExpression(callee: Expression, args: ReadonlyArray<Expression> = [], loc?: Loc): Expression {
  return mark<Expression>({ type: 'NewExpression', callee, arguments: [...args] }, loc)
}

export function memberExpression(
  object: Expression,
  property: Expression,
  computed = false,
  optional = false,
  loc?: Loc,
): Expression {
  return mark<Expression>({ type: 'MemberExpression', object, property, computed, optional }, loc)
}

export function optionalMemberExpression(
  object: Expression,
  property: Expression,
  computed: boolean,
  optional: boolean,
  loc?: Loc,
): Expression {
  return mark<Expression>({ type: 'MemberExpression', object, property, computed, optional }, loc)
}

export function optionalCallExpression(
  callee: Expression,
  args: ReadonlyArray<Expression>,
  optional: boolean,
  loc?: Loc,
): Expression {
  return mark<Expression>({ type: 'CallExpression', callee, arguments: [...args], optional }, loc)
}

export function arrowFunctionExpression(
  params: ReadonlyArray<Identifier>,
  body: Expression | Statement,
  loc?: Loc,
): Expression {
  // Callers pass `Expression` or `blockStatement()` output; estree narrows the
  // field to `BlockStatement | Expression`, which this construction satisfies.
  const fnBody = body as BlockStatement | Expression
  return mark<Expression>(
    {
      type: 'ArrowFunctionExpression',
      params: [...params],
      body: fnBody,
      async: false,
      expression: fnBody.type !== 'BlockStatement',
    },
    loc,
  )
}

export function blockStatement(body: ReadonlyArray<Statement>, loc?: Loc): Statement {
  return mark<Statement>({ type: 'BlockStatement', body: [...body] }, loc)
}

export function expressionStatement(expression: Expression, loc?: Loc): Statement {
  return mark<Statement>({ type: 'ExpressionStatement', expression }, loc)
}

export function ifStatement(
  test: Expression,
  consequent: Statement,
  alternate?: Statement | null,
  loc?: Loc,
): Statement {
  return mark<Statement>({ type: 'IfStatement', test, consequent, alternate: alternate ?? null }, loc)
}

export function variableDeclarator(id: Identifier, init: Expression | null, loc?: Loc): VariableDeclaratorNode {
  return mark<VariableDeclaratorNode>({ type: 'VariableDeclarator', id, init }, loc)
}

export function variableDeclaration(
  kind: 'const' | 'let' | 'var',
  declarations: ReadonlyArray<VariableDeclaratorNode>,
  loc?: Loc,
): Statement {
  return mark<Statement>({ type: 'VariableDeclaration', kind, declarations: [...declarations] }, loc)
}

export function returnStatement(argument: Expression | null, loc?: Loc): Statement {
  return mark<Statement>({ type: 'ReturnStatement', argument }, loc)
}

export function sequenceExpression(expressions: ReadonlyArray<Expression>, loc?: Loc): Expression {
  return mark<Expression>({ type: 'SequenceExpression', expressions: [...expressions] }, loc)
}

export function conditionalExpression(
  test: Expression,
  consequent: Expression,
  alternate: Expression,
  loc?: Loc,
): Expression {
  return mark<Expression>({ type: 'ConditionalExpression', test, consequent, alternate }, loc)
}

export function unaryExpression(
  operator: Extract<UnaryOperator, '+' | '-' | '!' | '~' | 'typeof' | 'void' | 'delete'>,
  argument: Expression,
  loc?: Loc,
): Expression {
  // Synthesized unaries are always prefixed; the postfix case is UpdateExpression.
  return mark<Expression>({ type: 'UnaryExpression', operator, argument, prefix: true }, loc)
}

export function updateExpression(operator: '++' | '--', argument: Expression, prefix: boolean, loc?: Loc): Expression {
  return mark<Expression>({ type: 'UpdateExpression', operator, argument, prefix }, loc)
}

export function templateElement(raw: string, loc?: Loc): TemplateElement {
  // The only synthesized quasi is a single fully-tail element.
  return mark<TemplateElement>({ type: 'TemplateElement', value: { raw, cooked: raw }, tail: true }, loc)
}

export function templateLiteral(
  quasis: ReadonlyArray<TemplateElement>,
  expressions: ReadonlyArray<Expression>,
  loc?: Loc,
): Expression {
  return mark<Expression>({ type: 'TemplateLiteral', quasis: [...quasis], expressions: [...expressions] }, loc)
}

export function switchCase(test: Expression | null, consequent: ReadonlyArray<Statement>, loc?: Loc): SwitchCaseNode {
  return mark<SwitchCaseNode>({ type: 'SwitchCase', test, consequent: [...consequent] }, loc)
}

/**
 * Deep clone of a plain ESTree node. oxc nodes are JSON-shaped, so
 * Deep clone over plain nodes: no prototypes to preserve.
 */
export function cloneNode<T extends Node>(node: T): T {
  return structuredClone(node)
}

interface VariableDeclaratorNode {
  type: 'VariableDeclarator'
  id: Identifier
  init: Expression | null
}

interface SwitchCaseNode {
  type: 'SwitchCase'
  test: Expression | null
  consequent: Statement[]
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface AttachedComment {
  readonly type: 'Line' | 'Block'
  readonly value: string
  readonly start: number
  readonly end: number
  readonly loc?: { start: { line: number; column: number }; end: { line: number; column: number } }
}

/**
 * Attaches every comment to the node it precedes (`leadingComments`) or, when
 * no node follows it, to the node it trails (`trailingComments`). oxc ships
 * comments flat, and the Stryker directive pass reads `node.leadingComments`,
 * so the flat list is folded into the tree once per transform with the file's
 * line table in hand.
 */
export function attachComments(
  root: Node,
  comments: ReadonlyArray<AttachedComment>,
  lineTable: readonly number[],
): void {
  if (comments.length === 0) return
  // The Program root is not a comment host: its span starts at the first
  // statement, so a leading file comment would otherwise attach to it and
  // never print. Candidates are the statements and expressions under it.
  const nodes = collectNodes(root).filter((entry) => entry.node !== root)
  nodes.sort((a, b) => a.start - b.start)
  const leading = new Map<Node, AttachedComment[]>()
  const trailing = new Map<Node, AttachedComment[]>()
  for (const comment of comments) {
    const next = nodes.find((entry) => entry.start >= comment.end)
    if (next !== undefined) {
      pushComment(leading, next.node, comment)
    } else {
      // Same-line trailing comments: host them on the nearest statement so
      // the statement printer (the only emitter of trailing comments) prints
      // them; an expression host would never reach the output.
      const previous = nodes.findLast((entry) => entry.end <= comment.start && isStatementKind(entry.node))
      if (previous !== undefined) pushComment(trailing, previous.node, comment)
    }
  }
  assignComments(leading, lineTable, 'leadingComments')
  assignComments(trailing, lineTable, 'trailingComments')
}

function assignComments(
  map: Map<Node, AttachedComment[]>,
  lineTable: readonly number[],
  field: 'leadingComments' | 'trailingComments',
): void {
  for (const [node, list] of map) {
    const located = list.map((comment) => ({
      ...comment,
      loc: {
        start: positionFromLineTable(comment.start, lineTable),
        end: positionFromLineTable(comment.end, lineTable),
      },
    }))
    Object.assign(node, { [field]: located })
  }
}

function pushComment(map: Map<Node, AttachedComment[]>, node: Node, comment: AttachedComment): void {
  const list = map.get(node)
  if (list === undefined) map.set(node, [comment])
  else list.push(comment)
}

function collectNodes(node: unknown): Array<{ node: Node; start: number; end: number }> {
  const out: Array<{ node: Node; start: number; end: number }> = []
  collect(node, out)
  return out
}

function collect(node: unknown, out: Array<{ node: Node; start: number; end: number }>): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out)
    return
  }
  if (!isAstNode(node)) return
  const startOffset = node['start']
  const endOffset = node['end']
  if (typeof startOffset === 'number' && typeof endOffset === 'number') {
    out.push({ node, start: startOffset, end: endOffset })
  }
  for (const key of Object.keys(node)) {
    if (key === 'leadingComments' || key === 'trailingComments') continue
    collect(node[key], out)
  }
}

export function isAstNode(value: unknown): value is Node & Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
}

// ---------------------------------------------------------------------------
// Line table — delegates to Syntax's line starts; positions here are 1-based
// (The `loc` shape the directive and API-location code compares).
// ---------------------------------------------------------------------------

export function buildLineTable(content: string): readonly number[] {
  return computeLineStarts(content)
}

export function positionFromLineTable(offset: number, lineTable: readonly number[]): { line: number; column: number } {
  const zeroBased = positionFromOffset(lineTable, offset)
  return { line: zeroBased.line + 1, column: zeroBased.column }
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

export interface TraversePath {
  readonly node: Node
  readonly parentPath: TraversePath | null
  readonly parent: Node | undefined
  readonly key: string
  readonly listKey: string | undefined
  skip(): void
  stop(): void
  find(predicate: (path: TraversePath) => boolean): TraversePath | undefined
  getStatementParent(): TraversePath | undefined
  replaceWith(node: Node): void
  is(kind: string): boolean
  isExpression(): boolean
  isStatement(): boolean
}

export interface TraverseVisitors {
  enter?: (path: TraversePath) => void
  exit?: (path: TraversePath) => void
}

interface WalkContext {
  readonly skipped: Set<Node>
  stopped: boolean
}

const SKIP_KEYS: ReadonlySet<string> = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'leadingComments',
  'trailingComments',
])

export function traverse(root: Program | Node, visitors: TraverseVisitors): void {
  const context: WalkContext = { skipped: new Set(), stopped: false }
  visit(root, null, 'root', undefined, visitors, context)
}

function visit(
  node: unknown,
  parentPath: TraversePath | null,
  key: string,
  listKey: string | undefined,
  visitors: TraverseVisitors,
  context: WalkContext,
): void {
  if (context.stopped) return
  if (!isAstNode(node) || context.skipped.has(node)) return

  const path = createPath(node, parentPath, key, listKey, context)
  visitors.enter?.(path)
  if (context.stopped || context.skipped.has(node)) return
  visitChildren(node, path, visitors, context)
  if (context.stopped) return
  visitors.exit?.(path)
}

function visitChildren(
  node: Node & Record<string, unknown>,
  path: TraversePath,
  visitors: TraverseVisitors,
  context: WalkContext,
): void {
  for (const childKey of Object.keys(node)) {
    if (SKIP_KEYS.has(childKey)) continue
    visitChild(node[childKey], path, childKey, visitors, context)
    if (context.stopped) return
  }
}

function visitChild(
  child: unknown,
  path: TraversePath,
  key: string,
  visitors: TraverseVisitors,
  context: WalkContext,
): void {
  if (Array.isArray(child)) {
    for (let i = 0; i < child.length; i++) {
      visit(child[i], path, key, String(i), visitors, context)
      if (context.stopped) return
    }
    return
  }
  if (isAstNode(child)) visit(child, path, key, undefined, visitors, context)
}

function createPath(
  node: Node,
  parentPath: TraversePath | null,
  key: string,
  listKey: string | undefined,
  context: WalkContext,
): TraversePath {
  const path: TraversePath = {
    node,
    parentPath,
    parent: parentPath?.node,
    key,
    listKey,
    skip() {
      context.skipped.add(node)
    },
    stop() {
      context.stopped = true
    },
    find(predicate) {
      // `path.find` includes the path itself: a node that registered as its
      // own placement anchor wins over any ancestor.
      let current: TraversePath | null = path
      while (current !== null) {
        if (predicate(current)) return current
        current = current.parentPath
      }
      return undefined
    },
    getStatementParent() {
      let current: TraversePath | null = parentPath
      while (current !== null) {
        if (isStatementKind(current.node)) return current
        current = current.parentPath
      }
      return undefined
    },
    replaceWith(replacement) {
      replaceInParent(parentPath, key, listKey, replacement)
    },
    is(kind) {
      return node.type === kind
    },
    isExpression() {
      return isExpressionKind(node)
    },
    isStatement() {
      return isStatementKind(node)
    },
  }
  return path
}

function replaceInParent(
  parentPath: TraversePath | null,
  key: string,
  listKey: string | undefined,
  replacement: Node,
): void {
  if (parentPath === null) return
  const parent = parentPath.node
  if (!isAstNode(parent)) return
  // Array descent is inlined in `visitChild`, so a list key is always a single index.
  const index = Number(listKey)
  const container = parent[key]
  if (Array.isArray(container) && Number.isInteger(index)) {
    container[index] = replacement
  }
}
