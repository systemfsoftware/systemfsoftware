import { exec } from 'child_process'
import os from 'os'

import { errorToString, testFilesProvided } from '@stryker-mutator/util'
import { INSTRUMENTER_CONSTANTS, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import {
  type CompleteDryRunResult,
  type DryRunOptions,
  type DryRunResult,
  DryRunStatus,
  type ErrorDryRunResult,
  type MutantRunOptions,
  type MutantRunResult,
  type TestRunner,
  type TestRunnerCapabilities,
  TestStatus,
  toMutantRunResult,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'

import { Timer } from '../timer.js'
import { kill } from '../worker-pool/kill.js'

/**
 * The command runner's focused option view: the `commandRunner` member of the
 * option set. Derived instead of imported because the plugin-api core surface
 * exports the option set as a whole, not this leaf schema.
 */
type CommandRunnerOptions = StrykerOptions['commandRunner']

/**
 * A test runner that uses a (bash or cmd) command to execute the tests.
 * Does not know hom many tests are executed or any code coverage results,
 * instead, it mimics a simple test result based on the exit code.
 * The command can be configured, but defaults to `npm test`.
 */
export class CommandTestRunner implements TestRunner {
  /**
   * "command"
   */
  public static readonly runnerName = CommandTestRunner.name
    .replace('TestRunner', '')
    .toLowerCase()

  /**
   * Determines whether a given name is "command" (ignore case)
   * @param name Maybe "command", maybe not
   */
  public static is(name: string): name is 'command' {
    return this.runnerName === name.toLowerCase()
  }

  private readonly settings: CommandRunnerOptions
  private readonly testFilesProvided: boolean

  private timeoutHandler: (() => Promise<void>) | undefined

  constructor(
    private readonly workingDir: string,
    options: StrykerOptions,
  ) {
    this.settings = options.commandRunner
    this.testFilesProvided = testFilesProvided(options)
  }

  public capabilities(): TestRunnerCapabilities {
    // Can reload, because each call is a new process.
    return { reloadEnvironment: true }
  }

  public async init(): Promise<void> {
    if (this.testFilesProvided) {
      throw new Error(
        `The ${CommandTestRunner.runnerName} test runner does not support the --testFiles option.`,
      )
    }
    return Promise.resolve()
  }

  public async dryRun(_options: DryRunOptions): Promise<DryRunResult> {
    return this.run({})
  }

  public async mutantRun({
    activeMutant,
  }: Pick<MutantRunOptions, 'activeMutant'>): Promise<MutantRunResult> {
    const result = await this.run({ activeMutantId: activeMutant.id })
    return toMutantRunResult(result)
  }

  private run({
    activeMutantId,
  }: {
    activeMutantId?: string
  }): Promise<DryRunResult> {
    const timerInstance = new Timer()
    return new Promise((res, rej) => {
      const output: (Buffer | string)[] = []
      const env = activeMutantId === undefined
        ? process.env
        : {
          ...process.env,
          [INSTRUMENTER_CONSTANTS.ACTIVE_MUTANT_ENV_VARIABLE]: activeMutantId,
        }
      const childProcess = exec(this.settings.command, {
        cwd: this.workingDir,
        env,
      })
      if (childProcess.stdout === null || childProcess.stderr === null) {
        // `exec` always creates pipes unless stdio opts out; a null stream
        // means the command cannot be observed, so fail loudly instead of
        // dereferencing it.
        throw new Error(
          `Expected stdout and stderr streams for "${this.settings.command}", but one of them is null.`,
        )
      }
      const stdout = childProcess.stdout
      const stderr = childProcess.stderr
      childProcess.on('error', (error) => {
        kill(childProcess.pid)
          .then(() => handleResolve(errorResult(error)))
          .catch(rej)
      })
      childProcess.on('exit', (code) => {
        const result = completeResult(code, timerInstance)
        handleResolve(result)
      })
      stdout.on('data', (chunk: Buffer) => {
        output.push(chunk)
      })
      stderr.on('data', (chunk: Buffer) => {
        output.push(chunk)
      })

      this.timeoutHandler = async () => {
        handleResolve({ status: DryRunStatus.Timeout })
        await kill(childProcess.pid)
      }

      const handleResolve = (runResult: DryRunResult) => {
        removeAllListeners()
        this.timeoutHandler = undefined
        res(runResult)
      }

      function removeAllListeners() {
        stderr.removeAllListeners()
        stdout.removeAllListeners()
        childProcess.removeAllListeners()
      }

      function errorResult(error: Error): ErrorDryRunResult {
        return {
          errorMessage: errorToString(error),
          status: DryRunStatus.Error,
        }
      }

      function completeResult(
        exitCode: number | null,
        timer: Timer,
      ): CompleteDryRunResult {
        const duration = timer.elapsedMs()
        if (exitCode === 0) {
          return {
            status: DryRunStatus.Complete,
            tests: [
              {
                id: 'all',
                name: 'All tests',
                status: TestStatus.Success,
                timeSpentMs: duration,
              },
            ],
          }
        } else {
          return {
            status: DryRunStatus.Complete,
            tests: [
              {
                id: 'all',
                failureMessage: output
                  .map((buf) => buf.toString())
                  .join(os.EOL),
                name: 'All tests',
                status: TestStatus.Failed,
                timeSpentMs: duration,
              },
            ],
          }
        }
      }
    })
  }
  public async dispose(): Promise<void> {
    if (this.timeoutHandler) {
      await this.timeoutHandler()
    }
  }
}
