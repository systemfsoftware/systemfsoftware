/**
 * Transformer — traverses ASTs, asks mutators for mutants and placers to instrument them.
 */
import babel, { File, type NodePath, type types } from '@babel/core'
import { type IgnorerService, type NodePath as IgnorerNodePath } from '@systemfsoftware/stryker-js/Ignorer'
import { INSTRUMENTER_CONSTANTS as ID } from '@systemfsoftware/stryker-js/Mutant'
import { type MutateDescription, type Position } from '@systemfsoftware/stryker-js/Mutant'
import { propertyPath, type StrykerOptions, strykerReportBugUrl } from '@systemfsoftware/stryker-js/Schema'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import path from 'node:path'
import { applyMutant, createMutant, type Mutable, type Mutant } from './Mutator.js'
import { type MutatorContext, type MutatorOptions } from './Mutator.js'
import { allMutators } from './Mutator.js'
import {
  type Ast,
  type AstByFormat,
  AstFormat,
  locationIncluded,
  locationOverlaps,
  type ScriptFormat,
  type SourceLocationInFile,
} from './Syntax.js'
import { PlacementFailed, TransformFailed } from './Transformer.schema.js'
export { PlacementFailed, TransformFailed }

const { types: babelTypes } = babel
const t = babelTypes
type BabelNodePath = NodePath
const STRYKER_NAMESPACE_HELPER = 'stryNS_9fa48'
const COVER_MUTANT_HELPER = 'stryCov_9fa48'
const IS_MUTANT_ACTIVE_HELPER = 'stryMutAct_9fa48'

export interface TransformerOptions extends MutatorOptions {
  ignorers: IgnorerService[]
}

export type MutantCollector = Mutant[]

export function createMutantCollector(): MutantCollector {
  return []
}

export function collect(
  collector: MutantCollector,
  fileName: string,
  original: types.Node,
  mutable: Mutable,
  offset: Position = { line: 0, column: 0 },
): Mutant {
  const mutant = createMutant(
    collector.length.toString(),
    fileName,
    original,
    mutable,
    offset,
  )
  collector.push(mutant)
  return mutant
}

export function hasPlacedMutants(
  collector: readonly Mutant[],
  fileName: string,
): boolean {
  return collector.some(
    (mutant) => mutant.fileName === fileName && mutant.ignoreReason === undefined,
  )
}

const WILDCARD = 'all'
const DEFAULT_REASON = 'Ignored using a comment'

const strykerCommentDirectiveRegex = /^\s?Stryker (disable|restore)(?: (next-line))? ([a-zA-Z, ]+)(?::(.+)?)?/

export type Rule =
  | { readonly kind: 'Root' }
  | {
    readonly kind: 'Ignore'
    readonly mutatorNames: readonly string[]
    readonly line: number | undefined
    readonly ignoreReason: string
    readonly previous: Rule
  }
  | {
    readonly kind: 'Restore'
    readonly mutatorNames: readonly string[]
    readonly line: number | undefined
    readonly previous: Rule
  }

export const rootRule: Rule = { kind: 'Root' }

export function findIgnoreReason(
  rule: Rule,
  mutatorName: string,
  line: number,
): string | undefined {
  const lower = mutatorName.toLowerCase()
  let current: Rule = rule
  for (;;) {
    switch (current.kind) {
      case 'Root':
        return undefined
      case 'Ignore': {
        const lineMatches = current.line === undefined || current.line === line
        const mutatorMatches = current.mutatorNames.includes(lower) ||
          current.mutatorNames.includes(WILDCARD)
        if (lineMatches && mutatorMatches) {
          return current.ignoreReason
        }
        current = current.previous
        break
      }
      case 'Restore': {
        const lineMatches = current.line === undefined || current.line === line
        const mutatorMatches = current.mutatorNames.includes(lower) ||
          current.mutatorNames.includes(WILDCARD)
        if (lineMatches && mutatorMatches) {
          return undefined
        }
        current = current.previous
        break
      }
    }
  }
}

export function processStrykerDirectives(
  rule: Rule,
  node: types.Node,
  allMutatorNames: readonly string[],
  originFileName: string,
): { rule: Rule; warnings: readonly string[] } {
  const nodeWithComments: types.Node & { leadingComments?: readonly types.Comment[] | null } = node
  const leadingComments = nodeWithComments.leadingComments
  if (!leadingComments) {
    return { rule, warnings: [] }
  }
  let current: Rule = rule
  const warnings: string[] = []
  for (const comment of leadingComments) {
    const matchResult = strykerCommentDirectiveRegex.exec(comment.value)
    if (!matchResult) {
      continue
    }
    const directiveType = matchResult[1]
    const scope = matchResult[2]
    const mutators = matchResult[3]
    const optionalReason = matchResult[4]
    if (directiveType === undefined || mutators === undefined) {
      throw new Error('Stryker directive without directive type or mutators')
    }
    let mutatorNames = mutators.split(',').map((mutator) => mutator.trim())
    for (const mutator of mutatorNames) {
      if (mutator === WILDCARD) continue
      if (!allMutatorNames.includes(mutator.toLowerCase())) {
        const commentLoc = comment.loc
        if (commentLoc == null) {
          throw new Error('Comment without location')
        }
        let directiveLabel: string
        if (scope !== undefined && scope !== '') {
          directiveLabel = `${directiveType} ${scope}`
        } else {
          directiveLabel = directiveType
        }
        warnings.push(
          `Unused 'Stryker ${directiveLabel}' directive. Mutator with name '${mutator}' not found. Directive found at: ${originFileName}:${commentLoc.start.line}:${commentLoc.start.column}.`,
        )
      }
    }
    mutatorNames = mutatorNames.map((mutator) => mutator.toLowerCase())
    const reason = (optionalReason ?? DEFAULT_REASON).trim()
    current = applyDirective(current, directiveType, scope, mutatorNames, reason, node.loc)
  }
  return { rule: current, warnings }
}

