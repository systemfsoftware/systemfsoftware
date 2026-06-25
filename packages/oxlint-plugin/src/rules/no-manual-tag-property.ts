// Stryker disable all
import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { JSONSchema, Schema as S } from 'effect'

const Options = S.Struct({
  allow: S.optionalWith(
    S.Array(S.String),
    { default: () => [] },
  ),
  expected: S.optionalWith(
    S.String,
    { default: () => 'Schema.TaggedClass or Schema.TaggedError from effect (Schema as S from "effect")' },
  ),
  fix: S.optionalWith(
    S.String,
    {
      default: () =>
        "Replace manual _tag with class MyClass extends S.TaggedClass<MyClass>('TagName')('variantName', { ... }) {} for variants, or class MyError extends S.TaggedError<MyError>()('MyError', { ... }) {} for errors",
    },
  ),
})

type OptionsType = S.Schema.Type<typeof Options>

export type MessageIds = 'forbidden'

const TAG_NAME = '_tag'

const isTagPropertyKey = (node: ESTree.Node): boolean => {
  if (node.type === 'Identifier') return node.name === TAG_NAME
  if (node.type === 'Literal') return node.value === TAG_NAME
  return false
}

const isTagParameter = (param: ESTree.Node): boolean => param.type === 'Identifier' && param.name === TAG_NAME

const isTagAssignmentPattern = (param: ESTree.Node): boolean =>
  param.type === 'AssignmentPattern' &&
  param.left.type === 'Identifier' &&
  param.left.name === TAG_NAME

const findTagPropertyInClass = (cls: ESTree.Class): ESTree.Node | null => {
  for (const el of cls.body.body) {
    if (
      el.type === 'PropertyDefinition' &&
      !el.computed &&
      isTagPropertyKey(el.key)
    ) {
      return el.key
    }

    if (el.type === 'MethodDefinition' && el.kind === 'constructor') {
      for (const p of el.value.params) {
        if (p.type !== 'TSParameterProperty') continue
        if (isTagParameter(p.parameter) || isTagAssignmentPattern(p.parameter)) {
          return p
        }
      }
    }
  }
  return null
}

const getClassName = (node: ESTree.Class): string => node.id?.type === 'Identifier' ? node.id.name : '<anonymous>'

export const noManualTagProperty = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban classes that declare their own _tag property. Use TaggedClass or TaggedError from effect instead.',
    },
    schema: [JSONSchema.make(Options)],
    messages: {
      forbidden: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
    },
  },
  create(context: Context) {
    // Stryker restore all
    const options: OptionsType = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const allow = new Set(options.allow.map((s) => s.toLowerCase()))

    const checkClass = (node: ESTree.Class) => {
      const tagNode = findTagPropertyInClass(node)
      if (!tagNode) return
      const className = getClassName(node)
      if (allow.has(className.toLowerCase())) return

      context.report({
        node: tagNode,
        messageId: 'forbidden',
        data: {
          name: `class ${className} with manual _tag property`,
          expected: options.expected,
          actual: 'manual _tag property declaration',
          fix: options.fix,
        },
      })
    }

    return {
      ClassDeclaration(node: ESTree.Class) {
        checkClass(node)
      },
      ClassExpression(node: ESTree.Class) {
        checkClass(node)
      },
    }
  },
})
