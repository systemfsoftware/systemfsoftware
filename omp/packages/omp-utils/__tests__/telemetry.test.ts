/**
 * Tests for the shared telemetry helper.
 *
 * Verifies: (1) factory creates an emitter, (2) emitter sends structured records
 * through the logger, (3) mandatory plugin + event fields are set automatically,
 * (4) throwing logger does not propagate.
 */
import { describe, expect, it } from 'vitest'
import { createTelemetry, type TelemetryLogger } from '../src/telemetry.js'

function makeRecordingLogger(): {
  logger: TelemetryLogger
  records: Array<{ level: string; message: unknown; context?: unknown }>
} {
  const records: Array<{ level: string; message: unknown; context?: unknown }> = []
  const logger: TelemetryLogger = {
    info(message, context) {
      records.push({ level: 'info', message, context })
    },
  }
  return { logger, records }
}

describe('createTelemetry', () => {
  it('Should_ReturnFunction_When_CalledWithPluginAndLogger', () => {
    const { logger } = makeRecordingLogger()
    const emit = createTelemetry('test_plugin', logger)
    expect(typeof emit).toBe('function')
  })

  it('Should_EmitRecordWithPluginAndEvent_When_Called', () => {
    const { logger, records } = makeRecordingLogger()
    const emit = createTelemetry('test_plugin', logger)

    emit('some.event', { extra: 'value' })

    expect(records.length).toBe(1)
    const record = records[0]!
    // message is the event name (first arg to logger.info)
    expect(record.message).toBe('some.event')
    // context carries plugin + event + extra fields
    expect(record.context).toEqual({
      plugin: 'test_plugin',
      event: 'some.event',
      extra: 'value',
    })
  })

  it('Should_NotThrow_When_LoggerThrows', () => {
    const throwingLogger: TelemetryLogger = {
      info() {
        throw new Error('logger failure')
      },
    }
    const emit = createTelemetry('test_plugin', throwingLogger)

    // Must not throw even though logger throws
    expect(() => emit('some.event', {})).not.toThrow()
  })

  it('Should_HonorExtraFields_When_CalledWithMultipleFields', () => {
    const { logger, records } = makeRecordingLogger()
    const emit = createTelemetry('test_plugin', logger)

    emit('test.event', {
      decision: 'block',
      tool_name: 'bash',
      duration_ms: 42,
      reason: 'forbidden',
    })

    expect(records.length).toBe(1)
    const ctx = records[0]!.context as Record<string, unknown>
    expect(ctx.plugin).toBe('test_plugin')
    expect(ctx.event).toBe('test.event')
    expect(ctx.decision).toBe('block')
    expect(ctx.tool_name).toBe('bash')
    expect(ctx.duration_ms).toBe(42)
    expect(ctx.reason).toBe('forbidden')
  })
})