function applyDirective(
  rule: Rule,
  directiveType: string,
  scope: string | undefined,
  mutatorNames: string[],
  reason: string,
  loc: types.SourceLocation | null | undefined,
): Rule {
  switch (directiveType) {
    case 'disable':
      return applyDisable(rule, scope, mutatorNames, reason, loc)
    case 'restore':
      return applyRestore(rule, scope, mutatorNames, loc)
    default:
      return rule
  }
}

function applyDisable(
  rule: Rule,
  scope: string | undefined,
  mutatorNames: string[],
  reason: string,
  loc: types.SourceLocation | null | undefined,
): Rule {
  switch (scope) {
    case 'next-line':
      return {
        kind: 'Ignore',
        mutatorNames,
        line: getLine(loc),
        ignoreReason: reason,
        previous: rule,
      }
    case undefined:
    default:
      return {
        kind: 'Ignore',
        mutatorNames,
        line: undefined,
        ignoreReason: reason,
        previous: rule,
      }
  }
}

function applyRestore(
  rule: Rule,
  scope: string | undefined,
  mutatorNames: string[],
  loc: types.SourceLocation | null | undefined,
): Rule {
  switch (scope) {
    case 'next-line':
      return {
        kind: 'Restore',
        mutatorNames,
        line: getLine(loc),
        previous: rule,
      }
    case undefined:
    default:
      return {
        kind: 'Restore',
        mutatorNames,
        line: undefined,
        previous: rule,
      }
  }
}

function getLine(loc: types.SourceLocation | null | undefined): number {
  if (loc == null) {
    throw new Error('Babel node without location')
  }
  return loc.start.line
}

function toIgnorerPath(path: BabelNodePath): IgnorerNodePath {
  let parentResult: IgnorerNodePath | null = null
  if (path.parentPath !== null) {
    parentResult = toIgnorerPath(path.parentPath)
  }
  const result: IgnorerNodePath = {
    node: path.node,
    parentPath: parentResult,
    isObjectExpression(): boolean {
      return path.isObjectExpression()
    },
    isCallExpression(): boolean {
      return path.isCallExpression() || path.isOptionalCallExpression()
    },
    isClassProperty(): boolean {
      return path.isClassProperty()
    },
    isClassPrivateProperty(): boolean {
      return path.isClassPrivateProperty()
    },
    isClassAccessorProperty(): boolean {
      return path.isClassAccessorProperty()
    },
  }
  return result
}

/**
 * `@babel/core` exports its `File` class at runtime, but `@types/babel__core`
 * omits it. The declaration lives in this module rather than an ambient
 * `.d.ts` so it travels with the sources: a consumer that compiles this
 * package from source (the workspace's `@systemfsoftware/source` condition,
 * and api-extractor with it) reaches the augmentation through the import
 * graph, which an unreferenced ambient file never joins.
 */
declare module '@babel/core' {
  export class File {
    constructor(
      options: { filename?: string },
      input: { code: string; ast: types.File; inputMap?: unknown },
    )
    public ast: types.File
  }
}

/**
 * Wraps a parsed AST the way Babel's own pipeline does, so
 * `NodePath#buildCodeFrameError` can render a code frame
 * (https://github.com/babel/babel/issues/11889). Without the wrapper a
 * placement failure reports no source context.
 */
export function createBabelFile(
  filename: string,
  code: string,
  ast: types.File,
): File {
  return new File({ filename }, { code, ast })
}

export function isTypeNode(path: babel.NodePath): boolean {
  return (
    path.isTypeAnnotation() ||
    flowTypeAnnotationNodeTypes.includes(path.node.type) ||
    tsTypeAnnotationNodeTypes.includes(path.node.type) ||
    isDeclareVariableStatement(path) ||
    isDeclareModule(path)
  )
}

/**
 * Determines whether or not it is a declare variable statement node.
 * @example
 * declare const foo: 'foo';
 */
function isDeclareVariableStatement(path: babel.NodePath): boolean {
  return path.isVariableDeclaration() && path.node.declare === true
}

/**
 * Determines whether or not a node is a string literal that is the name of a module.
 * @example
 * declare module "express" {};
 */
function isDeclareModule(path: babel.NodePath): boolean {
  return path.isTSModuleDeclaration() && (path.node.declare ?? false)
}

