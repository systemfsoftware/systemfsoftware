/**
 * OMP Extension: xd:// retry guard (anti-deflection).
 *
 * Failure mode: the agent calls an xd:// device (retain, recall, web_search,
 * mcp__*) as a function tool, gets "Tool <name> not found", and concedes
 * instead of retrying via `write` to `xd://<name>` — even with the rule in
 * CLAUDE.md R3. Prose rules lose at the moment of failure; this extension
 * enforces the retry mechanically.
 *
 * Why tool_execution_end and not tool_result: tool_result is emitted by the
 * per-tool wrapper, which only exists for registered tools — a not-found
 * call bypasses it. tool_execution_end is emitted by the agent loop's
 * emitToolResult for every call including unregistered ones.
 *
 * Mechanism:
 * 1. tool_execution_end — "Tool <name> not found" records <name> in the ledger.
 * 2. tool_execution_start — a `write` to `xd://<name>` clears <name>. A read
 *    of the same URL (docs discovery) does NOT clear: only the retry executes.
 * 3. context — unresolved entries append a reminder at the END of outgoing
 *    messages on every LLM call until the retry executes. Deflection cannot
 *    clear it; only the write can. If the xd:// write itself errors, the
 *    entry is already cleared at start — no infinite nag for unmounted devices.
 */
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'
import { createTelemetry } from '@systemfsoftware/omp-utils'
import type { TelemetryEmitter } from '@systemfsoftware/omp-utils'

const NOT_FOUND_RE = /Tool ([A-Za-z0-9_:-]+) not found/i
const XD_PREFIX = 'xd://'

interface LedgerEntry {
  readonly tool: string
  failures: number
  /** The failure count at which this entry was last included in a context reminder. */
  remindedAtFailure: number
}

const ledger = new Map<string, LedgerEntry>()
const LEDGER_MAX_SIZE = 50

/** Module-scoped telemetry emitter, initialized in the default export. */
let tel: TelemetryEmitter = () => {}

function isTextBlock(value: unknown): value is { readonly text: string } {
  return typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string'
}

function resultText(result: unknown): string {
  if (typeof result !== 'object' || result === null || !('content' in result)) return ''
  const content: unknown = result.content
  if (!Array.isArray(content)) return ''
  return content.filter(isTextBlock).map((block) => block.text).join('\n')
}

function buildReminder(entries: readonly LedgerEntry[]): string {
  const lines = entries.map(
    (entry) =>
      `- "${entry.tool}": retry NOW by calling the write tool with path "xd://${entry.tool}" and content = the JSON args object (read "xd://${entry.tool}" first for its schema).`,
  )
  return `<system-reminder>
A previous tool call failed with "Tool X not found". These tools are listed under "# xd:// Tool Devices" in the system prompt — they are NOT function-call tools. Invoking them by name fails; invoking them via the write tool to their xd:// URL executes them.

Unresolved failures:
${lines.join('\n')}

Do NOT concede unavailability and do NOT continue other work leaving these unretried. This reminder re-injects on every model call until each retry executes (a write to the xd:// URL clears its entry).
</system-reminder>`
}

export default function xdRetryGuardExtension(pi: ExtensionAPI): void {
  tel = createTelemetry('agent_discipline', pi.logger)

  pi.on('tool_execution_end', (event, _ctx: ExtensionContext) => {
    if (!event.isError) return
    const match = NOT_FOUND_RE.exec(resultText(event.result))
    if (!match) return
    const tool = match[1]
    if (tool === undefined) return
    const existing = ledger.get(tool)
    if (existing) {
      existing.failures += 1
    } else {
      // FIFO eviction when at capacity
      if (ledger.size >= LEDGER_MAX_SIZE) {
        const firstKey = ledger.keys().next().value
        if (firstKey !== undefined) ledger.delete(firstKey)
      }
      ledger.set(tool, { tool, failures: 1, remindedAtFailure: 0 })
      tel('guard.fired', { tool, count: ledger.size })
    }
  })

  pi.on('tool_execution_start', (event, _ctx: ExtensionContext) => {
    if (event.toolName !== 'write') return
    if (typeof event.args !== 'object' || event.args === null || !('path' in event.args)) return
    const path = event.args.path
    if (typeof path !== 'string' || !path.startsWith(XD_PREFIX)) return
    const device = path.slice(XD_PREFIX.length).split(/[/?#]/)[0]
    if (device === undefined || device.length === 0) return
    if (ledger.delete(device)) {
      tel('guard.cleared', { tool: device, count: ledger.size })
    }
  })

  pi.on('context', (event) => {
    if (ledger.size === 0) return undefined
    // Only include entries that have had new failures since last reminded
    const unresolved = [...ledger.values()].filter((e) => e.failures > e.remindedAtFailure)
    if (unresolved.length === 0) return undefined
    tel('guard.reminded', { count: unresolved.length })
    const reminder = buildReminder(unresolved)
    // Mark all just-reminded entries so they don't re-appear without a new failure
    for (const entry of unresolved) {
      entry.remindedAtFailure = entry.failures
    }
    return {
      messages: [
        ...event.messages,
        {
          role: 'user',
          content: [{ type: 'text', text: reminder }],
          timestamp: Date.now(),
        },
      ],
    }
  })
}
