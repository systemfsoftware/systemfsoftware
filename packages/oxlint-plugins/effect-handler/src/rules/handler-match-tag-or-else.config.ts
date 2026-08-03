import type { ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'

type IdentifierNode = ESTree.Node & { type: 'Identifier'; name: string }

export const Options = S.Struct({})

export const MISSING_OR_ELSE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EXHAUSTIVE_INSTEAD_OF_OR_ELSE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const isIdentifier = (n: ESTree.Node): n is IdentifierNode => n.type === 'Identifier'

export const identifierName = (n: ESTree.Node): string => (isIdentifier(n) ? n.name : '')

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A Match.tag dispatch in *.handler.ts must terminate with Match.orElse(() => 500), never Match.exhaustive. A new error variant must degrade to a 500 at runtime, not fail the build.',
  },
  schema: [Options],
  messages: {
    missingOrElse: MISSING_OR_ELSE_MESSAGE,
    exhaustiveInsteadOfOrElse: EXHAUSTIVE_INSTEAD_OF_OR_ELSE_MESSAGE,
  },
} as const