const tsTypeAnnotationNodeTypes: ReadonlyArray<babel.types.Node['type']> = Object.freeze([
  'TSAsExpression',
  'TSInterfaceDeclaration',
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
  'TSDeclareFunction',
  'TSTypeParameterInstantiation',
  'TSTypeParameterDeclaration',
])

const flowTypeAnnotationNodeTypes: ReadonlyArray<babel.types.Node['type']> = Object.freeze([
  'DeclareClass',
  'DeclareFunction',
  'DeclareInterface',
  'DeclareModule',
  'DeclareModuleExports',
  'DeclareTypeAlias',
  'DeclareOpaqueType',
  'DeclareVariable',
  'DeclareExportDeclaration',
  'DeclareExportAllDeclaration',
  'InterfaceDeclaration',
  'OpaqueType',
  'TypeAlias',
  'InterfaceDeclaration',
])

export function isImportDeclaration(path: babel.NodePath): boolean {
  return (
    babelTypes.isTSImportEqualsDeclaration(path.node) || path.isImportDeclaration()
  )
}

/**
 * returns syntax for `global.activeMutant === $mutantId`
 * @param mutantId The id of the mutant to switch
 */
export function mutantTestExpression(
  mutantId: string,
): babel.types.CallExpression {
  return babelTypes.callExpression(babelTypes.identifier(IS_MUTANT_ACTIVE_HELPER), [
    babelTypes.stringLiteral(mutantId),
  ])
}

/**
 * Returns a sequence of mutation coverage counters with an optional last expression.
 *
 * @example (global.__coverMutant__(0, 1), 40 + 2)
 * @param mutants The mutants for which covering syntax needs to be generated
 * @param targetExpression The original expression
 */
export function mutationCoverageSequenceExpression(
  mutants: Iterable<Mutant>,
  targetExpression?: babel.types.Expression,
): babel.types.Expression {
  const mutantIds = [...mutants].map((mutant) => babelTypes.stringLiteral(mutant.id))
  const sequence: babel.types.Expression[] = [
    babelTypes.callExpression(babelTypes.identifier(COVER_MUTANT_HELPER), mutantIds),
  ]
  if (targetExpression) {
    sequence.push(targetExpression)
  }
  return babelTypes.sequenceExpression(sequence)
}

export interface MutantPlacer<TNode extends types.Node = types.Node> {
  name: string
  canPlace(path: NodePath): boolean
  place(path: NodePath<TNode>, appliedMutants: Map<Mutant, types.Node>): void
}

/**
 * Narrows an applied mutant to the node kind a placer emits. `applied()` hands
 * back a plain node — whether it fits this position is the placer's claim, and
 * `canPlace` is what established it, so a mismatch here means the placer was
 * handed a mutant it never accepted.
 */
export function nodeOfKind<TNode extends types.Node>(
  mutant: Mutant,
  node: types.Node,
  isKind: (candidate: types.Node) => candidate is TNode,
  kind: string,
): TNode {
  if (!isKind(node)) {
    throw new Error(`Cannot place mutant ${mutant.id}: expected ${kind}, got ${node.type}`)
  }
  return node
}

// node:path builds a relative path for a diagnostic message; threading Path.Path
// through every placer into a `never`-returning formatter is pure churn (REPO-A2).

export function throwPlacementError(
  error: Error,
  nodePath: NodePath,
  placer: MutantPlacer,
  mutants: Mutant[],
  fileName: string,
): never {
  const location = `${
    path.relative(process.cwd(), fileName)
  }:${nodePath.node.loc?.start.line}:${nodePath.node.loc?.start.column}`
  const message = `${placer.name} could not place mutants with type(s): "${
    new Intl.ListFormat('en').format(mutants.map((mutant) => mutant.mutatorName))
  }"`
  const errorMessage =
    `${location} ${message}. Either remove this file from the list of files to be mutated, or exclude the mutator (using ${
      propertyPath<StrykerOptions>()(
        'mutator',
        'excludedMutations',
      )
    }). Please report this issue at ${strykerReportBugUrl(message)}. Original error: ${error.stack}`
  let builtError = new Error(errorMessage)
  try {
    // `buildCodeFrameError` is kind of flaky, see https://github.com/stryker-mutator/stryker-js/issues/2695
    builtError = nodePath.buildCodeFrameError(errorMessage)
  } catch {
    // Idle, regular error will have to suffice
  }
  throw builtError
}

/**
 * Will set the identifier of anonymous function expressions if is located in a variable declaration.
 * Will treat input as readonly. Returns undefined if not needed.
 * @example
 * const a = function() { }
 * becomes
 * const a = function a() {}
 */
function classOrFunctionExpressionNamedIfNeeded(
  path: NodePath<babel.types.Expression>,
): babel.types.Expression | undefined {
  if (
    (path.isFunctionExpression() || path.isClassExpression()) &&
    !path.node.id
  ) {
    if (
      path.parentPath.isVariableDeclarator() &&
      babelTypes.isIdentifier(path.parentPath.node.id)
    ) {
      path.node.id = path.parentPath.node.id
      return path.node
    } else if (
      path.parentPath.isObjectProperty() &&
      babelTypes.isIdentifier(path.parentPath.node.key) &&
      path.getStatementParent()?.isVariableDeclaration() === true
    ) {
      return path.node
    }
  }
  return
}

