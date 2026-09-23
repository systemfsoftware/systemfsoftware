import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { EMIT_CALLEES } from './ban-raw-span-name-emit.config.js'
import { TRACE_SPEC_PACKAGE, TRACE_SUFFIX } from './path.config.js'
import {
  HARNESS_PRESCRIPTION,
  HTTP_MEMBERS,
  HTTP_OBJECT_MATCHERS,
  HTTP_PROPERTY_MATCHER,
  HTTP_TERMINATION_ACTUAL,
  HTTP_TERMINATION_EXPECTED,
  HTTP_TERMINATION_FIX,
  meta,
  MISSING_HARNESS_ACTUAL,
  RAW_EMIT_ACTUAL,
  RAW_EMIT_EXPECTED,
  RAW_EMIT_FIX,
} from './trace-test-requires-taxonomy.config.js'

export type MessageIds = 'missingHarnessImport' | 'httpTermination' | 'rawEmitCall'

type TraceLiteral = Extract<ESTree.Node, { type: 'Literal' }>
type ObjectKey = ESTree.ObjectProperty['key']

const asIdentifierName = (
  expression: ESTree.Expression | ESTree.SpreadElement | ESTree.PrivateIdentifier | undefined,
): string | null => {
  if (expression === undefined || expression.type !== 'Identifier') return null
  return expression.name
}

const isEmitCallee = (name: string): boolean => EMIT_CALLEES.some((emit) => emit === name)

const isExpectCall = (node: ESTree.Node | undefined): node is ESTree.CallExpression =>
  node?.type === 'CallExpression' && asIdentifierName(node.callee) === 'expect'

const expectCallUnder = (node: ESTree.CallExpression): ESTree.CallExpression | null => {
  const callee = node.callee
  if (callee.type !== 'MemberExpression' || !isExpectCall(callee.object)) return null
  return callee.object
}

const memberReadName = (argument: ESTree.CallExpression['arguments'][number] | undefined): string | null => {
  if (argument === undefined || argument.type !== 'MemberExpression') return null
  return asIdentifierName(argument.property)
}

const httpReadName = (node: ESTree.CallExpression): string | null => {
  const read = memberReadName(expectCallUnder(node)?.arguments[0])
  if (read === null || HTTP_MEMBERS[read] !== true) return null
  return read
}

const memberCallName = (callee: ESTree.CallExpression['callee']): string | null => {
  if (callee.type !== 'MemberExpression') return null
  return callee.computed ? null : asIdentifierName(callee.property)
}

const emitCalleeName = (node: ESTree.CallExpression): string | null => {
  const direct = asIdentifierName(node.callee)
  return direct ?? memberCallName(node.callee)
}

const rawEmitName = (node: ESTree.CallExpression): string | null => {
  const name = emitCalleeName(node)
  if (name === null || !isEmitCallee(name)) return null
  return name
}

const hasHarnessBinding = (node: ESTree.ImportDeclaration): boolean =>
  node.source.value === TRACE_SPEC_PACKAGE && node.specifiers.length > 0

const literalValueOf = (node: ESTree.Node | undefined): TraceLiteral['value'] | null => {
  if (node === undefined || node.type !== 'Literal') return null
  return node.value
}

const stringLiteralValue = (node: ESTree.Node | undefined): string | null => {
  const value = literalValueOf(node)
  return typeof value === 'string' ? value : null
}

const stringElementValue = (element: ESTree.ArrayExpressionElement | undefined): string | null =>
  stringLiteralValue(element ?? undefined)

const httpMemberName = (name: string): string | null => (HTTP_MEMBERS[name] === true ? name : null)

const httpMemberHead = (path: string): string | null => {
  const head = path.split('.')[0]
  return head === undefined ? null : httpMemberName(head)
}

const propertyPathText = (node: ESTree.Node | undefined): string | null =>
  node?.type === 'ArrayExpression' ? stringElementValue(node.elements[0]) : stringLiteralValue(node)

const toHavePropertyMember = (node: ESTree.CallExpression): string | null => {
  const path = propertyPathText(node.arguments[0])
  return path === null ? null : httpMemberHead(path)
}

const propertyMatchTermination = (node: ESTree.CallExpression, matcher: string): string | null => {
  const member = toHavePropertyMember(node)
  return matcher === HTTP_PROPERTY_MATCHER ? member : null
}

const identifierKeyName = (key: ObjectKey): string | null => {
  if (key.type !== 'Identifier') return null
  return key.name
}

const keyLiteralValue = (key: ObjectKey): TraceLiteral['value'] | null => {
  if (key.type !== 'Literal') return null
  return key.value
}

const stringKeyName = (key: ObjectKey): string | null => {
  const value = keyLiteralValue(key)
  return typeof value === 'string' ? value : null
}

const objectKeyName = (key: ObjectKey): string | null => {
  const identifier = identifierKeyName(key)
  return identifier === null ? stringKeyName(key) : identifier
}

const objectPropertyKey = (property: ESTree.ObjectPropertyKind): ObjectKey | null => {
  if (property.type !== 'Property' || property.computed) return null
  return property.key
}

const propertyKeyName = (property: ESTree.ObjectPropertyKind): string | null => {
  const key = objectPropertyKey(property)
  return key === null ? null : objectKeyName(key)
}

const httpMemberOr = (name: string | null): string | null => name === null ? null : httpMemberName(name)

const propertyValueOf = (property: ESTree.ObjectPropertyKind): ESTree.Expression | null =>
  property.type === 'Property' ? property.value : null

