import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'
import { createTelemetry } from '@systemfsoftware/omp-utils'
import type { TelemetryEmitter } from '@systemfsoftware/omp-utils'
import { Effect, Layer } from 'effect'

const NOT_FOUND_RE = /Tool ([A-Za-z0-9_:-]+) not found/i
const XD_PREFIX = 'xd://'

interface LedgerEntry {
  readonly tool: string
  failures: number
  remindedAtFailure: number
}

const ledger = new Map<string, LedgerEntry>()
const LEDGER_MAX_SIZE = 50

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
    (e, i) =>
      `${i + 1}. **\`${e.tool}\`** — failed ${e.failures} time${e.failures > 1 ? 's' : ''}. ` +
      `Your first attempt to use \`${e.tool}\` returned \`Tool not found\`. ` +
      `Write to \`xd://${e.tool}\` (JSON args) to retry — do NOT concede the tool is unavailable.`,
  )
  return [
    '',
    '---',
    '### ⚠️ Unresolved Tool Calls',
    '',
    'The following xd:// tools were not found but have NOT yet been retried via `write` to `xd://`:',
    '',
    ...lines,
    '',
    'Each unresolved entry will repeat here until you retry by writing to the `xd://` device.',
    '---',
  ].join('\n')
}

export const XdRetryGuardExtension = (pi: ExtensionAPI): Layer.Layer<never> =>
  Layer.effectDiscard(
    Effect.sync(() => {
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
        const path = event.args['path']
        if (typeof path !== 'string' || !path.startsWith(XD_PREFIX)) return
        const device = path.slice(XD_PREFIX.length).split(/[/?#]/)[0]
        if (device === undefined || device.length === 0) return
        if (ledger.delete(device)) {
          tel('guard.cleared', { tool: device, count: ledger.size })
        }
      })

      pi.on('context', (event) => {
        if (ledger.size === 0) return undefined
        const unresolved = [...ledger.values()].filter((e) => e.failures > e.remindedAtFailure)
        if (unresolved.length === 0) return undefined
        tel('guard.reminded', { count: unresolved.length })
        const reminder = buildReminder(unresolved)
        for (const entry of unresolved) {
          entry.remindedAtFailure = entry.failures
        }
        return {
          messages: [
            ...event.messages,
            {
              role: 'user',
              content: [{ type: 'text', text: reminder }],
              timestamp: Date.now(), // oxlint-disable-line @systemfsoftware/no-date-now-in-effect
            },
          ],
        }
      })
    }),
  )
