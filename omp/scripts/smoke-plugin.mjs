#!/usr/bin/env node
/**
 * Smoke-verification for OMP plugin dists.
 *
 * Loads a built plugin dist with a mock ExtensionAPI, reports registered
 * handlers, and optionally fires a synthetic event against them.
 *
 * Usage:
 *   node omp/scripts/smoke-plugin.mjs <dist-path> [options]
 *
 * Options:
 *   --fire <event>    Fire a synthetic event matching the named handler(s)
 *   --tool <name>     Tool name to set on the synthetic event (toolName)
 *   --input <json>    Event body fields merged into the synthetic event
 *
 * Exit codes:
 *   0  Plugin loaded and registered at least one handler
 *   1  Usage error, missing file, import failure, missing default export,
 *      zero handlers, or handler throw during --fire
 */

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)

if (args.length === 0) {
  console.error(
    'Usage: node omp/scripts/smoke-plugin.mjs <dist-path> [--fire <event>] [--tool <name>] [--input <json>] [--cwd <path>]',
  )
  process.exit(1)
}

/* ---- Arg parsing ------------------------------------------------------- */

const distPath = args[0]
let fireEvent = null
let fireTool = null
let fireInput = null
let fireCwd = null

for (let i = 1; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--fire') {
    fireEvent = args[++i]
    if (!fireEvent) {
      console.error('Error: --fire requires an event name')
      process.exit(1)
    }
  } else if (arg === '--tool') {
    fireTool = args[++i]
  } else if (arg === '--input') {
    const raw = args[++i]
    try {
      fireInput = JSON.parse(raw)
    } catch {
      console.error(`Error: --input is not valid JSON: ${raw}`)
      process.exit(1)
    }
  } else if (arg === '--cwd') {
    fireCwd = args[++i]
    if (!fireCwd) {
      console.error('Error: --cwd requires a path')
      process.exit(1)
    }
  } else {
    console.error(`Error: Unknown flag: ${arg}`)
    process.exit(1)
  }
}

/* ---- File existence check ---------------------------------------------- */

if (!existsSync(distPath)) {
  console.error(`Error: Plugin dist not found: ${distPath}`)
  process.exit(1)
}

/* ---- Mock ExtensionAPI ------------------------------------------------- */

const handlers = new Map() // event name → handler[]
const logCalls = [] // [level, ...args][]

const api = {
  handlers,
  on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, [])
    handlers.get(event).push(handler)
  },
  logger: {
    warn(...args) {
      logCalls.push(['warn', ...args])
    },
    info(...args) {
      logCalls.push(['info', ...args])
    },
    error(...args) {
      logCalls.push(['error', ...args])
    },
    debug(...args) {
      logCalls.push(['debug', ...args])
    },
  },
}

/* ---- Dynamic import ---------------------------------------------------- */

let mod
try {
  mod = await import(pathToFileURL(distPath).href)
} catch (err) {
  console.error(`Error: Failed to import plugin dist: ${err.message}`)
  process.exit(1)
}

/* ---- Default export check ---------------------------------------------- */

const factory = mod.default
if (typeof factory !== 'function') {
  console.error(`Error: Plugin dist has no default export (found: ${typeof factory})`)
  process.exit(1)
}

/* ---- Initialize plugin ------------------------------------------------- */

try {
  factory(api)
} catch (err) {
  console.error(`Error: Plugin factory threw: ${err.message}`)
  process.exit(1)
}

/* ---- Zero-handler check ------------------------------------------------ */

if (handlers.size === 0) {
  console.error('Error: Plugin registered zero handlers (broken extension)')
  process.exit(1)
}

/* ---- Report handlers --------------------------------------------------- */

console.log(`Plugin: ${distPath}`)
console.log(`Handlers (${handlers.size} events):`)
for (const [event, eventHandlers] of handlers) {
  console.log(`  ${event} (${eventHandlers.length} handler(s))`)
}

/* ---- Fire synthetic event (optional) ----------------------------------- */

if (fireEvent) {
  const eventHandlers = handlers.get(fireEvent)
  if (!eventHandlers || eventHandlers.length === 0) {
    console.log(`\nNo handlers registered for event: ${fireEvent}`)
  } else {
    // Build synthetic event: merge --input body fields
    const body = fireInput ?? {}
    const syntheticEvent = { type: fireEvent, ...body }
    if (fireTool) syntheticEvent.toolName = fireTool

    const mockCtx = {
      cwd: fireCwd ?? process.cwd(),
      sessionManager: { getSessionId: () => 'smoke' },
    }

    console.log(`\nFiring: ${fireEvent}`)
    let handlerIdx = 0
    for (const handler of eventHandlers) {
      handlerIdx++
      // Print log entries accumulated before this handler call
      const logsBefore = logCalls.length
      try {
        const result = await handler(syntheticEvent, mockCtx)
        // Print log entries made during this handler
        const logEntries = logCalls.slice(logsBefore)
        for (const entry of logEntries) {
          console.log(`  [logger.${entry[0]}]`, ...entry.slice(1))
        }
        if (result !== undefined) {
          console.log(`  Handler ${handlerIdx} result: ${JSON.stringify(result, null, 2)}`)
        } else {
          console.log(`  Handler ${handlerIdx} result: (void)`)
        }
      } catch (err) {
        // Print log entries made before the throw
        const logEntries = logCalls.slice(logsBefore)
        for (const entry of logEntries) {
          console.log(`  [logger.${entry[0]}]`, ...entry.slice(1))
        }
        console.error(`  Handler ${handlerIdx} threw: ${err.message}`)
      }
    }
  }
}
