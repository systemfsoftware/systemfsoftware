import type { StrykerOptions } from '@stryker-mutator/api/core'
import { commonTokens, declareValuePlugin, PluginKind } from '@stryker-mutator/api/plugin'
import type { Plugin } from '@stryker-mutator/api/plugin'
import type { Reporter } from '@stryker-mutator/api/report'
import { noopLogger } from '@stryker-mutator/util'
import { createInjector } from 'typed-inject'
import { describe, expect, it, vi } from 'vitest'

import basePreset from '../../src/config/base-preset.js'
import { createDefaultOptions } from '../../src/config/options-validator.js'
import { PluginCreator } from '../../src/di/plugin-creator.js'
import { BroadcastReporter } from '../../src/reporters/broadcast-reporter.js'

// `wrapUp` is the driven method — it takes no event argument, so the dispatch
// gate is exercised without fabricating a full MutantResult.
class SpyReporter implements Reporter {
  public readonly wrapUp = vi.fn(async (): Promise<void> => undefined)
}

function createReporterSpies(): Record<'clearText' | 'progress' | 'json', SpyReporter> {
  return {
    clearText: new SpyReporter(),
    progress: new SpyReporter(),
    json: new SpyReporter(),
  }
}

function createBroadcastReporter(
  spies: Record<'clearText' | 'progress' | 'json', SpyReporter>,
  progressEnabled: boolean,
  clearTextEnabled: boolean,
): BroadcastReporter {
  const options: StrykerOptions = {
    ...createDefaultOptions(),
    reporters: ['clear-text', 'progress', 'json'],
  }
  const pluginCreator = new PluginCreator(
    new Map<PluginKind, Array<Plugin<PluginKind>>>([
      [
        PluginKind.Reporter,
        [
          declareValuePlugin(PluginKind.Reporter, 'clear-text', spies.clearText),
          declareValuePlugin(PluginKind.Reporter, 'progress', spies.progress),
          declareValuePlugin(PluginKind.Reporter, 'json', spies.json),
        ],
      ],
    ]),
    createInjector()
      .provideValue(commonTokens.options, options)
      .provideValue(commonTokens.fileDescriptions, {})
      .provideValue(commonTokens.logger, noopLogger)
      .provideValue(commonTokens.getLogger, () => noopLogger),
  )
  return new BroadcastReporter(options, pluginCreator, noopLogger, undefined, progressEnabled, clearTextEnabled)
}

describe('the default reporter list', () => {
  it('registers the progress-stream reporter, so the stream writer is constructed on every run', () => {
    expect(basePreset.reporters).toContain('progress-stream')
  })
})

describe('the reporter dispatch gates', () => {
  it('skips progress and clear-text when both gates are off, while other reporters still run', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, false, false)

    await broadcastReporter.wrapUp()

    expect(spies.progress.wrapUp).not.toHaveBeenCalled()
    expect(spies.clearText.wrapUp).not.toHaveBeenCalled()
    expect(spies.json.wrapUp).toHaveBeenCalledTimes(1)
  })

  it('dispatches to progress and clear-text when both gates are on', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, true, true)

    await broadcastReporter.wrapUp()

    expect(spies.progress.wrapUp).toHaveBeenCalledTimes(1)
    expect(spies.clearText.wrapUp).toHaveBeenCalledTimes(1)
  })

  it('skips only the progress reporter when progress is disabled', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, false, true)

    await broadcastReporter.wrapUp()

    expect(spies.progress.wrapUp).not.toHaveBeenCalled()
    expect(spies.clearText.wrapUp).toHaveBeenCalledTimes(1)
  })

  it('skips only the clear-text reporter when clear text is disabled', async () => {
    const spies = createReporterSpies()
    const broadcastReporter = createBroadcastReporter(spies, true, false)

    await broadcastReporter.wrapUp()

    expect(spies.clearText.wrapUp).not.toHaveBeenCalled()
    expect(spies.progress.wrapUp).toHaveBeenCalledTimes(1)
  })
})
