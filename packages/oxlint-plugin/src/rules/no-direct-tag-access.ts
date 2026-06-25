// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const DEFAULT_EXPECTED =
  'Effect Match API or type guards — Match.tag(value, { Tag1: () => ... }), Result.isSuccess/Result.isFailure, Either.isLeft/Either.isRight, Exit.isSuccess/Exit.isFailure, Option.isSome/Option.isNone'
const DEFAULT_FIX =
  'Replace obj._tag === "X" with Match.tag(obj, { X: () => ... }) or use Result.isSuccess/isFailure, Either.isLeft/isRight, Exit.isSuccess/isFailure, Option.isSome/isNone as appropriate'

const OptionsElement = S.Struct({
  allow: S.optionalWith(
    S.Array(S.String).pipe(S.annotations({
      description: 'Allowed _tag access expressions (e.g., ["result._tag"])',
    })),
    { default: () => [] },
  ),
  expected: S.optionalWith(
    S.String.pipe(S.annotations({
      description: 'Custom expected message',
    })),
    { default: () => DEFAULT_EXPECTED },
  ),
  fix: S.optionalWith(
    S.String.pipe(S.annotations({
      description: 'Custom fix message',
    })),
    { default: () => DEFAULT_FIX },
  ),
})

export type Options = [S.Schema.Type<typeof OptionsElement>]
export type MessageIds = 'forbidden'

const TAG_NAME = '_tag'

const isTagProperty = (prop: ESTree.Node): boolean =>
  (prop.type === 'Identifier' && prop.name === TAG_NAME) ||
  (prop.type === 'Literal' && prop.value === TAG_NAME)

const isInComparisonOrSwitch = (node: ESTree.MemberExpression): boolean => {
  const parent = node.parent
  if (
    parent.type === 'BinaryExpression' &&
    (parent.operator === '===' || parent.operator === '!==')
  ) {
    return true
  }
  if (parent.type === 'SwitchStatement' && parent.discriminant === node) {
    return true
  }
  return false
}

export const noDirectTagAccess = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban direct _tag access. Configurable: expected, fix, allow.',
    },
    schema: [
      JSONSchema.make(OptionsElement),
    ],
    messages: {
      forbidden: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context) {
    // Stryker restore all
    const options = S.decodeUnknownSync(OptionsElement)(context.options[0] ?? {})
    const allow = new Set(options.allow)
    const { expected, fix } = options

    return {
      MemberExpression(node: ESTree.MemberExpression) {
        if (!isTagProperty(node.property)) return
        if (!isInComparisonOrSwitch(node)) return

        const source = context.sourceCode.getText(node.object)
        const accessName = `${source}._tag`
        if (allow.has(accessName)) return

        context.report({
          node: node.property,
          messageId: 'forbidden',
          data: {
            name: accessName,
            expected,
            actual: 'direct _tag property access',
            fix,
          },
        })
      },
    }
  },
})
