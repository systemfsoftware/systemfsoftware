import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'

import { ARRAY_METHODS, COMPARISON_OPS, EITHER_TAGS, meta, TAG_MATCHERS } from './no-either-tag-assertions.config.js'

export type Options = []

export type MessageIds =
  | 'expectTagMatcher'
  | 'tagComparison'
  | 'objectContainingTag'
  | 'unwrapTagAccess'
  | 'typeGuardAssertion'
  | 'switchOnTag'
  | 'computedTagAccess'
  | 'callbackTagAccess'

const TEST_EXTENSIONS: ReadonlyArray<string> = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx']

const isTestFile = (filename: string): boolean => TEST_EXTENSIONS.some((ext) => filename.endsWith(ext))

const isEitherTagLiteral = (node: ESTree.Node): node is ESTree.StringLiteral =>
  node.type === 'Literal' && EITHER_TAGS.has(node.value)

const isStringLiteral = (node: ESTree.Node): node is ESTree.StringLiteral =>
  node.type === 'Literal' && typeof node.value === 'string'

const isBooleanLiteral = (node: ESTree.Node): node is ESTree.BooleanLiteral =>
  node.type === 'Literal' && typeof node.value === 'boolean'

const matchesEitherTag = (value: string): boolean => {
  const upper = value.toUpperCase()
  return upper.includes('LEFT') || upper.includes('RIGHT')
}

const isTagMemberExpression = (node: ESTree.Node): node is ESTree.MemberExpression =>
  node.type === 'MemberExpression' &&
  node.computed === false &&
  node.property.name === '_tag'

const isComputedTagAccess = (node: ESTree.MemberExpression): boolean =>
  node.property.type === 'Literal' &&
  node.property.value === '_tag'

const isEitherIsLeftCall = (node: ESTree.Node): 'isLeft' | 'isRight' | undefined => {
  if (node.type !== 'CallExpression') return undefined
  if (node.callee.type !== 'MemberExpression' || node.callee.computed !== false) return undefined
  if (node.callee.object.type !== 'Identifier' || node.callee.object.name !== 'Either') return undefined
  const name = node.callee.property.name
  if (name !== 'isLeft' && name !== 'isRight') return undefined
  return name
}

const isUnwrapMember = (node: ESTree.Node): { member: ESTree.MemberExpression; side: 'left' | 'right' } | undefined => {
  if (node.type !== 'MemberExpression' || node.computed !== false) return undefined
  const name = node.property.name
  if (name !== 'left' && name !== 'right') return undefined
  return { member: node, side: name }
}

const isArrayMethodCallback = (node: ESTree.Node): boolean => {
  const parent = node.parent
  if (parent != null) {
    if (parent.type === 'ArrowFunctionExpression') {
      const arrowParent = parent.parent
      if (
        arrowParent.type === 'CallExpression' &&
        arrowParent.callee.type === 'MemberExpression' &&
        arrowParent.callee.computed === false &&
        ARRAY_METHODS.has(arrowParent.callee.property.name)
      ) {
        return true
      }
      return false
    }
    return isArrayMethodCallback(parent)
  }
  return false
}

const isInsideEitherVariant = (node: ESTree.Node): boolean => {
  const current = node.parent
  if (current != null) {
    if (current.type !== 'CallExpression') return isInsideEitherVariant(current)
    if (current === node) return isInsideEitherVariant(current.parent)
    const callee = current.callee
    if (callee.type !== 'MemberExpression' || callee.computed !== false) return false
    if (callee.object.type !== 'Identifier' || callee.object.name !== 'Either') return false
    const name = callee.property.name
    if (name === 'left' || name === 'right') return true
    return false
  }
  return false
}

const isObjectContainingCall = (callee: ESTree.Node): boolean =>
  callee.type === 'MemberExpression' &&
  callee.computed === false &&
  callee.object.type === 'Identifier' &&
  callee.object.name === 'expect' &&
  callee.property.name === 'objectContaining'

const isEitherUnwrapCall = (
  obj: ESTree.Node,
): { method: 'getLeft' | 'getRight' | 'getOrThrow'; call: ESTree.CallExpression } | undefined => {
  if (obj.type === 'CallExpression') {
    const call = obj
    if (
      call.callee.type === 'MemberExpression' &&
      call.callee.computed === false &&
      call.callee.object.type === 'Identifier' &&
      call.callee.object.name === 'Either'
    ) {
      const method = call.callee.property.name
      if (method === 'getLeft' || method === 'getRight' || method === 'getOrThrow') {
        return { method, call }
      }
    }
  }
  return undefined
}

