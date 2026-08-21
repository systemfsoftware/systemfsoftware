/**
 * LeafContextExtension — the transport terminus, one I/O operation file.
 *
 * The collapse doctrine's sandwich, sequenced by the file that performs I/O:
 * an eligibility read (the leaf walk), a pure decision through the cell
 * library's `Workflow.make`, then — only on `Select` — the content read and
 * the result append, kept openly here rather than interleaved into the
 * filling. The branch of "which leaf" is the workflow's job; this file only
 * sequences the sandwich and never decides domain state (R5).
 *
 * Registers two `pi.on` handlers:
 *   - `tool_call`: ACL-decode the tool input to a `TargetPath`; when a target
 *     is present, record `toolCallId → target`. Never blocks, never revises —
 *     this delivery is advisory (decision, not gate).
 *   - `tool_result`: consume the recorded call, resolve the target against
 *     `ctx.cwd` (I/O files that touch out-of-root targets no-op), walk the
 *     candidates, run the workflow; on `Select` read the leaf and append the
 *     block. The session's injected set is marked so each leaf arrives once
 *     per session.
 *
 * State is process-lifetime module top level (the factory re-runs per session
 * and must not re-create process-wide structures). Both maps are bounded —
 * the call map drops its oldest entry above 1000, and stale session sets are
 * evicted the same way.
 *
 * Failure posture is fail-open contained (`internal/runSafe`): a fault logs
 * through `pi.logger` and no-ops, never blocking or poisoning the tool call.
 */
import type { ExtensionAPI, ExtensionContext, ToolResultEvent, ToolResultEventResult } from '@oh-my-pi/pi-coding-agent'
import { Match, Result } from 'effect'
import { join } from 'node:path/posix'
import { findExistingLeafCandidates, type LeafFs, nodeLeafFs } from './internal/leaf-fs.js'
import { describeError, type RunSafe } from './internal/runSafe.js'
import { decide, type Decision, governingLeaf, leafBlock } from './LeafContext.js'
import { decodeTarget, relativeToRoot, type TargetPath } from './Target.js'

const PENDING_TARGETS_MAX = 1000
const SESSION_SETS_MAX = 1000

/** sessionId + toolCallId → target, consumed at `tool_result` time. */
const pathByCallId = new Map<string, TargetPath>()
/** sessionId → leaves already injected this session. */
const injectedBySession = new Map<string, Set<string>>()

const readSessionId = (ctx: ExtensionContext): string => {
  const id = ctx.sessionManager.getSessionId()
  return typeof id === 'string' ? id : ''
}

const rememberTarget = (sessionId: string, toolCallId: string, target: TargetPath): void => {
  const key = `${sessionId}:${toolCallId}`
  if (pathByCallId.size >= PENDING_TARGETS_MAX) {
    const oldest = pathByCallId.keys().next().value
    if (typeof oldest === 'string') pathByCallId.delete(oldest)
  }
  pathByCallId.set(key, target)
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
  pi.on('tool_call', async (event, ctx) => {
    await runSafe(async () => {
      const target = decodeTarget(event.input)
      if (Result.isFailure(target)) return
      rememberTarget(readSessionId(ctx), event.toolCallId, target.success)
    }, (error) => logFault(pi.logger, 'tool_call', error))
  })

  pi.on('tool_result', async (event, ctx) => {
    return runSafe(async () => {
      const sessionId = readSessionId(ctx)
      const target = pathByCallId.get(`${sessionId}:${event.toolCallId}`)
      pathByCallId.delete(`${sessionId}:${event.toolCallId}`)
      if (target === undefined) return undefined

      const relTarget = relativeToRoot(target, ctx.cwd)
      if (relTarget === null) return undefined
      const candidates = await findExistingLeafCandidates(relTarget, ctx.cwd, fs)
      const outcome = decide({
        relTarget,
        governingLeaf: governingLeaf(candidates),
        injected: sessionInjected(sessionId),
      })

      if (Result.isFailure(outcome)) {
        logFault(pi.logger, 'tool_result', outcome.failure)
        return undefined
      }

      return Match.value(outcome.success).pipe(
        Match.tag('Skip', () => undefined),
        Match.tag('Select', ({ leaf }) => deliver(pi, sessionId, leaf, event, ctx, fs)),
        Match.exhaustive,
      )
    }, (error) => logFault(pi.logger, 'tool_result', error))
  })
}

/** The second sandwich: read the selected leaf, shape the block, append, and mark the session. */
const deliver = async (
  pi: ExtensionAPI,
  sessionId: string,
  leaf: string,
  event: Pick<ToolResultEvent, 'content'>,
  ctx: { readonly cwd: string },
  fs: LeafFs,
): Promise<ToolResultEventResult | undefined> => {
  const content = await fs.readFile(join(ctx.cwd, leaf))
  sessionInjected(sessionId).add(leaf)
  const text = leafBlock(leaf, content)
  return { content: [...event.content, { type: 'text' as const, text }] }
}

export type { Decision }
