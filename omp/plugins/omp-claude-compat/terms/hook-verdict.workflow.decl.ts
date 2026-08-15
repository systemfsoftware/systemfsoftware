/**
 * `src/hook-verdict.workflow.ts`, as a declaration.
 *
 * How a hook process's exit becomes a decision. It is the richest dispatch in the role and shows the
 * three shapes the language has beyond a flat match: an `either` arm, where a kernel call may fail and
 * each side becomes its own outcome; a nested dispatch, where one arm's outcome is itself a total match;
 * and optional path hops, for reading a field the parsed payload need not carry.
 *
 * Every branch's *condition* is a kernel call — `exitKindOf`, `parsedVerdict`, `stderrVerdict` — so this
 * cell decides nothing itself. It names which verdict becomes which decision, and the deciding lives
 * where property tests reach it.
 */
import { at, callOf, opt, read, ref, str, workflow } from '../../../../scripts/tools/workflow.ts'

const SCHEMA = './hook-dispatcher.schema.js'
const KERNEL = './hook-verdict.kernel.js'

/** `parsed.hookSpecificOutput?.<name>` — the payload need not carry any of these. */
const hookOutput = (name: string) => at('parsed', 'hookSpecificOutput', opt(name))

export default workflow({
  operation: 'interpretHookResult',
  command: {
    declare: {
      class: 'InterpretHookCommand',
      tag: 'InterpretHookCommand',
      typeId: { namespace: '@systemfsoftware/omp-claude-compat', name: 'InterpretHookCommand' },
      fields: { result: ref('HookResult', SCHEMA), event: str },
    },
  },
  decision: {
    imported: { type: 'HookDecision', from: SCHEMA },
    constructors: ['Allow', 'Block', 'Warning'],
  },
  error: {
    typeId: { namespace: '@systemfsoftware/omp-claude-compat', name: 'HookVerdictError' },
    variants: [{ class: 'HookVerdictError', tag: 'HookVerdictError', fields: { raw: str } }],
  },
  dispatch: {
    on: { call: 'exitKindOf', from: KERNEL, args: [at('result', 'code'), at('result', 'stdout')] },
    arms: [
      {
        pattern: 'ExitBlock',
        channel: 'right',
        construct: 'Block',
        with: { reason: callOf('blockReason', KERNEL, at('result', 'stderr'), at('event')) },
      },
      { pattern: 'ExitNoDecision', channel: 'right', construct: 'Allow', with: {} },
      {
        pattern: 'ExitDecisionJson',
        either: {
          call: 'parseHookOutput',
          from: './hook-output.acl.js',
          args: [at('result', 'stdout')],
          bind: 'parsed',
        },
        onLeft: { channel: 'left', construct: 'HookVerdictError', with: { raw: read('result', 'stdout') } },
        onRight: {
          on: {
            call: 'parsedVerdict',
            from: KERNEL,
            args: [hookOutput('permissionDecision'), at('parsed', 'decision')],
          },
          arms: [
            {
              pattern: 'block',
              channel: 'right',
              construct: 'Block',
              with: {
                reason: {
                  call: 'parsedBlockReason',
                  from: KERNEL,
                  args: [
                    hookOutput('permissionDecision'),
                    hookOutput('permissionDecisionReason'),
                    at('parsed', 'reason'),
                    at('event'),
                  ],
                },
              },
            },
            {
              pattern: 'allow',
              channel: 'right',
              construct: 'Allow',
              with: { updatedInput: { field: hookOutput('updatedInput') } },
            },
          ],
        },
      },
      {
        pattern: 'ExitOther',
        onRight: {
          on: { call: 'stderrVerdict', from: KERNEL, args: [at('result', 'stderr')] },
          arms: [
            {
              pattern: 'warning',
              channel: 'right',
              construct: 'Warning',
              with: { message: callOf('spokenStderr', KERNEL, at('result', 'stderr')) },
            },
            { pattern: 'allow', channel: 'right', construct: 'Allow', with: {} },
          ],
        },
      },
    ],
  },
})
