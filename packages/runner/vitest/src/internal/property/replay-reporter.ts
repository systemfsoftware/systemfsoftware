/**
 * @internal The reporter that reprints a refuted property's rerun line with the config file of the project that ran the
 * test. The rerun line runs through `pnpm --filter <package> exec`, from the directory of the package that owns the
 * test, so the config path is written relative to that directory and quoted for a shell.
 */
import { NodeServices } from '@effect/platform-node'
import { Effect, FileSystem, Path } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import type { Reporter, TestCase, Vitest } from 'vitest/node'

const RERUN = /^(\s*(?:CONFORMANCE_REPLAY="[^"]*" )?pnpm --filter \S+ exec vitest run )(.*)$/u

const PLAIN_PATH = /^[\w./@+-]+$/u

const shellQuoted = (path: string): string => PLAIN_PATH.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`

/** A rerun line a refuted test printed, and the test and config it belongs to. */
interface Rerun {
  readonly moduleId: string
  readonly configFile: string
  readonly line: string
}

const rerunsOf = (moduleId: string, configFile: string, line: string): ReadonlyArray<Rerun> =>
  RERUN.test(line) ? [{ moduleId, configFile, line }] : []

const textLines = (error: { readonly message: string; readonly stack?: string | undefined }): ReadonlyArray<string> =>
  [error.message, error.stack].join('\n').split('\n')

const errorsOf = (testCase: TestCase) => testCase.result().errors ?? []

const failedLines = (testCase: TestCase): ReadonlyArray<string> =>
  testCase.result().state === 'failed' ? errorsOf(testCase).flatMap(textLines) : []

const configFilesOf = (testCase: TestCase): ReadonlyArray<string> => {
  const configFile = testCase.project.vite.config.configFile
  return configFile === undefined ? [] : [configFile]
}

const rerunsOfCase = (testCase: TestCase): ReadonlyArray<Rerun> =>
  configFilesOf(testCase).flatMap((configFile) =>
    failedLines(testCase).flatMap((line) => rerunsOf(testCase.module.moduleId, configFile, line))
  )

const isPackageRoot = (dir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return (yield* fs.exists(path.join(dir, 'package.json'))) || path.dirname(dir) === dir
  })

const packageRootOf = (dir: string): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    return (yield* isPackageRoot(dir)) ? dir : yield* packageRootOf(path.dirname(dir))
  })

const rewritten = (rerun: Rerun) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* packageRootOf(path.dirname(rerun.moduleId))
    const configArg = shellQuoted(path.relative(root, rerun.configFile))
    return rerun.line.replace(RERUN, (_line: string, command: string, rest: string) =>
      `${command}--config ${configArg} ${rest}`).trim()
  })

const rewrittenLines = (reruns: ReadonlyArray<Rerun>) =>
  Effect.forEach(reruns, rewritten).pipe(Effect.map((lines) => [...new Set(lines)]))

const printLines = (vitest: Vitest, lines: ReadonlyArray<string>): void =>
  lines.length === 0
    ? undefined
    : vitest.logger.log(['', 'Rerun with the config this run loaded:', ...lines.map((line) => `  ${line}`)].join('\n'))

/** @internal */
export const replayWithLoadedConfig = (vitest: Vitest): Reporter => {
  const reruns: Array<Rerun> = []
  return {
    onTestCaseResult: (testCase) => {
      reruns.push(...rerunsOfCase(testCase))
    },
    onTestRunEnd: () =>
      Effect.runPromise(rewrittenLines(reruns).pipe(Effect.provide(NodeServices.layer))).then((lines) => {
        printLines(vitest, lines)
      }),
  }
}
