import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import type { TestCase, TestModule } from 'vitest/node'

import { ConfigInvalid } from '../Config/config-invalid.schema.js'
import { exitCodeOf } from '../verdict/exit-code.js'
import type { ExitCode } from '../verdict/run-verdict.schema.js'

const refusalOf = (test: TestCase): Option.Option<ConfigInvalid> =>
  Option.map(Option.fromNullishOr(test.meta().e2eConfigRefused), (refused) => new ConfigInvalid(refused))

const testsOf = (module: TestModule): ReadonlyArray<TestCase> => Array.from(module.children.allTests())

/**
 * A Vitest reporter that ends a config-refused run with the core's exit code for it, 2 (requirements AC-12.4).
 * Vitest sets its own exit code before reporters see the run end, and the CLI exits with `process.exitCode`, so
 * this reporter writes last; the suite's `vitest.config.ts` registers it and supplies the write.
 */
export const exitCodeReporter = (setExitCode: (code: ExitCode) => void) => ({
  onTestRunEnd: (modules: ReadonlyArray<TestModule>): void => {
    const refusal = Arr.findFirst(Arr.flatMap(modules, testsOf), (test) => Option.isSome(refusalOf(test)))
    Option.map(Option.flatMap(refusal, refusalOf), (error) => setExitCode(exitCodeOf({ _tag: 'ConfigRefused', error })))
  },
})
