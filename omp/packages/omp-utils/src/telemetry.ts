/**
 * Structured telemetry helper for OMP plugin extensions.
 *
 * Convention: event names are `<plugin>.<noun>.<verb>` (e.g. `claude_compat.hook.executed`).
 * Every record carries mandatory `plugin` and `event` fields.
 *
 * Data flow:
 *   Plugin handler → createTelemetry → pi.logger.info(event, { plugin, event, ... })
 *     → LogEvent { level, message, context, timestamp }
 *     → LogSink → (when OTEL_* configured) OTLP log exporter
 *
 * Structured fields survive in the LogEvent `context` field — see
 * repos/oh-my-pi/packages/utils/src/logger.ts LogEvent interface.
 *
 * The emitter wraps `pi.logger.info()` in try/catch so a throwing logger
 * can never break the extension path (per §6 "Telemetry never breaks").
 */

/** Minimal logger surface matching what ExtensionAPI.logger provides. */
export interface TelemetryLogger {
  info(message: string, context?: Record<string, unknown>): void
}

/** The emitter returned by createTelemetry. */
export type TelemetryEmitter = (eventName: string, fields: Record<string, unknown>) => void

/**
 * Create a telemetry emitter for a plugin.
 *
 * @param plugin - The event prefix (e.g. `claude_compat`, `agent_discipline`).
 * @param logger - The `pi.logger` instance injected by the host at factory time.
 */
export function createTelemetry(plugin: string, logger: TelemetryLogger): TelemetryEmitter {
  return (eventName: string, fields: Record<string, unknown>): void => {
    try {
      logger.info(eventName, {
        plugin,
        event: eventName,
        ...fields,
      })
    } catch {
      // Telemetry must never break the functional path.
      // The host logger is non-throwing, but this is belt-and-suspenders.
    }
  }
}
