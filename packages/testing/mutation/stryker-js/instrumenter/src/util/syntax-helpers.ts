import babel from '@babel/core'
import { INSTRUMENTER_CONSTANTS as ID } from '@systemfsoftware/stryker-js-plugin-api/core'
import { deepFreeze, type I } from '@systemfsoftware/stryker-js-util'

import { Mutant } from '../mutant.js'

import { type MutatorOptions } from '../mutators/index.js'
import { MutantCollector } from '../transformers/index.js'

export { ID }

const STRYKER_NAMESPACE_HELPER = 'stryNS_9fa48'
const COVER_MUTANT_HELPER = 'stryCov_9fa48'
const IS_MUTANT_ACTIVE_HELPER = 'stryMutAct_9fa48'

const { types, traverse } = babel

/**
 * Returns syntax for the header if JS/TS files
 */
const parsedInstrumentationHeader = babel.parse(
  // `globalThis` implementation is based on core-js's implementation. See https://github.com/stryker-mutator/stryker-js/issues/4035
  `function ${STRYKER_NAMESPACE_HELPER}(){
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
}
${STRYKER_NAMESPACE_HELPER}();

function ${COVER_MUTANT_HELPER}() {
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
}
function ${IS_MUTANT_ACTIVE_HELPER}(id) {
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
if (!types.isFile(parsedInstrumentationHeader)) {
  throw new Error('Instrumentation header parsed as non-File')
}
export const instrumentationBabelHeader: readonly babel.types.Statement[] = parsedInstrumentationHeader.program.body
deepFreeze(instrumentationBabelHeader)

/**
 * returns syntax for `global.activeMutant === $mutantId`
 * @param mutantId The id of the mutant to switch
 */
export function mutantTestExpression(
  mutantId: string,
): babel.types.CallExpression {
  return types.callExpression(types.identifier(IS_MUTANT_ACTIVE_HELPER), [
    types.stringLiteral(mutantId),
  ])
}

interface Position {
  line: number
  column: number
}

function eqLocation(
  a: babel.types.SourceLocation,
  b: babel.types.SourceLocation,
): boolean {
  function eqPosition(start: Position, end: Position): boolean {
    return start.column === end.column && start.line === end.line
  }
  return eqPosition(a.start, b.start) && eqPosition(a.end, b.end)
}

export function eqNode<T extends babel.types.Node>(
  a: T,
  b: babel.types.Node,
): b is T {
  return a.type === b.type && !!a.loc && !!b.loc && eqLocation(a.loc, b.loc)
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
  const mutantIds = [...mutants].map((mutant) => types.stringLiteral(mutant.id))
  const sequence: babel.types.Expression[] = [
    types.callExpression(types.identifier(COVER_MUTANT_HELPER), mutantIds),
  ]
  if (targetExpression) {
    sequence.push(targetExpression)
  }
  return types.sequenceExpression(sequence)
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
    types.isTSImportEqualsDeclaration(path.node) || path.isImportDeclaration()
  )
}

/**
 * A location of an ast node in a file
 */
export interface SourceLocationInFile {
  end: Position
  start: Position
}

/**
 * Determines if a location (needle) is included in an other location (haystack)
 * @param haystack The range to look in
 * @param needle the range to search for
 */
export function locationIncluded(
  haystack: SourceLocationInFile,
  needle: SourceLocationInFile,
): boolean {
  const startIncluded = haystack.start.line < needle.start.line ||
    (haystack.start.line === needle.start.line &&
      haystack.start.column <= needle.start.column)
  const endIncluded = haystack.end.line > needle.end.line ||
    (haystack.end.line === needle.end.line &&
      haystack.end.column >= needle.end.column)
  return startIncluded && endIncluded
}

/**
 * Determines if two locations overlap with each other
 */
export function locationOverlaps(
  a: SourceLocationInFile,
  b: SourceLocationInFile,
): boolean {
  const startIncluded = a.start.line < b.end.line ||
    (a.start.line === b.end.line && a.start.column <= b.end.column)
  const endIncluded = a.end.line > b.start.line ||
    (a.end.line === b.start.line && a.end.column >= b.start.column)
  return startIncluded && endIncluded
}

/**
 * Helper for `types.cloneNode(node, deep: true, withoutLocations: false);`
 */
export function deepCloneNode<TNode extends babel.types.Node>(
  node: TNode,
): TNode {
  return types.cloneNode(node, /* deep */ true, /* withoutLocations */ false)
}

export function placeHeaderIfNeeded(
  mutantCollector: I<MutantCollector>,
  originFileName: string,
  options: MutatorOptions,
  root: babel.types.File,
): void {
  if (mutantCollector.hasPlacedMutants(originFileName) && !options.noHeader) {
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
    const cloned = types.cloneNode(firstHeader, true, false)
    cloned.leadingComments = leadingComments
    header = [cloned, ...instrumentationBabelHeader.slice(1)]
  }
  root.program.body.unshift(...header)
}
