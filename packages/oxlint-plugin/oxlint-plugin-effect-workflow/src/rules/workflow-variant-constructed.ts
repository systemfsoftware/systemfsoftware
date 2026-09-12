import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { collectMakeBoundaries, type MakeBodyKind } from '@systemfsoftware/oxlint-make-boundary'
import { isTestFile } from './workflow-match-exhaustive.config.js'
import {
  meta,
  UNCONSTRUCTED_ACTUAL,
  UNCONSTRUCTED_EXPECTED,
  UNCONSTRUCTED_FIX,
} from './workflow-variant-constructed.config.js'

export type MessageIds = 'unconstructedVariant'

const RESULT_TYPE_NAME = 'Result'
const SCHEMA_MAKE_MEMBER = 'make'
const SCHEMA_UNION_MEMBER = 'Union'
const MAX_ALIAS_HOPS = 8

type Channel = 'decision' | 'error'

interface DeclaredVariant {
  readonly channel: Channel
  readonly name: string
  readonly node: ESTree.Node
}

interface FileFacts {
  readonly aliases: ReadonlyMap<string, ESTree.Node>
  readonly unionMembers: ReadonlyMap<string, readonly ESTree.Node[]>
  readonly declaredNames: ReadonlySet<string>
  readonly constructedNames: ReadonlySet<string>
}

const isWalkable = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isNode = (value: unknown): value is ESTree.Node => isWalkable(value) && typeof value['type'] === 'string'

const isIdentifierNode = (node: ESTree.Node): node is ESTree.IdentifierReference => node.type === 'Identifier'

const walk = (
  root: unknown,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
  visit: (node: ESTree.Node) => void,
): void => {
  const step = (value: unknown): void => {
    if (!isNode(value)) return
    visit(value)
    const fields = isWalkable(value) ? value : null
    if (fields === null) return
    for (const key of visitorKeys[value.type] ?? []) {
      const child = fields[key]
      if (Array.isArray(child)) {
        for (const entry of child) step(entry)
      } else {
        step(child)
      }
    }
  }
  step(root)
}

const writtenTypeName = (typeName: ESTree.TSTypeName): string | null => {
  if (typeName.type === 'Identifier') return typeName.name
  if (typeName.type === 'TSQualifiedName') return typeName.right.name
  return null
}

const unwrapParenthesized = (node: ESTree.Node): ESTree.Node =>
  node.type === 'TSParenthesizedType' ? unwrapParenthesized(node.typeAnnotation) : node

/** A member written as a type reference or as the value identifier a `S.Union([…])` names. */
const referencedName = (node: ESTree.Node): string | null => {
  const unwrapped = unwrapParenthesized(node)
  if (unwrapped.type === 'TSTypeReference') return writtenTypeName(unwrapped.typeName)
  return isIdentifierNode(unwrapped) ? unwrapped.name : null
}

const receiverOfSchemaMemberCall = (callee: ESTree.Expression, member: string): string | null => {
  if (callee.type !== 'MemberExpression' || callee.computed) return null
  if (callee.property.type !== 'Identifier' || callee.property.name !== member) return null
  return isIdentifierNode(callee.object) ? callee.object.name : null
}

const unionMembersOf = (node: ESTree.Expression): readonly ESTree.Node[] | null => {
  if (node.type !== 'CallExpression') return null
  if (receiverOfSchemaMemberCall(node.callee, SCHEMA_UNION_MEMBER) === null) return null
  const args = node.arguments
  const first = args[0]
  const candidates: readonly unknown[] = args.length === 1 && first !== undefined && first.type === 'ArrayExpression'
    ? first.elements
    : args
  const members: ESTree.Node[] = []
  for (const candidate of candidates) {
    if (!isNode(candidate) || !isIdentifierNode(candidate)) return null
    members.push(candidate)
  }
  return members.length === 0 ? null : members
}

const collectFileFacts = (context: Context): FileFacts => {
  const aliases = new Map<string, ESTree.Node>()
  const unionMembers = new Map<string, readonly ESTree.Node[]>()
  const declaredNames = new Set<string>()
  const constructedNames = new Set<string>()

  walk(context.sourceCode.ast, context.sourceCode.visitorKeys, (node) => {
    switch (node.type) {
      case 'TSTypeAliasDeclaration':
        aliases.set(node.id.name, node.typeAnnotation)
        return
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id !== null) declaredNames.add(node.id.name)
        return
      case 'VariableDeclarator': {
        const init = node.init
        if (init === null || !isIdentifierNode(node.id)) return
        const members = unionMembersOf(init)
        if (members !== null) {
          unionMembers.set(node.id.name, members)
          return
        }
        const boundToConstructedValue = init.type === 'CallExpression' ||
          init.type === 'NewExpression' ||
          init.type === 'TSAsExpression' ||
          init.type === 'TSSatisfiesExpression'
        if (boundToConstructedValue) declaredNames.add(node.id.name)
        return
      }
      case 'NewExpression':
        if (isIdentifierNode(node.callee)) constructedNames.add(node.callee.name)
        return
      case 'CallExpression': {
        const name = receiverOfSchemaMemberCall(node.callee, SCHEMA_MAKE_MEMBER)
        if (name !== null) constructedNames.add(name)
        return
      }
      default:
        return
    }
  })

  return { aliases, unionMembers, declaredNames, constructedNames }
}

