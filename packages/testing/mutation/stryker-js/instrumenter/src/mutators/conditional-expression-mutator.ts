import babel from '@babel/core'

import { deepCloneNode } from '../babel/clone.js'

import type { Mutator, MutatorContext } from './mutator.js'

const booleanOperators = Object.freeze(['!=', '!==', '&&', '<', '<=', '==', '===', '>', '>=', '||'])

const { types } = babel

export const conditionalExpressionMutator: Mutator = function*(node, context: MutatorContext) {
  if (isTestOfLoop(node, context)) {
    yield types.booleanLiteral(false)
  } else if (isTestOfCondition(node, context)) {
    yield types.booleanLiteral(true)
    yield types.booleanLiteral(false)
  } else if (isBooleanExpression(node)) {
    const parent = context.parent
    if (parent !== undefined && types.isLogicalExpression(parent)) {
      if (parent.operator === '||') {
        yield types.booleanLiteral(false)
        return
      }
      if (parent.operator === '&&') {
        yield types.booleanLiteral(true)
        return
      }
    }
    yield types.booleanLiteral(true)
    yield types.booleanLiteral(false)
  } else if (types.isForStatement(node) && node.test === null) {
    const replacement = deepCloneNode(node)
    replacement.test = types.booleanLiteral(false)
    yield replacement
  } else if (types.isSwitchCase(node) && node.consequent.length > 0) {
    const replacement = deepCloneNode(node)
    replacement.consequent = []
    yield replacement
  }
}

function isTestOfLoop(node: babel.types.Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return false
  }
  if (types.isForStatement(parent) && parent.test === node) {
    return true
  }
  if (types.isWhileStatement(parent) && parent.test === node) {
    return true
  }
  if (types.isDoWhileStatement(parent) && parent.test === node) {
    return true
  }
  return false
}

function isTestOfCondition(node: babel.types.Node, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined) {
    return false
  }
  return types.isIfStatement(parent) && parent.test === node
}

function isBooleanExpression(node: babel.types.Node): boolean {
  if (types.isBinaryExpression(node)) {
    return booleanOperators.includes(node.operator)
  }
  if (types.isLogicalExpression(node)) {
    return booleanOperators.includes(node.operator)
  }
  return false
}
