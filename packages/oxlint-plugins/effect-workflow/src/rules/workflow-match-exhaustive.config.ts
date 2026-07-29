import type { ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

type IdentifierNode = ESTree.Node & { type: 'Identifier'; name: string }

export const Options = S.Struct({})

export const OR_ELSE_ON_CLOSED_UNION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const OR_ELSE_ON_OPEN_DISPATCH_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MISSING_EXHAUSTIVE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EMPTY_VISITOR = {} as const

export const isIdentifier = (n: ESTree.Node): n is IdentifierNode => n.type === 'Identifier'

export const identifierName = (n: ESTree.Node): string => isIdentifier(n) ? n.name : ''

export const MATCH_ARM_KINDS: Readonly<Record<string, 'tag' | 'orElse' | 'exhaustive'>> = {
  tag: 'tag',
  orElse: 'orElse',
  exhaustive: 'exhaustive',
} as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Match dispatch in *.workflow.ts must terminate with Match.exhaustive. Match.orElse is legal only over a small open record of booleans.',
  },
  schema: [Options],
  messages: {
    orElseOnClosedUnion: OR_ELSE_ON_CLOSED_UNION_MESSAGE,
    orElseOnOpenDispatch: OR_ELSE_ON_OPEN_DISPATCH_MESSAGE,
    missingExhaustive: MISSING_EXHAUSTIVE_MESSAGE,
  },
} as const
