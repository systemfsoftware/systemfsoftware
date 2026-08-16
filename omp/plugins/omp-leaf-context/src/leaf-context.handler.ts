/**
 * Handler cell — transport terminus for leaf AGENTS.md delivery.
 *
 * Registers two `pi.on` handlers:
 *   - `tool_call`: ACL-decode the tool input to a `TargetPath`; when a target
 *     is present, record `toolCallId → target`. Never blocks,
 *     never revises — this delivery is advisory (decision, not gate).
 *   - `tool_result`: consume the recorded call, resolve the target against
 *     `ctx.cwd`, run the workflow, and on `Inject` append the leaf block to
 *     the result content. The session's injected set is marked so each leaf
 *     arrives once per session.
 *
 * State is process-lifetime module top level (PLG1): the factory re-runs per
 * session and must not re-create process-wide structures. Both maps are
 * bounded — the call map drops its oldest entry above 1000 (the sibling caps
 * at 200; delivery is advisory, so 1000 is safe), and stale session sets are
 * evicted the same way.
 *
 * Failure posture is fail-open contained (`runSafe`): a fault logs through
 * `pi.logger` and no-ops, never blocking or poisoning the tool call. A
 * surfaced `LeafContextError` (I/O failure during the walk/read) is logged
 * and likewise yields no injection — delivery must not corrupt results, but
 * the loss must be observable.
 */
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'
import { Match, Result } from 'effect'
import { decodeTarget, type TargetPath } from './leaf-context.acl.js'
import { describeError, type LeafFs, nodeLeafFs, relativeToRoot, runLeafContext } from './leaf-context.executor.js'
import { leafBlock } from './leaf-context.workflow.js'
import type { RunSafe } from './run-safe.kernel.js'

const PENDING_TARGETS_MAX = 1000
const SESSION_SETS_MAX = 1000

/** toolCallId → target, consumed at `tool_result` time. */
const pathByCallId = new Map<string, TargetPath>()
/** sessionId → leaves already injected this session. */
const injectedBySession = new Map<string, Set<string>>()

const readSessionId = (ctx: ExtensionContext): string => {
  const id = ctx.sessionManager.getSessionId()
  return typeof id === 'string' ? id : ''
}

const rememberTarget = (toolCallId: string, target: TargetPath): void => {
  if (pathByCallId.size >= PENDING_TARGETS_MAX) {
    const oldest = pathByCallId.keys().next().value
    if (typeof oldest === 'string') pathByCallId.delete(oldest)
  }
  pathByCallId.set(toolCallId, target)
}

const sessionInjected = (sessionId: string): Set<string> => {
  let set = injectedBySession.get(sessionId)
  if (set === undefined) {
    if (injectedBySession.size >= SESSION_SETS_MAX) {
      const oldest = injectedBySession.keys().next().value
      if (typeof oldest === 'string') injectedBySession.delete(oldest)
    }
    set = new Set<string>()
    injectedBySession.set(sessionId, set)
  }
  return set
}

const logFault = (logger: ExtensionAPI['logger'] | undefined, event: string, error: unknown): void => {
  try {
    logger?.warn('leaf_context.handler_fault', {
      plugin: 'leaf_context',
      event,
      detail: describeError(error),
    })
  } catch {
    // Telemetry must never throw — see runSafe contract.
  }
}

export const LeafContextExtension = (pi: ExtensionAPI, runSafe: RunSafe, fs: LeafFs = nodeLeafFs): void => {
  pi.on('tool_call', async (event, _ctx) => {
    await runSafe(async () => {
      const target = decodeTarget(event.input)
      if (Result.isFailure(target)) return
      rememberTarget(event.toolCallId, target.success)
    }, (error) => logFault(pi.logger, 'tool_call', error))
  })

  pi.on('tool_result', async (event, ctx) => {
    return runSafe(async () => {
      const target = pathByCallId.get(event.toolCallId)
      pathByCallId.delete(event.toolCallId)
      if (target === undefined) return undefined

      const sessionId = readSessionId(ctx)
      const injected = sessionInjected(sessionId)
      const relTarget = relativeToRoot(target, ctx.cwd)
      const outcome = await runLeafContext({ root: ctx.cwd, relTarget, injected, fs })

      if (Result.isFailure(outcome)) {
        logFault(pi.logger, 'tool_result', outcome.failure.detail)
        return undefined
      }

      return Match.value(outcome.success).pipe(
        Match.tag('Skip', () => undefined),
        Match.tag('Inject', ({ leaf, content }) => {
          injected.add(leaf)
          const text = leafBlock(leaf, content)
          return { content: [...event.content, { type: 'text' as const, text }] }
        }),
        Match.exhaustive,
      )
    }, (error) => logFault(pi.logger, 'tool_result', error))
  })
}
