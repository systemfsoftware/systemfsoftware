import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree, Scope, Variable } from '@oxlint/plugins'
import { resolveImportOrigin } from '@systemfsoftware/oxlint-import-origin'

import { effectMemberIs } from './effect-origin.js'
import {
  DEFINITION_ACTUAL_OF,
  DEFINITION_EXPECTED,
  DEFINITION_FIX,
  DRIVER_ACTUAL_OF,
  DRIVER_EXPECTED,
  DRIVER_FIX,
  isEffectPackageSource,
  meta,
  PARAMETER_ACTUAL,
  PARAMETER_EXPECTED,
  PARAMETER_FIX,
  REF_SINK_MEMBERS,
} from './handle-driver-confinement.config.js'
import { cellOriginResolverOf } from './kind-constructor.js'
import { isHandleFile, isTypeTestFile } from './kind-file.js'

export type MessageIds = 'definitionByReference' | 'driverNotAnIdentifier' | 'driverEscapes'

const BIND_MEMBER = 'bind'

const isNode = (value: unknown): value is ESTree.Node => value !== null && typeof value === 'object' && 'type' in value

const parentOf = (node: ESTree.Node): ESTree.Node | null => {
  const parent: unknown = node.parent
  return isNode(parent) ? parent : null
}

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function

const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'

const staticMemberNameOf = (node: ESTree.Node): string | null => {
  if (node.type !== 'MemberExpression') return null
  const property = node.property
  if (property.type === 'Identifier') return property.name
  return property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
}

const propertyNameOf = (property: { readonly key: ESTree.Node; readonly computed: boolean }): string | null => {
  if (property.computed === false && property.key.type === 'Identifier') return property.key.name
  return property.key.type === 'Literal' && typeof property.key.value === 'string' ? property.key.value : null
}

interface NamedValue {
  readonly name: string
  readonly value: ESTree.Node
}

const namedValuesOf = (object: ESTree.ObjectExpression): readonly NamedValue[] => {
  const values: NamedValue[] = []
  for (const property of object.properties) {
    if (property.type !== 'Property') continue
    const name = propertyNameOf(property)
    if (name === null) continue
    values.push({ name, value: property.value })
  }
  return values
}

const propertyValueOf = (object: ESTree.ObjectExpression, key: string): ESTree.Node | null => {
  for (const entry of namedValuesOf(object)) {
    if (entry.name === key) return entry.value
  }
  return null
}

interface DefinitionSite {
  readonly fn: ESTree.Node
  readonly role: string
  readonly isIntegration: boolean
}

const collectMemberSites = (value: ESTree.Node, role: string, into: DefinitionSite[]): void => {
  if (value.type !== 'ObjectExpression') {
    into.push({ fn: value, role: `${role} record`, isIntegration: false })
    return
  }
  for (const entry of namedValuesOf(value)) {
    into.push({ fn: entry.value, role, isIntegration: false })
  }
}

const collectReleaseSites = (value: ESTree.Node, into: DefinitionSite[]): void => {
  if (value.type !== 'ArrayExpression') {
    into.push({ fn: value, role: 'release', isIntegration: false })
    return
  }
  for (const stage of value.elements) {
    if (stage === null || stage.type !== 'ArrayExpression') continue
    for (const step of stage.elements) {
      if (step === null) continue
      into.push({ fn: step, role: 'release step', isIntegration: false })
    }
  }
}

const collectChildSites = (value: ESTree.Node, into: DefinitionSite[]): void => {
  if (value.type !== 'ObjectExpression') {
    into.push({ fn: value, role: 'child entry', isIntegration: false })
    return
  }
  for (const entry of namedValuesOf(value)) {
    if (entry.value.type !== 'ObjectExpression') {
      into.push({ fn: entry.value, role: 'child creator', isIntegration: false })
      continue
    }
    const create = propertyValueOf(entry.value, 'create')
    if (create !== null) into.push({ fn: create, role: 'child creator', isIntegration: false })
  }
}

const definitionSitesOf = (options: ESTree.ObjectExpression): readonly DefinitionSite[] => {
  const sites: DefinitionSite[] = []
  for (const entry of namedValuesOf(options)) {
    if (entry.name === 'release') collectReleaseSites(entry.value, sites)
    else if (entry.name === 'operations') collectMemberSites(entry.value, 'operation', sites)
    else if (entry.name === 'streams') collectMemberSites(entry.value, 'stream', sites)
    else if (entry.name === 'children') collectChildSites(entry.value, sites)
    else if (entry.name === 'integration') sites.push({ fn: entry.value, role: 'integration', isIntegration: true })
  }
  return sites
}

const driverVariableOf = (definition: FunctionNode, driverName: string, context: Context): Variable | null => {
  for (const variable of context.sourceCode.getDeclaredVariables(definition)) {
    if (variable.name !== driverName) continue
    return variable.defs.some((def) => def.type === 'Parameter') ? variable : null
  }
  return null
}

const driverReferencesOf = (variable: Variable, root: Scope): readonly ESTree.Node[] => {
  const references: ESTree.Node[] = []
  const collect = (scope: Scope): void => {
    for (const reference of scope.references) {
      if (reference.resolved === variable) references.push(reference.identifier)
    }
    for (const child of scope.childScopes) collect(child)
  }
  collect(root)
  return references
}

const memberChainTopOf = (node: ESTree.Node): ESTree.Node => {
  const parent = parentOf(node)
  if (parent === null || parent.type !== 'MemberExpression' || parent.object !== node) return node
  return memberChainTopOf(parent)
}

