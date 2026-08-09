import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const EXECUTOR_FILE_KIND = '*.executor.ts'

export const DUAL_CALLEE_NAME = 'dual' as const

export const EFFECT_NAMESPACE_NAME = 'Effect' as const

export const EFFECT_FN_NAMES: Record<string, true> = {
  fn: true,
  fnUntraced: true,
  fnUntracedEager: true,
}

export const SINGLE_OPERATION_EXPECTED =
  'exactly one operation function export — the use case itself, with optional <Executor>Deps Tag and Layer that binds it' as const

export const TOO_MANY_FUNCTION_EXPORTS_ACTUAL_TEMPLATE = (count: number): string => `${count} function exports`

export const TOO_MANY_FUNCTION_EXPORTS_FIX =
  'move the second use case (and any helpers that are not the use case) into their own *.executor.ts or a sibling cell; make them private if only this executor uses them' as const

export const TOO_MANY_FUNCTION_EXPORTS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      '*.executor.ts must export exactly one operation function — the use case itself. The <Executor>Deps Context.Tag (or Context.GenericTag / Effect.Tag) and a Layer that binds it may also be exported. Types are free to export. Any other exported function means a second use case in the file or a helper that should be private or should live in its own cell.',
  },
  schema: [Options],
  messages: {
    tooManyFunctionExports: TOO_MANY_FUNCTION_EXPORTS_MESSAGE,
  },
} as const