const getGuardSource = (
  expectArg: ESTree.CallExpression,
  sourceCode: { getText(node: ESTree.Node): string },
): string =>
  expectArg.arguments[0] != null
    ? sourceCode.getText(expectArg.arguments[0]!)
    : 'value'

export const noEitherTagAssertions = defineRule({
  meta,
  create(context) {
    if (!isTestFile(context.filename)) {
      return {}
    }

    const getSourceText = (node: ESTree.Node): string => context.sourceCode.getText(node)

    const walkToMatcher = (
      start: ESTree.Node,
    ): { matcherName: string; matcherCall: ESTree.CallExpression; hasNot: boolean } | undefined => {
      if (start.type !== 'MemberExpression' || start.computed !== false) return undefined
      if (start.property.name === 'not') {
        const walked = walkToMatcher(start.parent)
        if (walked != null) {
          return { ...walked, hasNot: !walked.hasNot }
        }
        return undefined
      }
      const matcherCall = start.parent
      if (matcherCall.type !== 'CallExpression') return undefined
      return { matcherName: start.property.name, matcherCall, hasNot: false }
    }

    const checkExpectTagMatcher = (node: ESTree.MemberExpression): void => {
      if (!isTagMemberExpression(node)) return

      const expectCall = node.parent
      if (
        expectCall.type !== 'CallExpression' ||
        expectCall.arguments[0] !== node
      ) return

      const walked = walkToMatcher(expectCall.parent)
      if (walked == null) return
      const { matcherName, matcherCall, hasNot } = walked

      if (!TAG_MATCHERS.has(matcherName)) return

      const arg = matcherCall.arguments[0]
      if (arg == null) return

      let isEither: boolean
      if (isStringLiteral(arg)) {
        isEither = matchesEitherTag(arg.value)
      } else {
        isEither = false
      }

      if (!isEither) return

      const source = getSourceText(node.object)
      const name = source + '._tag'

      const canSuggest = (matcherName === 'toBe' || matcherName === 'toEqual' || matcherName === 'toStrictEqual') &&
        isStringLiteral(arg) &&
        EITHER_TAGS.has(arg.value)

      if (!canSuggest) {
        context.report({
          node: node.property,
          messageId: 'expectTagMatcher',
          data: { name },
        })
        return
      }

      const tag = arg.value
      const variant = tag === 'Left' ? 'Either.left' : 'Either.right'
      const replacement = hasNot
        ? `expect(${source}).not.toEqual(${variant}(${source}))`
        : `expect(${source}).toEqual(${variant}(${source}))`

      context.report({
        node: node.property,
        messageId: 'expectTagMatcher',
        data: { name },
        suggest: [
          {
            messageId: 'expectTagMatcher',
            data: { name },
            fix(fixer) {
              return fixer.replaceText(matcherCall, replacement)
            },
          },
        ],
      })
    }

    const checkTagComparison = (node: ESTree.MemberExpression): void => {
      if (!isTagMemberExpression(node)) return
      if (isArrayMethodCallback(node)) return

      if (isUnwrapMember(node.object) != null) return

      const parent = node.parent
      if (parent.type !== 'BinaryExpression') return

      if (!COMPARISON_OPS.has(parent.operator)) return

      const otherOperand = parent.left === node ? parent.right : parent.left
      if (!isEitherTagLiteral(otherOperand)) return

      const source = getSourceText(node.object)
      context.report({
        node: node.property,
        messageId: 'tagComparison',
        data: { name: source + '._tag' },
      })
    }

    const checkObjectContainingTag = (node: ESTree.CallExpression): void => {
      if (!isObjectContainingCall(node.callee)) return

      const arg = node.arguments[0]
      if (arg?.type !== 'ObjectExpression') return

      const insideEitherVariant = isInsideEitherVariant(node)

      for (const prop of arg.properties) {
        if (
          prop.type !== 'Property' ||
          prop.key.type !== 'Identifier' ||
          prop.key.name !== '_tag'
        ) {
          continue
        }

        if (!('value' in prop.value)) {
          continue
        }

        const tagValue = prop.value.value
        const isEitherTag = EITHER_TAGS.has(tagValue)

        if (insideEitherVariant || isEitherTag) {
          const name = `{ _tag: "${tagValue}" }`
          context.report({
            node: prop.key,
            messageId: 'objectContainingTag',
            data: { name },
          })
          return
        }
      }
    }

    const checkUnwrapTagAccess = (node: ESTree.MemberExpression): void => {
      if (!isTagMemberExpression(node)) return

      const obj = node.object

      const unwrapCall = isEitherUnwrapCall(obj)
      if (unwrapCall != null) {
        const source = unwrapCall.call.arguments[0] !== undefined
          ? getSourceText(unwrapCall.call.arguments[0]!)
          : 'value'
        context.report({
          node: node.property,
          messageId: 'unwrapTagAccess',
          data: { name: `Either.${unwrapCall.method}(${source})._tag` },
        })
        return
      }

      const unwrapped = isUnwrapMember(obj)
      if (unwrapped == null) return

      const parent = node.parent
      if (parent.type !== 'BinaryExpression') return
      if (!COMPARISON_OPS.has(parent.operator)) return

      const otherOperand = parent.left === node ? parent.right : parent.left
      if (!isEitherTagLiteral(otherOperand)) return

      const source = getSourceText(unwrapped.member.object)
      context.report({
        node: node.property,
        messageId: 'unwrapTagAccess',
        data: { name: `${source}.${unwrapped.side}._tag` },
      })
    }

    const checkTypeGuardAssertion = (node: ESTree.CallExpression): void => {
      if (node.callee.type !== 'MemberExpression' || node.callee.computed !== false) return
      const matcherName = node.callee.property.name

      let hasNot = false
      let targetObj: ESTree.Node = node.callee.object

      if (
        targetObj.type === 'MemberExpression' &&
        targetObj.computed === false &&
        targetObj.property.name === 'not'
      ) {
        hasNot = true
        targetObj = targetObj.object
      }

      if (targetObj.type !== 'CallExpression') return
      if (targetObj.callee.type !== 'Identifier' || targetObj.callee.name !== 'expect') return

      const expectArg = targetObj.arguments[0]
      if (expectArg?.type !== 'CallExpression') return

      const guard = isEitherIsLeftCall(expectArg)
      if (guard == null) return

      const isToBeBoolean = matcherName === 'toBe' && node.arguments[0] != null && isBooleanLiteral(node.arguments[0])
      const isTruthyFalsy = (matcherName === 'toBeTruthy' || matcherName === 'toBeFalsy') && !hasNot

      if (isToBeBoolean || isTruthyFalsy) {
        const source = getGuardSource(expectArg, context.sourceCode)
        const guardNode = expectArg.callee.type === 'MemberExpression'
          ? expectArg.callee.property
          : expectArg.callee
        context.report({
          node: guardNode,
          messageId: 'typeGuardAssertion',
          data: { name: `Either.${guard}(${source})` },
        })
      }
    }

    const checkSwitchOnTag = (node: ESTree.SwitchStatement): void => {
      const { discriminant } = node

      if (isTagMemberExpression(discriminant)) {
        const hasEitherCase = node.cases.some((switchCase) => {
          if (switchCase.test == null) return false
          if (!('value' in switchCase.test)) return false
          return EITHER_TAGS.has(switchCase.test.value)
        })

        if (hasEitherCase) {
          const source = getSourceText(discriminant.object)
          context.report({
            node: discriminant.property,
            messageId: 'switchOnTag',
            data: { name: `${source}._tag` },
          })
        }
      }
    }

    const checkComputedTagAccess = (node: ESTree.MemberExpression): void => {
      if (!isComputedTagAccess(node)) return

      const parent = node.parent
      if (parent.type !== 'BinaryExpression') return

      if (!COMPARISON_OPS.has(parent.operator)) return

      const otherOperand = parent.left === node ? parent.right : parent.left
      if (!isEitherTagLiteral(otherOperand)) return

      const source = getSourceText(node.object)
      context.report({
        node: node.property,
        messageId: 'computedTagAccess',
        data: { name: `${source}['_tag']` },
      })
    }

    const checkCallbackTagAccess = (node: ESTree.MemberExpression): void => {
      if (!isTagMemberExpression(node)) return

      if (!isArrayMethodCallback(node)) return

      const source = getSourceText(node.object)
      context.report({
        node: node.property,
        messageId: 'callbackTagAccess',
        data: { name: `${source}._tag` },
      })
    }

    return {
      MemberExpression(node: ESTree.MemberExpression) {
        checkExpectTagMatcher(node)
        checkTagComparison(node)
        checkUnwrapTagAccess(node)
        checkComputedTagAccess(node)
        checkCallbackTagAccess(node)
      },

      CallExpression(node: ESTree.CallExpression) {
        checkTypeGuardAssertion(node)
        checkObjectContainingTag(node)
      },

      SwitchStatement(node: ESTree.SwitchStatement) {
        checkSwitchOnTag(node)
      },
    }
  },
})