/**
 * Will set the identifier of anonymous arrow function expressions if is located in a variable declaration.
 * Will treat input as readonly. Returns undefined if not needed.
 * @example
 * const a = () => { }
 * becomes
 * const a = (() => { const a = () => {}; return a; })()
 */
function arrowFunctionExpressionNamedIfNeeded(
  path: NodePath<babel.types.Expression>,
): babel.types.Expression | undefined {
  if (
    path.isArrowFunctionExpression() &&
    path.parentPath.isVariableDeclarator() &&
    babelTypes.isIdentifier(path.parentPath.node.id)
  ) {
    return babelTypes.callExpression(
      babelTypes.arrowFunctionExpression(
        [],
        babelTypes.blockStatement([
          babelTypes.variableDeclaration('const', [
            babelTypes.variableDeclarator(path.parentPath.node.id, path.node),
          ]),
          babelTypes.returnStatement(path.parentPath.node.id),
        ]),
      ),
      [],
    )
  }
  return
}

function nameIfAnonymous(
  path: NodePath<babel.types.Expression>,
): babel.types.Expression {
  return (
    classOrFunctionExpressionNamedIfNeeded(path) ??
      arrowFunctionExpressionNamedIfNeeded(path) ??
      path.node
  )
}

function isMemberOrCallOrNonNullExpression(path: NodePath) {
  return isCallExpression(path) || isMemberOrNonNullExpression(path)
}

function isMemberOrNonNullExpression(
  path: NodePath,
): path is NodePath<
  | babel.types.MemberExpression
  | babel.types.OptionalMemberExpression
  | babel.types.TSNonNullExpression
> {
  return isMemberExpression(path) || path.isTSNonNullExpression()
}
function isMemberExpression(
  path: NodePath,
): path is NodePath<
  babel.types.MemberExpression | babel.types.OptionalMemberExpression
> {
  return path.isMemberExpression() || path.isOptionalMemberExpression()
}

function isCallExpression(
  path: NodePath,
): path is NodePath<
  babel.types.CallExpression | babel.types.OptionalCallExpression
> {
  return path.isCallExpression() || path.isOptionalCallExpression()
}

function isValidExpression(path: NodePath<babel.types.Expression>) {
  const parent = path.parentPath
  return (
    !isObjectPropertyKey() &&
    !isPartOfChain() &&
    !parent.isTaggedTemplateExpression() &&
    !isPartOfDeleteExpression() &&
    !isPartOfAssignmentExpression()
  )

  /**
   * Determines if the expression is property of an object.
   * @example
   * const a = {
   *  'foo': 'bar' // 'foo' here is an object property
   * };
   */
  function isObjectPropertyKey() {
    return parent.isObjectProperty() && parent.node.key === path.node
  }

  /**
   * Determines if the expression is part of a call/member chain.
   * @example
   * // bar is part of chain, foo is NOT part of the chain:
   * foo.bar.baz();
   * foo.bar?.baz()
   * foo.bar;
   * foo.bar!;
   * foo.bar();
   * foo?.bar();
   * baz[foo.bar()]
   * bar?.baz[0]
   */
  function isPartOfChain() {
    return (
      isMemberOrCallOrNonNullExpression(path) &&
      ((isMemberExpression(parent) &&
        !(parent.node.computed && parent.node.property === path.node)) ||
        parent.isTSNonNullExpression() ||
        (isCallExpression(parent) && parent.node.callee === path.node))
    )
  }

  /**
   * Determines if the expression is part of a delete expression.
   * @returns true if the expression is part of a delete expression
   * @example
   * delete foo.bar;
   */
  function isPartOfDeleteExpression() {
    return parent.isUnaryExpression() && parent.node.operator === 'delete'
  }

  /**
   * Determines if the expression is part of an assignment expression.
   * @returns true if the expression is part of an assignment expression
   * @example
   * foo.bar = 42;
   * initialNodes.filter((n) => n.id === 'tiptilt')[0].className = tiptiltState;
   */
  function isPartOfAssignmentExpression() {
    return parent.isAssignmentExpression() && parent.node.left === path.node
  }
}

/**
 * Places the mutants with a conditional expression: `global.activeMutant === 1? mutatedCode : originalCode`;
 */
export const expressionMutantPlacer = {
  name: 'expressionMutantPlacer',
  canPlace(path) {
    return path.isExpression() && isValidExpression(path)
  },
  place(path, appliedMutants) {
    // Make sure anonymous functions and classes keep their 'name' property
    let expression = nameIfAnonymous(path)

    // Add the mutation coverage expression
    expression = mutationCoverageSequenceExpression(
      appliedMutants.keys(),
      expression,
    )

    // Now apply the mutants
    for (const [mutant, appliedMutant] of appliedMutants) {
      expression = babelTypes.conditionalExpression(
        mutantTestExpression(mutant.id),
        nodeOfKind(mutant, appliedMutant, babelTypes.isExpression, 'an expression'),
        expression,
      )
    }
    path.replaceWith(expression)
  },
} satisfies MutantPlacer<babel.types.Expression>