const resolveResultReference = (node: ESTree.Node, facts: FileFacts, hops: number): ESTree.Node => {
  const unwrapped = unwrapParenthesized(node)
  if (hops >= MAX_ALIAS_HOPS) return unwrapped
  if (unwrapped.type !== 'TSTypeReference') return unwrapped
  const name = writtenTypeName(unwrapped.typeName)
  if (name === null || name === RESULT_TYPE_NAME) return unwrapped
  const aliased = facts.aliases.get(name)
  return aliased === undefined ? unwrapped : resolveResultReference(aliased, facts, hops + 1)
}

const declaredVariantsOf = (
  node: ESTree.Node,
  channel: Channel,
  facts: FileFacts,
  hops: number,
): readonly DeclaredVariant[] => {
  const unwrapped = unwrapParenthesized(node)
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.flatMap((member) => declaredVariantsOf(member, channel, facts, hops))
  }
  const name = referencedName(unwrapped)
  if (name === null) return []
  if (facts.declaredNames.has(name)) return [{ channel, name, node: unwrapped }]
  if (hops >= MAX_ALIAS_HOPS) return []
  const members = facts.unionMembers.get(name)
  if (members !== undefined) {
    return members.flatMap((member) => declaredVariantsOf(member, channel, facts, hops + 1))
  }
  const aliased = facts.aliases.get(name)
  return aliased === undefined ? [] : declaredVariantsOf(aliased, channel, facts, hops + 1)
}

const declaredChannelsOf = (body: MakeBodyKind, facts: FileFacts): readonly DeclaredVariant[] => {
  const annotation = body.returnType
  if (annotation === null || annotation === undefined) return []

  const reference = resolveResultReference(annotation.typeAnnotation, facts, 0)
  if (reference.type !== 'TSTypeReference') return []
  if (writtenTypeName(reference.typeName) !== RESULT_TYPE_NAME) return []

  const args = reference.typeArguments === null ? [] : reference.typeArguments.params
  const decision = args[0]
  const error = args[1]
  return [
    ...(decision === undefined ? [] : declaredVariantsOf(decision, 'decision', facts, 0)),
    ...(error === undefined ? [] : declaredVariantsOf(error, 'error', facts, 0)),
  ]
}

/**
 * The variant-reachability rule. A workflow construction's decider declares its decision
 * and error channels in the return annotation — inline, through an in-file alias over the
 * whole `Result`, or as a `S.Union([…])` const the annotation names; every variant of a
 * channel whose class this file declares must be constructed in this file, by `new X(…)`
 * or `X.make(…)`. Construction is read from constructor call sites anywhere in the file,
 * never from the union declaration, so a variant named only in a comment or a string
 * literal is still unreachable.
 *
 * A composing constructor (`Workflow.andThen`) opens no decision body in the file that
 * names it, and a variant whose class is imported is a name this file's AST cannot
 * resolve — both stay silent. `*.tst.ts` type probes run nowhere and are exempt.
 */
export const workflowVariantConstructed = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return {}
    return {
      Program() {
        const boundaries = collectMakeBoundaries(context)
        if (boundaries.length === 0) return

        const facts = collectFileFacts(context)
        const reported = new Set<string>()

        for (const boundary of boundaries) {
          if (!boundary.takesDeciderBody) continue
          const body = boundary.resolvedBody
          if (body === null) continue

          for (const variant of declaredChannelsOf(body, facts)) {
            if (facts.constructedNames.has(variant.name)) continue
            const key = `${variant.channel}:${variant.name}`
            if (reported.has(key)) continue
            reported.add(key)
            context.report({
              node: variant.node,
              messageId: 'unconstructedVariant',
              data: {
                name: `the declared ${variant.channel} variant ${variant.name}`,
                expected: UNCONSTRUCTED_EXPECTED,
                actual: UNCONSTRUCTED_ACTUAL,
                fix: UNCONSTRUCTED_FIX,
              },
            })
          }
        }
      },
    }
  },
})
