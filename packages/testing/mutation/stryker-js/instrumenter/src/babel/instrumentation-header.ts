import babel from '@babel/core'
import { INSTRUMENTER_CONSTANTS as ID } from '@systemfsoftware/stryker-js-plugin-api/core'

import { hasPlacedMutants, type MutantCollector } from '../transformers/index.js'

import { type MutatorOptions } from '../mutators/index.js'

const STRYKER_NAMESPACE_HELPER = 'stryNS_9fa48'
const COVER_MUTANT_HELPER = 'stryCov_9fa48'
const IS_MUTANT_ACTIVE_HELPER = 'stryMutAct_9fa48'

const { types } = babel

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

export function placeHeaderIfNeeded(
  mutantCollector: MutantCollector,
  originFileName: string,
  options: MutatorOptions,
  root: babel.types.File,
): void {
  if (hasPlacedMutants(mutantCollector, originFileName) && !options.noHeader) {
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
