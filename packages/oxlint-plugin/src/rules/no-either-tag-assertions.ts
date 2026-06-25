// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'

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

const EITHER_TAGS = new Set(['Left', 'Right'])

const TAG_MATCHERS = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
  'toContain',
  'toMatch',
])

const ARRAY_METHODS = new Set([
  'filter',
  'find',
  'findIndex',
  'some',
  'every',
  'map',
  'flatMap',
])

const COMPARISON_OPS = new Set(['===', '!==', '==', '!='])

const isTestFile = (filename: string): boolean =>
  filename.endsWith('.test.ts') ||
  filename.endsWith('.test.tsx') ||
  filename.endsWith('.spec.ts') ||
  filename.endsWith('.spec.tsx')

const isEitherTagLiteral = (node: ESTree.Node): node is ESTree.StringLiteral =>
  node.type === 'Literal' &&
  typeof node.value === 'string' &&
  EITHER_TAGS.has(node.value)

const isStringLiteral = (node: ESTree.Node): node is ESTree.StringLiteral =>
  node.type === 'Literal' && typeof node.value === 'string'

const isBooleanLiteral = (node: ESTree.Node): boolean => node.type === 'Literal' && typeof node.value === 'boolean'

const isRegexLiteral = (node: ESTree.Node): node is ESTree.Node & { value: RegExp } =>
  node.type === 'Literal' && node.value instanceof RegExp

const matchesEitherTag = (value: string): boolean => {
  const upper = value.toUpperCase()
  return upper.includes('LEFT') || upper.includes('RIGHT')
}

const isTagMemberExpression = (node: ESTree.MemberExpression): boolean =>
  node.computed === false &&
  node.property.type === 'Identifier' &&
  node.property.name === '_tag'

const isComputedTagAccess = (node: ESTree.MemberExpression): boolean =>
  node.computed === true &&
  node.property.type === 'Literal' &&
  node.property.value === '_tag'

const isEitherTypeGuardCall = (
  node: ESTree.CallExpression,
): { guard: 'isLeft' | 'isRight'; hasSource: boolean } | undefined => {
  const { callee } = node
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Either' &&
    callee.property.type === 'Identifier'
  ) {
    const name = callee.property.name
    if (name === 'isLeft' || name === 'isRight') {
      return { guard: name, hasSource: node.arguments.length > 0 }
    }
  }
  return undefined
}

const isUnwrapMember = (node: ESTree.MemberExpression): 'left' | 'right' | undefined =>
  !node.computed &&
    node.property.type === 'Identifier' &&
    (node.property.name === 'left' || node.property.name === 'right')
    ? node.property.name
    : undefined

const isArrayMethodCallback = (node: ESTree.Node): boolean => {
  let parent = node.parent
  while (parent != null) {
    if (parent.type === 'ArrowFunctionExpression') {
      const arrowParent = parent.parent
      if (
        arrowParent != null &&
        arrowParent.type === 'CallExpression' &&
        arrowParent.callee.type === 'MemberExpression' &&
        arrowParent.callee.property.type === 'Identifier' &&
        ARRAY_METHODS.has(arrowParent.callee.property.name)
      ) {
        return true
      }
      return false
    }
    parent = parent.parent
  }
  return false
}

const isInsideEitherVariant = (node: ESTree.Node): boolean => {
  let current = node.parent
  while (current != null) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'MemberExpression' &&
      current.callee.object.type === 'Identifier' &&
      current.callee.object.name === 'Either' &&
      current.callee.property.type === 'Identifier' &&
      (current.callee.property.name === 'left' || current.callee.property.name === 'right')
    ) {
      return true
    }
    if (current.type === 'CallExpression' && current !== node) {
      break
    }
    current = current.parent
  }
  return false
}

const isInsideObjectContaining = (node: ESTree.Node): boolean => {
  let current = node.parent
  while (current != null) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'MemberExpression' &&
      current.callee.object.type === 'Identifier' &&
      current.callee.object.name === 'expect' &&
      current.callee.property.type === 'Identifier' &&
      current.callee.property.name === 'objectContaining'
    ) {
      return true
    }
    if (current.type === 'CallExpression') {
      break
    }
    current = current.parent
  }
  return false
}

const getGuardSource = (
  guard: { guard: string; hasSource: boolean },
  expectArg: ESTree.CallExpression,
  sourceCode: { getText(node: ESTree.Node): string },
): string =>
  guard.hasSource && expectArg.arguments[0] != null
    ? sourceCode.getText(expectArg.arguments[0]!)
    : 'value'

// Stryker restore all

