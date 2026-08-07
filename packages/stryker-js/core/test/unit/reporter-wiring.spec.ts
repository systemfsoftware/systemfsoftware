import type { StrykerOptions } from '@stryker-mutator/api/core'
import { commonTokens, declareValuePlugin, PluginKind } from '@stryker-mutator/api/plugin'
import type { Plugin } from '@stryker-mutator/api/plugin'
import type { Reporter } from '@stryker-mutator/api/report'
import { noopLogger } from '@stryker-mutator/util'
import { createInjector } from 'typed-inject'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import basePreset from '../../src/config/base-preset.js'
import { createDefaultOptions } from '../../src/config/options-validator.js'
import { PluginCreator } from '../../src/di/plugin-creator.js'
import { BroadcastReporter } from '../../src/reporters/broadcast-reporter.js'

// Reporter wiring is the behavior under test, so the reporters themselves
// are doubles: the real PluginCreator hands back these spies through value
// plugins, and the assertions record whether BroadcastReporter dispatched
// to them. `wrapUp` is the driven method — it takes no event argument, so
// the dispatch gate is exercised without fabricating a full MutantResult,
// and the gate runs before the method call, so the method never matters.
class SpyReporter implements Reporter {
  public readonly wrapUp = vi.fn(async (): Promise<void> => undefined)
}

function createReporterSpies(): { clearText: SpyReporter; progress: SpyReporter } {
  return {
    clearText: new SpyReporter(),
    progress: new SpyReporter(),
  }
}

function createBroadcastReporter(
  clearText: SpyReporter,
  progress: SpyReporter,
): BroadcastReporter {
  const options: StrykerOptions = {
    ...createDefaultOptions(),
    reporters: ['clear-text', 'progress'],
  }
  const pluginCreator = new PluginCreator(
    new Map<PluginKind, Array<Plugin<PluginKind>>>([
      [
        PluginKind.Reporter,
        [
          declareValuePlugin(PluginKind.Reporter, 'clear-text', clearText),
          declareValuePlugin(PluginKind.Reporter, 'progress', progress),
        ],
      ],
    ]),
    createInjector()
      .provideValue(commonTokens.options, options)
      .provideValue(commonTokens.fileDescriptions, {})
      .provideValue(commonTokens.logger, noopLogger)
      .provideValue(commonTokens.getLogger, () => noopLogger),
  )
  return new BroadcastReporter(options, pluginCreator, noopLogger, undefined)
}

const stdoutIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

beforeEach(() => {
  // A TTY in both modes: STRYKER_MODE alone decides, proving the gate follows
  // the resolved mode rather than a raw probe.
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
  vi.stubEnv('STRYKER_MODE', '')
  vi.stubEnv('AGENT', '')
  vi.stubEnv('CLAUDECODE', '')
  vi.stubEnv('CODEX_SANDBOX', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  if (stdoutIsTTYDescriptor) {
    Object.defineProperty(process.stdout, 'isTTY', stdoutIsTTYDescriptor)
  } else {
    Reflect.deleteProperty(process.stdout, 'isTTY')
  }
})

describe('the default reporter list (U7, R13)', () => {
  it('registers the progress-stream reporter, so the stream writer is constructed on every run', () => {
    expect(basePreset.reporters).toContain('progress-stream')
  })
})

describe('the machine-mode stdout gate (U3, R5)', () => {
  it('does not dispatch to clear-text or progress in machine mode', async () => {
    vi.stubEnv('STRYKER_MODE', 'machine')

    const { clearText, progress } = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(clearText, progress)

    await broadcastReporter.wrapUp()

    expect(clearText.wrapUp).not.toHaveBeenCalled()
    expect(progress.wrapUp).not.toHaveBeenCalled()
  })

  it('dispatches to clear-text and progress in human mode', async () => {
    vi.stubEnv('STRYKER_MODE', 'human')

    const { clearText, progress } = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(clearText, progress)

    await broadcastReporter.wrapUp()

    expect(clearText.wrapUp).toHaveBeenCalledTimes(1)
    expect(progress.wrapUp).toHaveBeenCalledTimes(1)
  })
})
