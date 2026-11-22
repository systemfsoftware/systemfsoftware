/**
 * @internal A Vitest plugin that reprints a refuted property's rerun line with the config file of the project that ran
 * the test, so a rerun from the line draws the same budget instead of the defaults of a config-less run.
 */
import type { Plugin } from 'vitest/config'
import type { Reporter, TestCase, Vitest } from 'vitest/node'

const fs = () => process.getBuiltinModule('node:fs')
const path = () => process.getBuiltinModule('node:path')

const RERUN = /^(\s*(?:CONFORMANCE_REPLAY="[^"]*" )?pnpm --filter \S+ exec vitest run )(.*)$/u

const PLAIN_PATH = /^[\w./@+-]+$/u

const shellQuoted = (path: string): string => PLAIN_PATH.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`

const withConfig = (configArg: string) => (line: string): ReadonlyArray<string> => {
  const match = RERUN.exec(line)
  return match === null ? [] : [`${match[1]}--config ${configArg} ${match[2]}`.trim()]
}

const isPackageRoot = (dir: string): boolean =>
  fs().existsSync(path().join(dir, 'package.json')) || path().dirname(dir) === dir

const packageRootOf = (dir: string): string => isPackageRoot(dir) ? dir : packageRootOf(path().dirname(dir))

// The rerun line runs through `pnpm --filter <package> exec`, from the directory of the package that owns the test.
const configArgsOf = (testCase: TestCase): ReadonlyArray<string> => {
  const configFile = testCase.project.vite.config.configFile
  return configFile === undefined
    ? []
    : [shellQuoted(path().relative(packageRootOf(path().dirname(testCase.module.moduleId)), configFile))]
}

const textLines = (error: { readonly message: string; readonly stack?: string | undefined }): ReadonlyArray<string> =>
  [error.message, error.stack].join('\n').split('\n')

const errorsOf = (testCase: TestCase) => testCase.result().errors ?? []

const failedLines = (testCase: TestCase): ReadonlyArray<string> =>
  testCase.result().state === 'failed' ? errorsOf(testCase).flatMap(textLines) : []

const rewrittenLines = (testCase: TestCase): ReadonlyArray<string> =>
  configArgsOf(testCase).flatMap((configArg) => failedLines(testCase).flatMap(withConfig(configArg)))

const replayWithLoadedConfig = (vitest: Vitest): Reporter => {
  const lines = new Set<string>()
  return {
    onTestCaseResult: (testCase) => rewrittenLines(testCase).forEach((line) => lines.add(line)),
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