const nestedPropertyHttpKey = (property: ESTree.ObjectPropertyKind): string | null =>
  httpKeyOfValue(propertyValueOf(property))

const httpKeyOfProperty = (property: ESTree.ObjectPropertyKind): string | null => {
  const named = httpMemberOr(propertyKeyName(property))
  return named === null ? nestedPropertyHttpKey(property) : named
}

const elementsHttpKey = (elements: Array<ESTree.ArrayExpressionElement>): string | null => {
  const hit = elements.find((element) => httpKeyOfValue(element) !== null)
  return hit === undefined ? null : httpKeyOfValue(hit)
}

const httpKeyOfNonObject = (value: ESTree.Node | null): string | null =>
  value?.type === 'ArrayExpression' ? elementsHttpKey(value.elements) : null

const httpKeyOfValue = (value: ESTree.Node | null): string | null =>
  value?.type === 'ObjectExpression' ? propertiesHttpKey(value.properties) : httpKeyOfNonObject(value)

const propertiesHttpKey = (properties: Array<ESTree.ObjectPropertyKind>): string | null => {
  const hit = properties.find((property) => httpKeyOfProperty(property) !== null)
  return hit === undefined ? null : httpKeyOfProperty(hit)
}

const isObjectExpression = (node: ESTree.Node): node is ESTree.ObjectExpression => node.type === 'ObjectExpression'

const objectArgumentHttpKey = (node: ESTree.CallExpression): string | null => {
  const argument = node.arguments.find(isObjectExpression)
  return argument === undefined ? null : propertiesHttpKey(argument.properties)
}

const isObjectShapeMatcher = (matcher: string): boolean => HTTP_OBJECT_MATCHERS[matcher] === true

const objectMatchTermination = (node: ESTree.CallExpression, matcher: string): string | null => {
  const key = objectArgumentHttpKey(node)
  return isObjectShapeMatcher(matcher) ? key : null
}

const isExpectIdentifier = (node: ESTree.Expression): boolean => node.type === 'Identifier' && node.name === 'expect'

const isExpectReference = (node: ESTree.Expression): boolean => isExpectCall(node) || isExpectIdentifier(node)

const chainRootsAtExpect = (node: ESTree.Expression): boolean =>
  node.type === 'MemberExpression' ? chainRootsAtExpect(node.object) : isExpectReference(node)

const calleeRootsAtExpect = (callee: ESTree.CallExpression['callee']): boolean =>
  callee.type === 'MemberExpression' ? chainRootsAtExpect(callee.object) : false

const matcherCallName = (node: ESTree.CallExpression): string | null => {
  if (!calleeRootsAtExpect(node.callee)) return null
  return memberCallName(node.callee)
}

const propertyMatchName = (member: string): string => `expect(...).${HTTP_PROPERTY_MATCHER}('${member}')`

const objectMatchName = (matcher: string, key: string): string => `expect(...).${matcher}({ ${key}: ... })`

const objectMatchedName = (node: ESTree.CallExpression, matcher: string): string | null => {
  const key = objectMatchTermination(node, matcher)
  return key === null ? null : objectMatchName(matcher, key)
}

const matchedShapeName = (node: ESTree.CallExpression, matcher: string): string | null => {
  const member = propertyMatchTermination(node, matcher)
  return member === null ? objectMatchedName(node, matcher) : propertyMatchName(member)
}

const shapeTerminationName = (node: ESTree.CallExpression): string | null => {
  const matcher = matcherCallName(node)
  return matcher === null ? null : matchedShapeName(node, matcher)
}

const httpTerminationName = (node: ESTree.CallExpression): string | null => {
  const direct = httpReadName(node)
  return direct === null ? shapeTerminationName(node) : `expect(...${direct})`
}

const reportRawEmit = (context: Context, node: ESTree.CallExpression): void => {
  const name = rawEmitName(node)
  if (name === null) return
  context.report({
    node,
    messageId: 'rawEmitCall',
    data: {
      name: `${name}(...) inside a trace spec`,
      expected: RAW_EMIT_EXPECTED,
      actual: RAW_EMIT_ACTUAL,
      fix: RAW_EMIT_FIX,
    },
  })
}

const reportHttpTermination = (context: Context, node: ESTree.CallExpression): void => {
  const name = httpTerminationName(node)
  if (name === null) return
  context.report({
    node,
    messageId: 'httpTermination',
    data: {
      name: `${name} inside a trace spec`,
      expected: HTTP_TERMINATION_EXPECTED,
      actual: HTTP_TERMINATION_ACTUAL,
      fix: HTTP_TERMINATION_FIX,
    },
  })
}

export const traceTestRequiresTaxonomy = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith(TRACE_SUFFIX)) return {}

    let hasHarnessImport = false

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (hasHarnessBinding(node)) hasHarnessImport = true
      },
      CallExpression(node: ESTree.CallExpression) {
        reportRawEmit(context, node)
        reportHttpTermination(context, node)
      },
      'Program:exit'(node: ESTree.Program) {
        if (hasHarnessImport) return
        context.report({
          node,
          messageId: 'missingHarnessImport',
          data: {
            name: `a *.trace.test.ts without ${TRACE_SPEC_PACKAGE}`,
            expected: HARNESS_PRESCRIPTION,
            actual: MISSING_HARNESS_ACTUAL,
            fix: HARNESS_PRESCRIPTION,
          },
        })
      },
    }
  },
})
