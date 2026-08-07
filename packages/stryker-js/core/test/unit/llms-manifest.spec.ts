import * as Command from '@effect/cli/Command'
import * as Options from '@effect/cli/Options'
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { REMOVED_OPTIONS } from '../../src/config/removed-surface.js'
import { buildLLMSManifest, LLMS_MANIFEST_SCHEMA_VERSION } from '../../src/llms-manifest.js'
import type { LLMSManifest } from '../../src/llms-manifest.js'
import { resetStream, STREAM_SCHEMA_VERSION } from '../../src/progress-stream.js'
import { makeStrykerCommand, resolveCliExitCode, strykerCliEffect } from '../../src/stryker-cli.js'
import { strykerVersion } from '../../src/stryker-package.js'

// The `--llms` command emits through the stream module's synchronous fd-1
// writer (`fs.writeSync`), never `process.stdout.write`, so the stdout
// contract is observed through this mock.
const fsMocks = vi.hoisted(() => ({
  writeSync: vi.fn<(fd: number, text: string) => number>(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeSync: fsMocks.writeSync }
})

// -----------------------------------------------------------------------------
// The parser's declared option list, read straight off the command descriptor
// — the same tree the parser matches against — with a collector written
// independently of the emitter's walk, so a comparison between the two sides
// can actually go red.
// -----------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function standardCommandOf(node: unknown): Record<string, unknown> | undefined {
  if (!isObject(node)) {
    return undefined
  }
  switch (node['_tag']) {
    case 'Standard':
      return node
    case 'Map':
      return standardCommandOf(node['command'])
    case 'Subcommands':
      return standardCommandOf(node['parent'])
    default:
      return undefined
  }
}

function optionNamesOf(standard: Record<string, unknown>): string[] {
  const names: string[] = []
  collect(standard['options'])
  return names

  function collect(instruction: unknown): void {
    if (!isObject(instruction)) {
      return
    }
    switch (instruction['_tag']) {
      case 'Single':
        if (typeof instruction['name'] === 'string') {
          names.push(instruction['name'])
        }
        return
      case 'Map':
        collect(instruction['options'])
        return
      case 'Both':
      case 'OrElse':
        collect(instruction['left'])
        collect(instruction['right'])
        return
      case 'Variadic':
      case 'KeyValueMap':
        collect(instruction['argumentOption'])
        return
      case 'WithDefault':
      case 'WithFallback':
        collect(instruction['options'])
        return
    }
  }
}

function subcommandStandards(node: unknown): Array<Record<string, unknown>> {
  if (!isObject(node) || node['_tag'] !== 'Subcommands' || !Array.isArray(node['children'])) {
    return []
  }
  const standards: Array<Record<string, unknown>> = []
  for (const child of node['children']) {
    const standard = standardCommandOf(child)
    if (standard !== undefined) {
      standards.push(standard)
    }
  }
  return standards
}

function allManifestOptionNames(manifest: LLMSManifest): string[] {
  const names: string[] = []
  for (const command of manifest.commands) {
    for (const option of command.options) {
      names.push(option.name)
    }
    for (const subcommand of command.subcommands) {
      for (const option of subcommand.options) {
        names.push(option.name)
      }
    }
  }
  return names
}

