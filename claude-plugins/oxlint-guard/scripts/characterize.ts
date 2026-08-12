import * as path from '@std/path'
import { CASES } from '../__fixtures__/characterization/cases.ts'
import {
  type CharacterizationCase,
  type Observation,
  observe,
  resolveBinary,
  type Runner,
} from '../__fixtures__/characterization/harness.ts'

const PACKAGE_ROOT = path.dirname(path.dirname(path.fromFileUrl(import.meta.url)))
const BASELINE = path.join(PACKAGE_ROOT, '__fixtures__', 'characterization', 'baseline.json')

const MODES = ['capture', 'replay'] as const
const RUNTIMES = ['bun', 'deno'] as const
type Mode = typeof MODES[number]
type Runtime = typeof RUNTIMES[number]

const isMode = (value: string | undefined): value is Mode => MODES.some((mode) => mode === value)
const isRuntime = (value: string | undefined): value is Runtime => RUNTIMES.some((runtime) => runtime === value)

const runnerFor = async (runtime: Runtime, hook: CharacterizationCase['hook']): Promise<Runner> => {
  if (runtime === 'bun') {
    const bundle = hook === 'lint' ? 'oxlint-guard.mjs' : 'oxlint-config-off-guard.mjs'
    return { bin: await resolveBinary('bun'), args: [path.join(PACKAGE_ROOT, 'dist', bundle)] }
  }
  const entry = hook === 'lint' ? 'lint-guard.ts' : 'config-guard.ts'
  return {
    bin: await resolveBinary('deno'),
    args: ['run', '--allow-read', '--allow-run', '--allow-env', path.join(PACKAGE_ROOT, 'src', entry)],
  }
}

const collect = async (runtime: Runtime): Promise<Map<string, Observation>> => {
  const lintRunner = await runnerFor(runtime, 'lint')
  const configRunner = await runnerFor(runtime, 'config')
  const pending = [...CASES]
  const observed = new Map<string, Observation>()

  const worker = async (): Promise<void> => {
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      const runner = next.hook === 'lint' ? lintRunner : configRunner
      observed.set(next.id, await observe(runner, next))
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, CASES.length) }, worker))
  return observed
}

const divergence = (id: string, expected: Observation, actual: Observation | undefined): string | undefined => {
  if (actual === undefined) {
    return `  ${id}\n    case did not run`
  }
  if (actual.exitCode === expected.exitCode && actual.stderr === expected.stderr) {
    return undefined
  }
  const lines = [`  ${id}`]
  if (expected.exitCode !== actual.exitCode) {
    lines.push(`    exitCode: expected ${expected.exitCode}, observed ${actual.exitCode}`)
  }
  if (expected.stderr !== actual.stderr) {
    lines.push(`    stderr:   expected ${JSON.stringify(expected.stderr)}`)
    lines.push(`              observed ${JSON.stringify(actual.stderr)}`)
  }
  return lines.join('\n')
}

const readBaseline = async (): Promise<Map<string, Observation>> => {
  const parsed: unknown = JSON.parse(await Deno.readTextFile(BASELINE))
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TypeError(`characterization baseline at ${BASELINE} is not an object`)
  }
  return new Map(Object.entries(parsed).map(([id, value]) => [id, value as Observation]))
}

const main = async (): Promise<number> => {
  const [mode, runtime] = Deno.args
  if (!isMode(mode) || !isRuntime(runtime)) {
    console.error('usage: characterize.ts <capture|replay> <bun|deno>')
    return 2
  }

  const observed = await collect(runtime)

  if (mode === 'capture') {
    const serialized = Object.fromEntries([...observed].toSorted(([a], [b]) => a.localeCompare(b)))
    await Deno.writeTextFile(BASELINE, `${JSON.stringify(serialized, null, 2)}\n`)
    console.error(`captured ${observed.size} observations from ${runtime}`)
    return 0
  }

  const baseline = await readBaseline()
  const divergences = [...baseline]
    .map(([id, expected]) => divergence(id, expected, observed.get(id)))
    .filter((entry): entry is string => entry !== undefined)
  const unbaselined = [...observed.keys()].filter((id) => !baseline.has(id))

  if (divergences.length === 0 && unbaselined.length === 0) {
    console.error(`characterization replay: ${baseline.size} observations reproduced under ${runtime}`)
    return 0
  }
  if (divergences.length > 0) {
    console.error(`characterization replay: ${divergences.length} divergence(s)\n${divergences.join('\n')}`)
  }
  if (unbaselined.length > 0) {
    console.error(`characterization replay: absent from baseline: ${unbaselined.join(', ')}`)
  }
  return 1
}

Deno.exit(await main())