/**
 * Mutant placer that places mutants in statements that allow it.
 * It uses an `if` statement to do so
 */
export const statementMutantPlacer: MutantPlacer<types.Statement> = {
  name: 'statementMutantPlacer',
  canPlace(path) {
    return path.isStatement()
  },
  place(path, appliedMutants) {
    const bodyStatements: types.Statement[] = [
      t.expressionStatement(
        mutationCoverageSequenceExpression(appliedMutants.keys()),
      ),
    ]
    if (path.isBlockStatement()) {
      bodyStatements.push(...path.node.body)
    } else {
      bodyStatements.push(path.node)
    }
    let statement: types.Statement = t.blockStatement(bodyStatements)
    for (const [mutant, appliedMutant] of appliedMutants) {
      statement = t.ifStatement(
        mutantTestExpression(mutant.id),
        t.blockStatement([nodeOfKind(mutant, appliedMutant, t.isStatement, 'a statement')]),
        statement,
      )
    }
    if (path.isBlockStatement()) {
      path.replaceWith(t.blockStatement([statement]))
    } else {
      path.replaceWith(statement)
    }
  },
}
/**
 * Places the mutants with consequent of a SwitchCase node. Uses an if-statement to do so.
 * @example
 *  case 'foo':
 *    if (stryMutAct_9fa48(0)) {} else {
 *      stryCov_9fa48(0);
 *      console.log('bar');
 *      break;
 *   }
 */
export const switchCaseMutantPlacer: MutantPlacer<types.SwitchCase> = {
  name: 'switchCaseMutantPlacer',
  canPlace(path) {
    return path.isSwitchCase()
  },
  place(path, appliedMutants) {
    let consequence: types.Statement = babel.types.blockStatement([
      babel.types.expressionStatement(
        mutationCoverageSequenceExpression(appliedMutants.keys()),
      ),
      ...path.node.consequent,
    ])
    for (const [mutant, appliedMutant] of appliedMutants) {
      const switchCase = nodeOfKind(mutant, appliedMutant, babel.types.isSwitchCase, 'a switch case')
      consequence = babel.types.ifStatement(
        mutantTestExpression(mutant.id),
        babel.types.blockStatement(switchCase.consequent),
        consequence,
      )
    }
    path.replaceWith(babel.types.switchCase(path.node.test, [consequence]))
  },
}

export const allMutantPlacers: readonly MutantPlacer[] = Object.freeze([
  expressionMutantPlacer,
  statementMutantPlacer,
  switchCaseMutantPlacer,
])

const ANGULAR_SIGNAL_IO_FUNCTIONS = Object.freeze(['input', 'model', 'output'])

const ANGULAR_SIGNAL_QUERY_FUNCTIONS = Object.freeze([
  'contentChild',
  'contentChildren',
  'viewChild',
  'viewChildren',
])

const INPUT_MODEL_OUTPUT_CONFIG_MSG =
  'Angular signal based input, model and output functions configuration object cannot be mutated as that causes issues with the Angular compiler.'

const SIGNAL_QUERY_OPTIONS_MSG =
  'Angular signal query options object cannot be mutated as that causes issues with the Angular compiler.'

export function shouldIgnore(path: IgnorerNodePath): Option.Option<string> {
  for (let current: IgnorerNodePath | null | undefined = path; current; current = current.parentPath) {
    if (isInputModelOrOutputConfigurationObject(current)) {
      return Option.some(INPUT_MODEL_OUTPUT_CONFIG_MSG)
    }
    if (isSignalQueryOptionsObject(current)) {
      return Option.some(SIGNAL_QUERY_OPTIONS_MSG)
    }
  }
  return Option.none()
}

export const angularIgnorer: IgnorerService = {
  shouldIgnore,
}

function isClassFieldLike(path: IgnorerNodePath): boolean {
  return path.isClassProperty() || path.isClassPrivateProperty() || path.isClassAccessorProperty()
}

function isInputModelOrOutputConfigurationObject(path: IgnorerNodePath): boolean {
  const parent = path.parentPath
  const grandParent = parent?.parentPath
  if (
    !path.isObjectExpression() ||
    parent === null ||
    parent === undefined ||
    !parent.isCallExpression() ||
    grandParent === null ||
    grandParent === undefined ||
    !grandParent.isClassProperty()
  ) {
    return false
  }

  const callExpression = parent
  const objectExpression = path
  const callNode = callExpression.node
  if (!Predicate.hasProperty(callNode, 'callee') || !Predicate.hasProperty(callNode, 'arguments')) {
    return false
  }
  const callee = callNode['callee']
  const args = callNode['arguments']
  if (!Array.isArray(args)) {
    return false
  }

  const isRequiredSignalIOFunction = isMemberExpressionWithIdentifier(callee, ANGULAR_SIGNAL_IO_FUNCTIONS, 'required')
  const isSignalIOFunction = isIdentifierIn(callee, ANGULAR_SIGNAL_IO_FUNCTIONS)
  const isOutput = isIdentifierWithName(callee, 'output')

  if (isRequiredSignalIOFunction || isOutput) {
    return args.length >= 1 && args[0] === objectExpression.node
  }

  if (isSignalIOFunction) {
    return args.length >= 2 && args[1] === objectExpression.node
  }

  return false
}

