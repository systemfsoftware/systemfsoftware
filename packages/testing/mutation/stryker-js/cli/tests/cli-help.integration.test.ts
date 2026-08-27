import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { execFile } from 'node:child_process'
import * as Path from 'node:path'
import * as Url from 'node:url'
import { promisify } from 'node:util'
import { expect } from 'vitest'

const checkExpect = expect

const execFileAsync = promisify(execFile)

const cliPath = Path.resolve(
  Path.dirname(Url.fileURLToPath(import.meta.url)),
  '../dist/main.mjs',
)

const invoke = (
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): Effect.Effect<{ stdout: string; stderr: string; exitCode: number }> =>
  Effect.promise(() =>
    ((): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      let envOption: NodeJS.ProcessEnv | undefined
      if (env !== undefined) {
        envOption = { ...process.env, ...env }
      } else {
        envOption = process.env
      }
      return execFileAsync('node', [cliPath, ...args], { env: envOption })
        .then((result) => ({ stdout: result.stdout, stderr: result.stderr, exitCode: 0 }))
        .catch((caught: unknown) => {
          let stdout = ''
          let stderr = ''
          let code: number | null = null
          if (caught !== null && typeof caught === 'object' && 'stdout' in caught) {
            const candidate = caught.stdout
            if (typeof candidate === 'string') {
              stdout = candidate
            }
          }
          if (caught !== null && typeof caught === 'object' && 'stderr' in caught) {
            const candidate = caught.stderr
            if (typeof candidate === 'string') {
              stderr = candidate
            }
          }
          if (caught !== null && typeof caught === 'object' && 'code' in caught) {
            const candidate = caught.code
            if (typeof candidate === 'number') {
              code = candidate
            }
          }
          let exitCode = 1
          if (code !== null) {
            exitCode = code
          }
          return { stdout, stderr, exitCode }
        })
    })()
  )

const parseLines = (stdout: string): Array<Record<string, unknown>> => {
  const lines: Array<Record<string, unknown>> = []
  const rawLines = stdout.split('\n')
  for (const line of rawLines) {
    if (line.trim().startsWith('{')) {
      const parsed: unknown = JSON.parse(line)
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // @ts-expect-error: parsed is object narrowed to Record via runtime check
        lines.push(parsed)
      }
    }
  }
  return lines
}

const Feature = makeFeature({ it, layer })

Feature('CLI help regression').body(({ scenario }) => {
  scenario(
    'Should_emit_help_When_bare_or_flag_in_machine_mode',
    Gherkin.Do.pipe(
      When('the harness asks for help')('helpObserved', () => invoke(['--help'])),
      When('the harness invokes the tool with nothing at all')('bareObserved', () => invoke([])),
      Then('both invocations succeed with the usage text and no verdict')((s) => {
        checkExpect(s.helpObserved.exitCode).toBe(0)
        const helpLines = parseLines(s.helpObserved.stdout)
        const helpTerminal = helpLines.at(-1)
        checkExpect(helpTerminal).toMatchObject({ kind: 'help', code: 0 })
        checkExpect(String(helpTerminal?.['help'])).toContain('USAGE')
        checkExpect(helpLines.map((line) => line['kind'])).not.toContain('verdict')

        checkExpect(s.bareObserved.exitCode).toBe(0)
        const bareLines = parseLines(s.bareObserved.stdout)
        const bareTerminal = bareLines.at(-1)
        checkExpect(bareTerminal).toMatchObject({ kind: 'help', code: 0 })
        checkExpect(String(bareTerminal?.['help'])).toContain('USAGE')
        checkExpect(bareLines.map((line) => line['kind'])).not.toContain('verdict')
      }),
    ),
  )

  scenario(
    'Should_print_prose_When_human_mode',
    Gherkin.Do.pipe(
      Given('a human-facing invocation')('observed', () => invoke(['--help'], { STRYKER_MODE: 'human' })),
      Then('the output reads as prose and no machine line is written')((s) => {
        checkExpect(s.observed.exitCode).toBe(0)
        checkExpect(s.observed.stdout).toContain('USAGE')
        const machineLines = parseLines(s.observed.stdout)
        checkExpect(machineLines).toEqual([])
      }),
    ),
  )

  scenario(
    'Should_keep_llms_When_invoked',
    Gherkin.Do.pipe(
      Given('a harness asking for the manifest')('observed', () => invoke(['--llms'])),
      Then('the description follows the stream header')((s) => {
        checkExpect(s.observed.exitCode).toBe(0)
        const lines = parseLines(s.observed.stdout)
        const first = lines[0]
        const last = lines.at(-1)
        checkExpect(first).toMatchObject({ kind: 'stream' })
        checkExpect(last).toMatchObject({ kind: 'manifest', code: 0 })
      }),
    ),
  )
})