describe('--llms manifest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // The emission test configures the stream module (header + terminal
    // state); a fresh run must start unconfigured.
    resetStream()
    fsMocks.writeSync.mockClear()
  })

  it('lists every declared option exactly once — no duplicates, no omissions', () => {
    const command = makeStrykerCommand(async () => {})
    const manifest = buildLLMSManifest(command, strykerVersion)
    const run = manifest.commands[0].subcommands[0]
    const runStandard = subcommandStandards(command.descriptor)[0]
    expect(runStandard).toBeDefined()
    const declared = optionNamesOf(runStandard ?? {})
    expect(declared.length).toBeGreaterThan(0)
    for (const name of declared) {
      expect(run.options.filter((option) => option.name === name)).toHaveLength(1)
    }
    expect(manifest.commands[0].options.filter((option) => option.name === 'llms')).toHaveLength(1)
  })

  it('picks up an option added to the command surface with no manifest change (drift guard)', () => {
    // The emitter walks descriptors: `added` exists nowhere but in this
    // constructed command, so the manifest can only contain it because the
    // walk saw it. No manifest-code change made it appear.
    const command = Command.make('run', {
      baseline: Options.boolean('baseline').pipe(Options.withDescription('A pre-existing option.')),
      added: Options.text('added').pipe(
        Options.withAlias('a'),
        Options.withDescription('A newly added option.'),
        Options.optional,
      ),
      must: Options.text('must'),
    }, () => Effect.void)

    const manifest = buildLLMSManifest(command, '0.0.0-test')
    const options = manifest.commands[0].options
    const added = options.find((option) => option.name === 'added')
    expect(options.map((option) => option.name)).toContain('baseline')
    expect(added?.name).toBe('added')
    expect(added?.aliases).toEqual(['a'])
    expect(added?.kind).toBe('text')
    expect(added?.required).toBe(false)
    expect(added?.description).toBe('A newly added option.')
    // A bare option with no default is reported required — the walk
    // distinguishes the two instead of assuming everything is optional.
    expect(options.find((option) => option.name === 'must')?.required).toBe(true)
  })

  it('has no option name in common with the U10 removed-names denylist', () => {
    const command = makeStrykerCommand(async () => {})
    const manifest = buildLLMSManifest(command, strykerVersion)
    const names = new Set(allManifestOptionNames(manifest))
    const overlap = Object.keys(REMOVED_OPTIONS).filter((name) => names.has(name))
    expect(overlap).toEqual([])
  })

  it('emits the stream header and one tagged manifest terminal line on stdout, and exits 0', async () => {
    fsMocks.writeSync.mockClear()
    const exit = await Effect.runPromise(
      Effect.exit(strykerCliEffect(['node', 'stryker', '--llms'])),
    )
    expect(resolveCliExitCode(exit)).toBe(0)
    // `--llms` is a machine request by definition: the handler opens the
    // stream itself when the run bootstrap did not, so the stdout contract is
    // header first, then the single tagged `manifest` terminal event.
    const lines = fsMocks.writeSync.mock.calls
      .filter((call) => call[0] === 1)
      .map((call) => String(call[1]))
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(JSON.parse(lines[0] as string) as { kind?: string }).toMatchObject({ kind: 'stream' })
    const terminal = JSON.parse(lines[lines.length - 1] as string) as {
      kind: string
      schemaVersion: string
      code: number
      manifest: string
    }
    expect(terminal.kind).toBe('manifest')
    expect(terminal.schemaVersion).toBe(STREAM_SCHEMA_VERSION)
    expect(terminal.code).toBe(0)
    const document = JSON.parse(terminal.manifest) as LLMSManifest
    expect(document.schemaVersion).toBe(LLMS_MANIFEST_SCHEMA_VERSION)
    expect(document.tool).toBe('stryker')
    expect(document.commands[0].name).toBe('stryker')
    expect(document.commands[0].subcommands[0].name).toBe('run')
  })

  it('matches the parser-declared option list programmatically', () => {
    const command = makeStrykerCommand(async () => {})
    const manifest = buildLLMSManifest(command, strykerVersion)
    const rootStandard = standardCommandOf(command.descriptor)
    const runStandard = subcommandStandards(command.descriptor)[0]
    expect(rootStandard).toBeDefined()
    expect(runStandard).toBeDefined()

    const manifestRootNames = manifest.commands[0].options.map((option) => option.name)
    const declaredRootNames = optionNamesOf(rootStandard ?? {})
    expect([...manifestRootNames].sort()).toEqual([...declaredRootNames].sort())

    const manifestRunNames = manifest.commands[0].subcommands[0].options.map((option) => option.name)
    const declaredRunNames = optionNamesOf(runStandard ?? {})
    expect([...manifestRunNames].sort()).toEqual([...declaredRunNames].sort())
  })

  it('reads kind, aliases, defaults, choices and descriptions from the descriptors', () => {
    const command = makeStrykerCommand(async () => {})
    const manifest = buildLLMSManifest(command, strykerVersion)
    const run = manifest.commands[0].subcommands[0]

    const mutate = run.options.find((option) => option.name === 'mutate')
    expect(mutate?.aliases).toEqual(['m'])
    expect(mutate?.kind).toBe('text')
    expect(mutate?.required).toBe(false)
    expect(mutate?.description).toContain('With `mutate` you configure the subset')

    expect(run.options.find((option) => option.name === 'timeoutMS')?.kind).toBe('integer')
    expect(run.options.find((option) => option.name === 'timeoutFactor')?.kind).toBe('float')

    const ignoreStatic = run.options.find((option) => option.name === 'ignoreStatic')
    expect(ignoreStatic?.kind).toBe('boolean')
    expect(ignoreStatic?.default).toBe(false)
    expect(ignoreStatic?.required).toBe(false)

    const coverageAnalysis = run.options.find((option) => option.name === 'coverageAnalysis')
    expect(coverageAnalysis?.kind).toBe('choice')
    expect(coverageAnalysis?.choices).toEqual(['perTest', 'all', 'off'])

    const logLevel = run.options.find((option) => option.name === 'logLevel')
    expect(logLevel?.choices).toEqual(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'off'])

    // The reporters allowed set comes from the U9 registry, not a literal.
    const reporters = run.options.find((option) => option.name === 'reporters')
    expect(reporters?.choices).toEqual(['clear-text', 'progress', 'html', 'json', 'progress-stream'])

    for (const option of run.options) {
      expect(option.description.length).toBeGreaterThan(0)
    }

    expect(run.args).toHaveLength(1)
    expect(run.args[0]?.name).toBe('<configFile>')
    expect(run.args[0]?.kind).toBe('text')
    expect(run.args[0]?.required).toBe(false)
    expect(run.description).toBe('Run mutation testing')
    expect(manifest.commands[0].options.map((option) => option.name)).toEqual(['llms'])
  })
})