function isSignalQueryOptionsObject(path: IgnorerNodePath): boolean {
  const parent = path.parentPath
  const grandParent = parent?.parentPath
  if (
    !path.isObjectExpression() ||
    parent === null ||
    parent === undefined ||
    !parent.isCallExpression() ||
    grandParent === null ||
    grandParent === undefined ||
    !isClassFieldLike(grandParent)
  ) {
    return false
  }

  const callExpression = parent
  const objectExpression = path
  const callNode = callExpression.node
  if (!Predicate.hasProperty(callNode, 'callee') || !Predicate.hasProperty(callNode, 'arguments')) {
    return false
  }
  const callee = callNode['callee']
  const args = callNode['arguments']
  if (!Array.isArray(args)) {
    return false
  }
  const isQueryFn = isIdentifierIn(callee, ANGULAR_SIGNAL_QUERY_FUNCTIONS)
  const isRequiredQueryFn = isMemberExpressionWithIdentifier(callee, ANGULAR_SIGNAL_QUERY_FUNCTIONS, 'required')
  if (!isQueryFn && !isRequiredQueryFn) {
    return false
  }
  return args.length >= 2 && args[1] === objectExpression.node
}

function isIdentifierWithName(node: unknown, name: string): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'Identifier' &&
    Predicate.hasProperty(node, 'name') &&
    node['name'] === name
  )
}

function isIdentifierIn(node: unknown, names: readonly string[]): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'Identifier' &&
    Predicate.hasProperty(node, 'name') &&
    typeof node['name'] === 'string' &&
    names.includes(node['name'])
  )
}

function isMemberExpressionWithIdentifier(
  node: unknown,
  objectNames: readonly string[],
  propertyName: string,
): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'MemberExpression' &&
    Predicate.hasProperty(node, 'object') &&
    Predicate.hasProperty(node, 'property') &&
    isIdentifierIn(node['object'], objectNames) &&
    isIdentifierWithName(node['property'], propertyName)
  )
}

export const strykerPlugins: readonly unknown[] = []

export const frameworkPluginsFileUrl = import.meta.url

/**
 * Returns syntax for the header if JS/TS files
 */
const parsedInstrumentationHeader = babel.parse(
  // `globalThis` implementation is based on core-js's implementation. See https://github.com/stryker-mutator/stryker-js/issues/4035
  `// @ts-nocheck
var ${STRYKER_NAMESPACE_HELPER} = function(){
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.${ID.NAMESPACE} || (g.${ID.NAMESPACE} = {});
  if (ns.${ID.ACTIVE_MUTANT} === undefined && g.process && g.process.env && g.process.env.${ID.ACTIVE_MUTANT_ENV_VARIABLE}) {
    ns.${ID.ACTIVE_MUTANT} = g.process.env.${ID.ACTIVE_MUTANT_ENV_VARIABLE};
  }
  function retrieveNS(){
    return ns;
  }
  ${STRYKER_NAMESPACE_HELPER} = retrieveNS;
  return retrieveNS();
};
${STRYKER_NAMESPACE_HELPER}();

var ${COVER_MUTANT_HELPER} = function() {
  var ns = ${STRYKER_NAMESPACE_HELPER}();
  var cov = ns.${ID.MUTATION_COVERAGE_OBJECT} || (ns.${ID.MUTATION_COVERAGE_OBJECT} = { static: {}, perTest: {} });
  function cover() {
    var c = cov.static;
    if (ns.${ID.CURRENT_TEST_ID}) {
      c = cov.perTest[ns.${ID.CURRENT_TEST_ID}] = cov.perTest[ns.${ID.CURRENT_TEST_ID}] || {};
    }
    var a = arguments;
    for(var i=0; i < a.length; i++){
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  ${COVER_MUTANT_HELPER} = cover;
  cover.apply(null, arguments);
};
var ${IS_MUTANT_ACTIVE_HELPER} = function(id) {
  var ns = ${STRYKER_NAMESPACE_HELPER}();
  function isActive(id) {
    if (ns.${ID.ACTIVE_MUTANT} === id) {
      if (ns.${ID.HIT_COUNT} !== void 0 && ++ns.${ID.HIT_COUNT} > ns.${ID.HIT_LIMIT}) {
        throw new Error('Stryker: Hit count limit reached (' + ns.${ID.HIT_COUNT} + ')');
      }
      return true;
    }
    return false;
  }
  ${IS_MUTANT_ACTIVE_HELPER} = isActive;
  return isActive(id);
}`,
  { configFile: false, browserslistConfigFile: false, env: { targets: {} } },
)
if (!babelTypes.isFile(parsedInstrumentationHeader)) {
  throw new Error('Instrumentation header parsed as non-File')
}
export const instrumentationBabelHeader: readonly babel.types.Statement[] = parsedInstrumentationHeader.program.body
deepFreeze(instrumentationBabelHeader)

