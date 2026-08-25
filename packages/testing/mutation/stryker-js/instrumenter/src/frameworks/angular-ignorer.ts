import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'

import { type IgnorerService, type NodePath } from '@systemfsoftware/stryker-js-plugin-api/ignore'

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

export function shouldIgnore(path: NodePath): Option.Option<string> {
  if (isInputModelOrOutputConfigurationObject(path)) {
    return Option.some(INPUT_MODEL_OUTPUT_CONFIG_MSG)
  }
  if (isSignalQueryOptionsObject(path)) {
    return Option.some(SIGNAL_QUERY_OPTIONS_MSG)
  }
  return Option.none()
}

export const angularIgnorer: IgnorerService = {
  shouldIgnore,
}

function isClassFieldLike(path: NodePath): boolean {
  return path.isClassProperty() || path.isClassPrivateProperty() || path.isClassAccessorProperty()
}

function isInputModelOrOutputConfigurationObject(path: NodePath): boolean {
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

function isSignalQueryOptionsObject(path: NodePath): boolean {
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