export const noEitherTagAssertions = defineRule({
  // Stryker disable all
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban Either _tag assertions in test files. Use expect().toEqual(Either.left/right(...)) instead.',
    },
    schema: [],
    messages: {
      expectTagMatcher:
        '{{name}} is forbidden. Expected: expect(result).toEqual(Either.left/right(...)). Actual: direct _tag assertion. Fix: Replace expect(X._tag).toBe("Left") with expect(X).toEqual(Either.left(...)).',
      tagComparison:
        '{{name}} is forbidden. Expected: expect(X).toEqual(Either.left/right(...)) or Either.isLeft/isRight guard. Actual: direct _tag comparison. Fix: Replace X._tag === "Left" with Either.isLeft(X) or expect(X).toEqual(Either.left(...)).',
      objectContainingTag:
        '{{name}} is forbidden. Expected: structured assertion without _tag. Actual: _tag inside expect.objectContaining. Fix: Remove _tag and assert the full Either value with expect(X).toEqual(Either.left/right(...)).',
      unwrapTagAccess:
        '{{name}} is forbidden. Expected: Either.getLeft/Either.getRight after guard or expect(X).toEqual(Either.left/right(...)). Actual: _tag on unwrapped property. Fix: Assert the full Either value instead.',
      typeGuardAssertion:
        '{{name}} is forbidden. Expected: expect(result).toEqual(Either.left/right(...)). Actual: Either type guard wrapped in expect(). Fix: Assert the full Either value directly.',
      switchOnTag:
        '{{name}} is forbidden. Expected: Either.match or expect().toEqual(Either.left/right(...)). Actual: switch on _tag. Fix: Use Either.match({ Left: ..., Right: ... }, value) or structured assertions.',
      computedTagAccess:
        '{{name}} is forbidden. Expected: expect(X).toEqual(Either.left/right(...)) or Either.isLeft/isRight guard. Actual: computed _tag access. Fix: Replace X["_tag"] === "Left" with expect(X).toEqual(Either.left(...)).',
      callbackTagAccess:
        '{{name}} is forbidden. Expected: Either.isLeft/isRight in callback. Actual: _tag access in array method callback. Fix: Use Either.isLeft/isRight for type narrowing.',
    },
    hasSuggestions: true,
  },
  // Stryker restore all
  create(context) {
    if (!isTestFile(context.filename)) {
      return {}
    }

    const getSourceText = (node: ESTree.Node): string => context.sourceCode.getText(node)

    const checkExpectTagMatcher = (node: ESTree.MemberExpression): void => {
      if (!isTagMemberExpression(node)) return

      const expectCall = node.parent
      if (expectCall?.type !== 'CallExpression') return
      if (
        expectCall.callee.type !== 'Identifier' ||
        expectCall.callee.name !== 'expect'
      ) return
      if (expectCall.arguments[0] !== node) return

      let matcherMember = expectCall.parent
      let hasNot = false

      while (matcherMember?.type === 'MemberExpression') {
        if (
          matcherMember.property.type === 'Identifier' &&
          matcherMember.property.name === 'not'
        ) {
          hasNot = !hasNot
          matcherMember = matcherMember.parent
          continue
        }
        break
      }

      if (matcherMember?.type !== 'MemberExpression') return

      const matcherName = matcherMember.property.type === 'Identifier'
        ? matcherMember.property.name
        : undefined
      if (matcherName == null) return

      const matcherCall = matcherMember.parent
      if (matcherCall?.type !== 'CallExpression') return

      if (TAG_MATCHERS.has(matcherName)) {
        const arg = matcherCall.arguments[0]
        if (arg == null) return

        const isEither = isEitherTagLiteral(arg) ||
          (isStringLiteral(arg) && matchesEitherTag(arg.value)) ||
          (isRegexLiteral(arg) && matchesEitherTag(String(arg.value)))

        if (!isEither) return

        const source = getSourceText(node.object)
        const name = source + '._tag'

        const canSuggest = (matcherName === 'toBe' || matcherName === 'toEqual' || matcherName === 'toStrictEqual') &&
          isStringLiteral(arg) &&
          EITHER_TAGS.has(arg.value)

        if (canSuggest) {
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
        } else {
          context.report({
            node: node.property,
            messageId: 'expectTagMatcher',
            data: { name },
          })
        }
      }
    }

    const checkTagComparison = (node: ESTree.MemberExpression): void => {
      if (!isTagMemberExpression(node)) return
      if (isArrayMethodCallback(node)) return

      const obj = node.object
      if (
        obj.type === 'MemberExpression' &&
        !obj.computed &&
        obj.property.type === 'Identifier' &&
        (obj.property.name === 'left' || obj.property.name === 'right')
      ) return

      const parent = node.parent
      if (parent?.type !== 'BinaryExpression') return

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
      const { callee } = node

      if (
        callee.type !== 'MemberExpression' ||
        callee.object.type !== 'Identifier' ||
        callee.object.name !== 'expect' ||
        callee.property.type !== 'Identifier' ||
        callee.property.name !== 'objectContaining'
      ) {
        return
      }

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

        if (prop.value.type !== 'Literal' || typeof prop.value.value !== 'string') {
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

    const checkNestedLeftRightTag = (node: ESTree.ObjectExpression): void => {
      if (!isInsideObjectContaining(node)) return

      for (const prop of node.properties) {
        if (
          prop.type !== 'Property' ||
          prop.key.type !== 'Identifier' ||
          (prop.key.name !== 'left' && prop.key.name !== 'right')
        ) {
          continue
        }

        if (prop.value.type !== 'ObjectExpression') continue

        for (const innerProp of prop.value.properties) {
          if (
            innerProp.type !== 'Property' ||
            innerProp.key.type !== 'Identifier' ||
            innerProp.key.name !== '_tag'
          ) {
            continue
          }

          if (innerProp.value.type !== 'Literal' || typeof innerProp.value.value !== 'string') {
            continue
          }

          const side = prop.key.name
          const tagValue = innerProp.value.value
          const name = `{ ${side}: { _tag: "${tagValue}" } }`

          context.report({
            node: innerProp.key,
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

      if (
        obj.type === 'CallExpression' &&
        obj.callee.type === 'MemberExpression' &&
        obj.callee.object.type === 'Identifier' &&
        obj.callee.object.name === 'Either' &&
        obj.callee.property.type === 'Identifier'
      ) {
        const methodName = obj.callee.property.name
        if (methodName === 'getLeft' || methodName === 'getRight' || methodName === 'getOrThrow') {
          const source = obj.arguments[0]
            ? getSourceText(obj.arguments[0]!)
            : 'value'
          context.report({
            node: node.property,
            messageId: 'unwrapTagAccess',
            data: { name: `Either.${methodName}(${source})._tag` },
          })
          return
        }
      }

      if (obj.type !== 'MemberExpression') return

      const unwrapSide = isUnwrapMember(obj)
      if (unwrapSide == null) return

      const parent = node.parent
      if (parent?.type !== 'BinaryExpression') return
      if (!COMPARISON_OPS.has(parent.operator)) return

      const otherOperand = parent.left === node ? parent.right : parent.left
      if (!isEitherTagLiteral(otherOperand)) return

      const source = getSourceText(obj.object)
      context.report({
        node: node.property,
        messageId: 'unwrapTagAccess',
        data: { name: `${source}.${unwrapSide}._tag` },
      })
    }

    const checkTypeGuardAssertion = (node: ESTree.CallExpression): void => {
      const { callee } = node

      if (callee.type !== 'MemberExpression') return
      if (callee.property.type !== 'Identifier') return

      const matcherName = callee.property.name

      let hasNot = false
      let targetObj: ESTree.Node = callee.object

      if (
        targetObj.type === 'MemberExpression' &&
        targetObj.property.type === 'Identifier' &&
        targetObj.property.name === 'not'
      ) {
        hasNot = true
        targetObj = targetObj.object
      }

      if (targetObj.type !== 'CallExpression') return
      if (targetObj.callee.type !== 'Identifier' || targetObj.callee.name !== 'expect') return

      const expectArg = targetObj.arguments[0]
      if (expectArg?.type !== 'CallExpression') return

      const guard = isEitherTypeGuardCall(expectArg)
      if (guard == null) return

      const isToBeBoolean = matcherName === 'toBe' && node.arguments[0] != null && isBooleanLiteral(node.arguments[0])
      const isTruthyFalsy = (matcherName === 'toBeTruthy' || matcherName === 'toBeFalsy') && !hasNot

      if (isToBeBoolean || isTruthyFalsy) {
        const source = getGuardSource(guard, expectArg, context.sourceCode)
        const guardNode = expectArg.callee.type === 'MemberExpression'
          ? expectArg.callee.property
          : expectArg.callee
        context.report({
          node: guardNode,
          messageId: 'typeGuardAssertion',
          data: { name: `Either.${guard.guard}(${source})` },
        })
      }
    }

    const checkSwitchOnTag = (node: ESTree.SwitchStatement): void => {
      const { discriminant } = node

      if (
        discriminant.type === 'MemberExpression' &&
        isTagMemberExpression(discriminant)
      ) {
        const hasEitherCase = node.cases.some((switchCase) =>
          switchCase.test != null &&
          switchCase.test.type === 'Literal' &&
          typeof switchCase.test.value === 'string' &&
          EITHER_TAGS.has(switchCase.test.value)
        )

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
      if (parent?.type !== 'BinaryExpression') return

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

      ObjectExpression(node: ESTree.ObjectExpression) {
        checkNestedLeftRightTag(node)
      },

      SwitchStatement(node: ESTree.SwitchStatement) {
        checkSwitchOnTag(node)
      },
    }
  },
})