export function placeHeaderIfNeeded(
  mutantCollector: MutantCollector,
  originFileName: string,
  options: MutatorOptions,
  root: babel.types.File,
): void {
  if (hasPlacedMutants(mutantCollector, originFileName) && options.noHeader !== true) {
    // Be sure to leave comments like `// @flow` in.
    placeHeader(root)
  }
}

export function placeHeader(root: babel.types.File): void {
  let header: readonly babel.types.Statement[] = instrumentationBabelHeader
  const firstStatement = root.program.body[0]
  const leadingComments = firstStatement?.leadingComments
  if (Array.isArray(leadingComments)) {
    const firstHeader = instrumentationBabelHeader[0]
    if (firstHeader === undefined) {
      throw new Error('Instrumentation header is empty')
    }
    const cloned = babelTypes.cloneNode(firstHeader, true, false)
    cloned.leadingComments = leadingComments
    header = [cloned, ...instrumentationBabelHeader.slice(1)]
  }
  root.program.body.unshift(...header)
}

function deepFreeze(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) {
        deepFreeze(item)
      }
      return Object.freeze(value)
    }
    if (value instanceof RegExp) {
      return Object.freeze(value)
    }
    if (value instanceof Map) {
      for (const [k, v] of value.entries()) {
        deepFreeze(k)
        deepFreeze(v)
      }
      return Object.freeze(value)
    }
    if (value instanceof Set) {
      for (const v of value.values()) {
        deepFreeze(v)
      }
      return Object.freeze(value)
    }
    for (const v of Object.values(value)) {
      deepFreeze(v)
    }
    return Object.freeze(value)
  }
  return value
}

export function transform(
  ast: Ast,
  mutantCollector: MutantCollector,
  transformerContext: Omit<TransformerContext, 'transform'>,
): readonly string[] {
  const context: TransformerContext = {
    ...transformerContext,
    transform,
  }
  switch (ast.format) {
    case 'html':
      return transformHtml(ast, mutantCollector, context)
    case 'js':
    case 'ts':
    case 'tsx':
      return transformBabel(ast, mutantCollector, context)
    case 'svelte':
      return transformSvelte(ast, mutantCollector, context)
  }
}

export type AstTransformer<T extends AstFormat> = (
  ast: AstByFormat[T],
  mutantCollector: MutantCollector,
  context: TransformerContext,
) => readonly string[]

export interface TransformerContext {
  transform: AstTransformer<AstFormat>
  options: TransformerOptions
  mutateDescription: MutateDescription
}

export const transformHtml: AstTransformer<'html'> = (
  { root },
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  root.scripts.forEach((ast) => {
    warnings.push(...context.transform(ast, mutantCollector, context))
  })
  return warnings
}

const moduleScriptStart = '<script context="module">\n'
const moduleScript = `${moduleScriptStart}\n</script>\n`

export const transformSvelte: AstTransformer<'svelte'> = (
  svelte,
  mutantCollector,
  context,
) => {
  const warnings: string[] = []
  const { root, originFileName } = svelte
  ;[root.moduleScript, ...root.additionalScripts]
    .filter(Predicate.isNotNullish)
    .forEach((script) => {
      warnings.push(
        ...context.transform(script.ast, mutantCollector, {
          ...context,
          options: {
            ...context.options,
            noHeader: true,
          },
        }),
      )
    })

  if (hasPlacedMutants(mutantCollector, originFileName)) {
    // We need to place the instrumentation header inside the `<script context="module">` script
    // If there already is a module script, place it there. If not, we need to add it.

    if (!root.moduleScript) {
      root.moduleScript = {
        ast: {
          format: 'js',
          root: babelTypes.file(babelTypes.program([])),
          rawContent: '',
          originFileName,
        },
        range: {
          start: moduleScriptStart.length,
          end: moduleScriptStart.length,
        },
        isExpression: false,
      }
      svelte.rawContent = `${moduleScript}${svelte.rawContent}`
      svelte.root.additionalScripts.forEach((script) => {
        script.range.start += moduleScript.length
        script.range.end += moduleScript.length
      })
    }
    placeHeader(root.moduleScript.ast.root)
  }
  return warnings
}

const { traverse } = babel

interface MutantsPlacement<TNode extends types.Node> {
  appliedMutants: Map<Mutant, types.Node>
  placer: MutantPlacer<TNode>
}

type PlacementMap = Map<types.Node, MutantsPlacement<types.Node>>