const isCalledExpression = (node: ESTree.Node): boolean => {
  const parent = parentOf(node)
  return parent !== null && parent.type === 'CallExpression' && parent.callee === node
}

const isCallArgument = (node: ESTree.Node): boolean => {
  const parent = parentOf(node)
  if (parent === null || parent.type !== 'CallExpression') return false
  return isArgumentOf(node, parent)
}

const isArgumentOf = (node: ESTree.Node, call: ESTree.CallExpression): boolean => {
  for (const argument of call.arguments) {
    if (argument === node) return true
  }
  return false
}

const isAllowedPosition = (reference: ESTree.Node, isIntegration: boolean): boolean => {
  const chainTop = memberChainTopOf(reference)
  if (isCalledExpression(chainTop)) return staticMemberNameOf(chainTop) !== BIND_MEMBER
  return isIntegration && isCallArgument(chainTop)
}

const isInlineFunction = (fn: ESTree.Node): boolean =>
  fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression'

const callbackCallOf = (fn: ESTree.Node): ESTree.CallExpression | null => {
  const parent = parentOf(fn)
  if (parent === null) return null
  if (parent.type === 'CallExpression' && isArgumentOf(fn, parent)) return parent
  if (parent.type !== 'Property') return null
  const object = parentOf(parent)
  if (object === null || object.type !== 'ObjectExpression') return null
  const call = parentOf(object)
  if (call === null || call.type !== 'CallExpression' || isArgumentOf(object, call) === false) return null
  return call
}

const isEffectCallback = (fn: ESTree.Node, getScope: (node: ESTree.Node) => unknown): boolean => {
  if (isInlineFunction(fn) === false) return false
  const call = callbackCallOf(fn)
  if (call === null) return false
  const origin = resolveImportOrigin(call.callee, getScope)
  return origin !== null && isEffectPackageSource(origin.source)
}

const callbacksAllowDriver = (
  reference: ESTree.Node,
  definition: ESTree.Node,
  getScope: (node: ESTree.Node) => unknown,
): boolean => {
  let current = parentOf(reference)
  while (current !== null && current !== definition) {
    if (isFunctionNode(current) && isEffectCallback(current, getScope) === false) return false
    current = parentOf(current)
  }
  return true
}

const isRefSink = (reference: ESTree.Node, getScope: (node: ESTree.Node) => unknown): boolean => {
  const chainTop = memberChainTopOf(reference)
  if (chainTop.type !== 'MemberExpression') return false
  const parent = parentOf(chainTop)
  if (parent === null || parent.type !== 'CallExpression' || parent.arguments[0] !== chainTop) return false
  return effectMemberIs(parent.callee, getScope, REF_SINK_MEMBERS)
}

const reportByReference = (context: Context, node: ESTree.Node, role: string): void => {
  context.report({
    node,
    messageId: 'definitionByReference',
    data: {
      name: `the ${role}`,
      expected: DEFINITION_EXPECTED,
      actual: DEFINITION_ACTUAL_OF(role),
      fix: DEFINITION_FIX,
    },
  })
}

const reportNonIdentifierDriver = (context: Context, node: ESTree.Node, role: string): void => {
  context.report({
    node,
    messageId: 'driverNotAnIdentifier',
    data: {
      name: `the ${role}'s driver parameter`,
      expected: PARAMETER_EXPECTED,
      actual: PARAMETER_ACTUAL,
      fix: PARAMETER_FIX,
    },
  })
}

const reportEscapedDriver = (context: Context, reference: ESTree.Node, role: string): void => {
  const observed = context.sourceCode.getText(memberChainTopOf(reference))
  context.report({
    node: reference,
    messageId: 'driverEscapes',
    data: {
      name: `a reference to the ${role}'s driver`,
      expected: DRIVER_EXPECTED,
      actual: DRIVER_ACTUAL_OF(observed),
      fix: DRIVER_FIX,
    },
  })
}

const checkDefinition = (context: Context, site: DefinitionSite, getScope: (node: ESTree.Node) => unknown): void => {
  if (isFunctionNode(site.fn) === false) {
    reportByReference(context, site.fn, site.role)
    return
  }
  const driver = site.fn.params[0]
  if (driver === undefined || driver.type !== 'Identifier') {
    reportNonIdentifierDriver(context, site.fn, site.role)
    return
  }
  const variable = driverVariableOf(site.fn, driver.name, context)
  if (variable === null) return
  for (const reference of driverReferencesOf(variable, context.sourceCode.getScope(driver))) {
    if (isAllowedPosition(reference, site.isIntegration) === false && isRefSink(reference, getScope) === false) {
      reportEscapedDriver(context, reference, site.role)
      continue
    }
    if (callbacksAllowDriver(reference, site.fn, getScope) === false) {
      reportEscapedDriver(context, reference, site.role)
    }
  }
}

export const handleDriverConfinement = defineRule({
  meta,
  create(context: Context) {
    if (isTypeTestFile(context.filename) || isHandleFile(context.filename) === false) return {}
    const getScope = context.sourceCode.getScope
    const resolver = cellOriginResolverOf(context)
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (resolver.kindOf(node.callee) !== 'handle') return
        const options = node.arguments[0]
        if (options === undefined || options.type !== 'ObjectExpression') return
        for (const site of definitionSitesOf(options)) checkDefinition(context, site, getScope)
      },
    }
  },
})
