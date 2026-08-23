import babel from '@babel/core'
import * as Predicate from 'effect/Predicate'

import { type MutatorContext, type NodeMutator } from './node-mutator.js'
import { registerMutator } from './registry.js'

const { types } = babel

export const blockStatementMutator: NodeMutator = {
  name: 'BlockStatement',

  *mutate(node, context: MutatorContext) {
    if (types.isBlockStatement(node) && isValid(node, context)) {
      yield types.blockStatement([])
    }
  },
}

function isValid(node: babel.types.BlockStatement, context: MutatorContext): boolean {
  return !isEmpty(node) && !isInvalidConstructorBody(node, context)
}

function isEmpty(node: babel.types.BlockStatement): boolean {
  return node.body.length === 0
}

function isInvalidConstructorBody(node: babel.types.BlockStatement, context: MutatorContext): boolean {
  const parent = context.parent
  if (parent === undefined || !types.isClassMethod(parent) || parent.kind !== 'constructor') {
    return false
  }
  const hasParamProps = parent.params.some((param) => types.isTSParameterProperty(param))
  const hasInitProps = containsInitializedClassProperties(parent, context)
  const hasSuper = hasSuperExpression(node)
  return (hasParamProps || hasInitProps) && hasSuper
}

function containsInitializedClassProperties(constructor: babel.types.ClassMethod, context: MutatorContext): boolean {
  const grandParent = context.grandParent
  if (grandParent === undefined || !types.isClassBody(grandParent)) {
    return false
  }
  return grandParent.body.some((classMember) =>
    types.isClassProperty(classMember) && classMember.value !== null && classMember.value !== undefined
  )
}

function hasSuperExpression(block: babel.types.BlockStatement): boolean {
  return containsSuperCall(block)
}

function isSuperType(node: unknown): boolean {
  return Predicate.hasProperty(node, 'type') && node['type'] === 'Super'
}

function isSuperCallExpression(node: unknown): boolean {
  return (
    Predicate.hasProperty(node, 'type') &&
    node['type'] === 'CallExpression' &&
    Predicate.hasProperty(node, 'callee') &&
    isSuperType(node['callee'])
  )
}

function containsSuperCall(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) {
    return false
  }
  if (isSuperType(node) || isSuperCallExpression(node)) {
    return true
  }
  return hasSuperInChildren(node)
}

function hasSuperInChildren(node: object): boolean {
  for (const key of Object.keys(node)) {
    if (!Predicate.hasProperty(node, key)) {
      continue
    }
    const value = node[key]
    if (Array.isArray(value)) {
      for (const element of value) {
        if (containsSuperCall(element)) {
          return true
        }
      }
    } else if (typeof value === 'object' && value !== null && containsSuperCall(value)) {
      return true
    }
  }
  return false
}

registerMutator(blockStatementMutator)