export const transformBabel: AstTransformer<ScriptFormat> = (
  { root, originFileName, rawContent, offset },
  mutantCollector,
  { options, mutateDescription },
  mutators = allMutators,
  mutantPlacers = allMutantPlacers,
) => {
  const file = createBabelFile(originFileName, rawContent, root)

  const placementMap: PlacementMap = new Map()

  let directiveRule: Rule = rootRule
  const mutatorEntries = Object.entries(mutators)
  const allMutatorNames = mutatorEntries.map(([name]) => name.toLowerCase())

  const warnings: string[] = []

  traverse(file.ast, {
    enter(path) {
      const result = processStrykerDirectives(
        directiveRule,
        path.node,
        allMutatorNames,
        originFileName,
      )
      directiveRule = result.rule
      warnings.push(...result.warnings)
      if (shouldSkip(path)) {
        path.skip()
      } else {
        addToPlacementMapIfPossible(path)
        if (shouldMutate(path)) {
          const mutantsToPlace = collectMutants(path)
          if (mutantsToPlace.length > 0) {
            const placementPath = path.find((ancestor) => placementMap.has(ancestor.node))
            if (placementPath) {
              const placement = placementMap.get(placementPath.node)
              if (placement === undefined) {
                throw new Error('Placement not found for node')
              }
              const { appliedMutants } = placement
              mutantsToPlace.forEach((mutant) => appliedMutants.set(mutant, applyMutant(mutant, placementPath.node)))
            } else {
              throw new Error(
                `Mutants cannot be placed. This shouldn't happen! Unplaced mutants: ${
                  JSON.stringify(mutantsToPlace, null, 2)
                }`,
              )
            }
          }
        }
      }
    },
    exit(path) {
      placeMutantsIfNeeded(path)
    },
  })

  placeHeaderIfNeeded(mutantCollector, originFileName, options, root)

  return warnings

  function addToPlacementMapIfPossible(path: NodePath): void {
    const placer = mutantPlacers.find((p) => p.canPlace(path))
    if (placer !== undefined) {
      placementMap.set(path.node, { appliedMutants: new Map(), placer })
    }
  }
  function shouldSkip(path: NodePath): boolean {
    return (
      isTypeNode(path) ||
      isImportDeclaration(path) ||
      path.isDecorator() ||
      mutateDescription === false ||
      (Array.isArray(mutateDescription) &&
        mutateDescription.every((range: SourceLocationInFile) => {
          const nodeLoc: SourceLocationInFile = getNodeLocation(path.node)
          return !locationOverlaps(range, nodeLoc)
        }))
    )
  }

  function shouldMutate(path: NodePath): boolean {
    return (
      mutateDescription === true ||
      (Array.isArray(mutateDescription) &&
        mutateDescription.some((range: SourceLocationInFile) => {
          const nodeLoc: SourceLocationInFile = getNodeLocation(path.node)
          return locationIncluded(range, nodeLoc)
        }))
    )
  }

  function placeMutantsIfNeeded(path: NodePath): void {
    const mutantsPlacement = placementMap.get(path.node)
    if (mutantsPlacement !== undefined && mutantsPlacement.appliedMutants.size > 0) {
      try {
        mutantsPlacement.placer.place(path, mutantsPlacement.appliedMutants)
        path.skip()
      } catch (error) {
        const normalizedError = toError(error)
        throwPlacementError(
          normalizedError,
          path,
          mutantsPlacement.placer,
          [...mutantsPlacement.appliedMutants.keys()],
          originFileName,
        )
      }
    }
  }
  function ignoreMessageFor(path: NodePath): string | undefined {
    const view = toIgnorerPath(path)
    for (const ignorer of options.ignorers) {
      const result = ignorer.shouldIgnore(view)
      if (Option.isSome(result)) {
        return result.value
      }
    }
    return undefined
  }

  function collectMutants(path: NodePath): Mutant[] {
    return [...mutate(path)].map((mutable) => collect(mutantCollector, originFileName, path.node, mutable, offset))
      .filter((mutant) => mutant.ignoreReason === undefined)
  }

  function* mutate(path: NodePath): Iterable<Mutable> {
    const context = toMutatorContext(path)
    for (const [mutatorName, mutate] of mutatorEntries) {
      for (const replacement of mutate(path.node, context)) {
        const ignoreReason = findIgnoreReason(directiveRule, mutatorName, getNodeLocation(path.node).start.line) ??
          findExcludedMutatorIgnoreReason(mutatorName) ??
          ignoreMessageFor(path)
        const mutableEntry: Mutable = {
          replacement,
          mutatorName,
        }
        if (ignoreReason !== undefined) {
          mutableEntry.ignoreReason = ignoreReason
        }
        yield mutableEntry
      }
    }

    function findExcludedMutatorIgnoreReason(mutatorName: string): string | undefined {
      if (options.excludedMutations.includes(mutatorName)) {
        return `Ignored because of excluded mutation "${mutatorName}"`
      } else {
        return undefined
      }
    }
  }
}

function toMutatorContext(path: NodePath): MutatorContext {
  const ancestors: types.Node[] = []
  let current: NodePath | null = path.parentPath
  while (current !== null) {
    ancestors.push(current.node)
    current = current.parentPath
  }
  return {
    parent: ancestors[0],
    grandParent: ancestors[1],
    ancestors,
  }
}

function getNodeLocation(
  node: types.Node,
): { start: { line: number; column: number }; end: { line: number; column: number } } {
  const loc = node.loc
  if (loc == null) {
    throw new Error('Babel node without location')
  }
  return {
    start: { line: loc.start.line, column: loc.start.column },
    end: { line: loc.end.line, column: loc.end.column },
  }
}
function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  return new Error('Unexpected error', { cause: value })
}
