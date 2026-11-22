/**
 * @internal A Vitest plugin that reprints a refuted property's rerun line with the config file the run loaded, so a
 * rerun from the line draws the same budget instead of the defaults of a config-less run.
 */
import type { Plugin } from 'vitest/config'
import type { Reporter, TestCase, Vitest } from 'vitest/node'

const RERUN = /^(\s*(?:CONFORMANCE_REPLAY="[^"]*" )?pnpm --filter \S+ exec vitest run )(.*)$/u

type Rewrite = (line: string) => ReadonlyArray<string>

const withConfig = (configFile: string): Rewrite => (line) => {
  const match = RERUN.exec(line)
  return match === null ? [] : [`${match[1]}--config ${configFile} ${match[2]}`.trim()]
}

const withoutConfig: Rewrite = () => []

const errorsOf = (testCase: TestCase) => testCase.result().errors ?? []

const textLines = (error: { readonly message: string; readonly stack?: string | undefined }): ReadonlyArray<string> =>
  [error.message, error.stack].join('\n').split('\n')

const rewrittenLines = (rewrite: Rewrite, testCase: TestCase): ReadonlyArray<string> =>
  testCase.result().state === 'failed' ? errorsOf(testCase).flatMap(textLines).flatMap(rewrite) : []

const rewriteOf = (vitest: Vitest): Rewrite => {
  const configFile = vitest.vite.config.configFile
  return configFile === undefined
    ? withoutConfig
    : withConfig(process.getBuiltinModule('node:path').relative(vitest.config.root, configFile))
}

const replayWithLoadedConfig = (vitest: Vitest): Reporter => {
  const lines = new Set<string>()
  const rewrite = rewriteOf(vitest)
  return {
    onTestCaseResult: (testCase) => rewrittenLines(rewrite, testCase).forEach((line) => lines.add(line)),
    onTestRunEnd: () => {
      if (lines.size === 0) return
      vitest.logger.log(
        ['', 'Rerun with the config this run loaded:', ...[...lines].map((line) => `  ${line}`)].join('\n'),
      )
    },
  }
}

const added = new WeakSet<Vitest>()

/** @internal */
export const replayPlugin = (): Plugin => ({
  name: '@systemfsoftware/vitest:property-replay',
  configureVitest: ({ vitest }) => {
    if (added.has(vitest)) return
    added.add(vitest)
    vitest.config.reporters.push(replayWithLoadedConfig(vitest))
  },
})
