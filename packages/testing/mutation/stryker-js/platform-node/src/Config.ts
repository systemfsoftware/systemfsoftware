/**
 * Config capability — reading and resolving the run's configuration.
 *
 * One module per capability: config file discovery, `extends` resolution,
 * validation, freezing, serializability, file matching, and warning gating.
 * The pure merge decision lives in `Config.workflow.ts` so `Workflow.make`
 * stays behind its gate; schemas live in `Config.schema.ts`.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

import { Cell, Wire } from '@systemfsoftware/effect-cell-types'
import type { PartialStrykerOptions, StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { Minimatch, minimatch } from 'minimatch'

import {
  ConfigDocumentSchema,
  ConfigError,
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
  forkOptionsSchema,
  ImportedModuleSchema,
  ReadConfigCommand,
} from './Config.schema.js'
import { MergeCommand, mergeConfigsWorkflow } from './Config.workflow.js'
import { IGNORE_PATTERN_CHARACTER, MUTATION_RANGE_REGEX } from './Project.workflow.js'
import { StrykerError } from './stryker-error.schema.js'
import { isCommandRunner } from './TestRunner.js'
import { getAvailableParallelism } from './Worker.js'

/**
 * Config-file names the rebuild removed, mapped to their remediation.
 */
export const REMOVED_OPTIONS: Record<string, string> = {
  'dots': 'the "dots" reporter was removed; use "clear-text" instead',
  'event-recorder':
    'the "event-recorder" reporter was removed; use the "json" reporter or the machine-mode progress stream for structured output',
  'progress-append-only': 'the "progress-append-only" reporter was removed; use "progress-stream" instead',
  'dashboard':
    'the "dashboard" reporter and its options were removed; write the "json" or "html" report and publish it yourself',
  'eventReporter': 'the event-recorder reporter was removed; remove this option',
}

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')
export const optionsPath = (...path: string[]): string => path.join('.')

// ── config-file-formats ─────────────────────────────────────────────

const combine = (
  prefixes: string[],
  suffixes: string[],
  extensions: string[],
): string[] => {
  const fileNames: string[] = []
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      for (const extension of extensions) {
        fileNames.push(`${prefix}stryker${suffix}.${extension}`)
      }
    }
  }
  return fileNames
}

export const SUPPORTED_CONFIG_FILE_NAMES = Object.freeze(
  combine(
    ['', '.'],
    ['.conf', '.config'],
    ['json', 'js', 'mjs', 'cjs'],
  ),
)

export const DEFAULT_CONFIG_FILE_NAMES = Object.freeze(
  {
    JSON: 'stryker.config.json',
    JAVASCRIPT: 'stryker.config.mjs',
  } as const,
)

// ── config-freeze ───────────────────────────────────────────────────

export type Primitive = boolean | number | string | null | undefined

type ImmutablePrimitive = Primitive | ((...args: never[]) => unknown)

export type Immutable<T> = T extends ImmutablePrimitive ? T
  : T extends Array<infer U> ? ReadonlyArray<Immutable<U>>
  : T extends Map<infer K, infer V> ? ReadonlyMap<Immutable<K>, Immutable<V>>
  : T extends Set<infer M> ? ReadonlySet<Immutable<M>>
  : T extends RegExp ? Readonly<RegExp>
  : { readonly [K in keyof T]: Immutable<T[K]> }

export function deepFreeze<T>(target: T): Immutable<T>
export function deepFreeze(target: unknown): unknown {
  switch (typeof target) {
    case 'object':
      if (Array.isArray(target)) {
        const array: readonly unknown[] = target
        return Object.freeze(array.map(deepFreeze))
      }
      if (target instanceof Map) {
        return Object.freeze(
          new Map(
            [...target.entries()].map(([k, v]) => [
              deepFreeze(k),
              deepFreeze(v),
            ]),
          ),
        )
      }
      if (target instanceof RegExp) {
        return Object.freeze(target)
      }
      if (target === null) {
        return null
      }
      if (target instanceof Set) {
        return Object.freeze(
          new Set([...target.values()].map(deepFreeze)),
        )
      }
      {
        const frozen: Record<string, unknown> = Object.entries(target).reduce<Record<string, unknown>>(
          (result, [prop, val]) => {
            result[prop] = deepFreeze(val)
            return result
          },
          {},
        )
        return Object.freeze(frozen)
      }
    case 'bigint':
    case 'boolean':
    case 'function':
    case 'number':
    case 'string':
    case 'symbol':
    case 'undefined':
      return target
  }
}

// ── config-serializability ──────────────────────────────────────────

export interface UnserializableDescription {
  path: string[]
  reason: string
}

export function findUnserializables(
  thing: unknown,
): UnserializableDescription[] | undefined {
  switch (typeof thing) {
    case 'number':
      if (!isFinite(thing)) {
        return [
          {
            reason: `Number value \`${thing}\` has no JSON representation`,
            path: [],
          },
        ]
      }
      return
    case 'string':
    case 'boolean':
    case 'undefined':
      return
    case 'bigint':
    case 'function':
    case 'symbol':
      return [
        {
          path: [],
          reason: `Primitive type "${typeof thing}" has no JSON representation`,
        },
      ]
    case 'object': {
      if (thing === null) {
        return
      }
      if (Array.isArray(thing)) {
        const things = thing
          .flatMap((child, index) =>
            findUnserializables(child)?.map((description) => {
              description.path.unshift(index.toString())
              return description
            })
          )
          .filter(Predicate.isNotNullish)
        if (things.length > 0) {
          return things
        }
        return undefined
      }
      const thingProto: unknown = Reflect.getPrototypeOf(thing)
      if (thingProto === Object.prototype || thingProto === null) {
        const things = Object.entries(thing)
          .flatMap(([key, val]) =>
            findUnserializables(val)?.map((description) => {
              description.path.unshift(key)
              return description
            })
          )
          .filter(Predicate.isNotNullish)
        if (things.length > 0) {
          return things
        }
        return undefined
      }
      let protoClassName = thing.constructor.name
      if (protoClassName.length === 0) {
        protoClassName = '<anonymous class>'
      }
      return [
        {
          path: [],
          reason:
            `Value is an instance of "${protoClassName}", this detail will get lost in translation during serialization`,
        },
      ]
    }
  }
}

// ── is-warning-enabled ──────────────────────────────────────────────

type KnownKeys<T> = keyof {
  [P in keyof T as string extends P ? never : number extends P ? never : P]: T[P]
}

export type WarningOptions = Exclude<StrykerOptions['warnings'], boolean>

export function isWarningEnabled(
  warningType: KnownKeys<WarningOptions>,
  warningOptions: WarningOptions | boolean,
): boolean {
  if (typeof warningOptions === 'boolean') {
    return warningOptions
  } else {
    return warningOptions[warningType] === true
  }
}

// ── file-matcher ────────────────────────────────────────────────────

const DEFAULT_GLOB = '**/*.{js,ts,jsx,tsx,html,vue,mjs,mts,cts,cjs}'

function normalizePattern(pattern: boolean | string, pathService: Path.Path): boolean | string {
  if (typeof pattern === 'string') {
    return normalizeFileName(pathService.resolve(pattern))
  }
  if (pattern) {
    return DEFAULT_GLOB
  }
  return false
}

export function createFileMatcher(
  pattern: boolean | string,
  pathService: Path.Path,
  allowHiddenFiles = true,
): (fileName: string) => boolean {
  const normalized = normalizePattern(pattern, pathService)
  if (typeof normalized === 'string') {
    return (fileName: string) =>
      minimatch(normalizeFileName(pathService.resolve(fileName)), normalized, {
        dot: allowHiddenFiles,
      })
  }
  return () => normalized
}

export function matchesFile(
  pattern: boolean | string,
  fileName: string,
  pathService: Path.Path,
  allowHiddenFiles = true,
): boolean {
  return createFileMatcher(pattern, pathService, allowHiddenFiles)(fileName)
}

// ── validation-errors ───────────────────────────────────────────────

const PATH_LINE = /^at\s+(\[.*\])$/
const PATH_SEGMENT = /\["([^"]*)"\]|\[(\d+)\]/g
const EXPECTED_PATTERN = /^Expected a string matching the RegExp (.+)$/
const EXPECTED_TYPE = /^Expected (.+)$/

const dottedPath = (raw: string): string => {
  let path = ''
  for (const [, key, index] of raw.matchAll(PATH_SEGMENT)) {
    if (index !== undefined) {
      path += `[${index}]`
    } else {
      if (path.length > 0) {
        path += `.${key ?? ''}`
      } else {
        path += key ?? ''
      }
    }
  }
  return path
}

const phrase = (expectation: string): string => {
  const pattern = EXPECTED_PATTERN.exec(expectation)
  if (pattern !== null) return `must match pattern "${pattern[1] ?? ''}"`
  const type = EXPECTED_TYPE.exec(expectation)
  if (type !== null) return `should be ${type[1] ?? ''}`
  return expectation
}

export function describeErrors(error: S.SchemaError): string[] {
  const messages: string[] = []
  let expectation: string | undefined
  for (const raw of error.message.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    const path = PATH_LINE.exec(line)
    if (path !== null && expectation !== undefined) {
      messages.push(`Config option "${dottedPath(path[1] ?? '')}" ${phrase(expectation)}.`)
      expectation = undefined
      continue
    }
    if (expectation !== undefined) messages.push(expectation)
    expectation = line
  }
  if (expectation !== undefined) messages.push(expectation)
  if (messages.length > 0) {
    return messages
  }
  return [error.message]
}

// ── module-loader ───────────────────────────────────────────────────

export function importModule(moduleName: string, basePath: string): Effect.Effect<unknown, StrykerError> {
  return Effect.tryPromise({
    try: () => {
      if (moduleName.startsWith('.') || moduleName.startsWith('/') || moduleName.startsWith('file://')) {
        return import(moduleName)
      }
      return import(createRequire(`${basePath}/noop.js`).resolve(moduleName))
    },
    catch: (cause) => new StrykerError({ message: `Failed to import module "${moduleName}"`, cause }),
  })
}

export interface ExtendsStepState {
  readonly visited: readonly string[]
  readonly documents: readonly ExtendsStepDocument[]
}

export interface ExtendsStepDocument {
  readonly path: string
  readonly options: PartialStrykerOptions
}

export const initialExtendsStepState: ExtendsStepState = {
  visited: [],
  documents: [],
}

export type ExtendsRefusalReason = 'cycle' | 'non-string-extends'

const DoneTag = { _tag: 'done' } as const
type DoneTag = typeof DoneTag
const ReadTag = { _tag: 'read' } as const
type ReadTag = typeof ReadTag
const ResolveTag = { _tag: 'resolve' } as const
type ResolveTag = typeof ResolveTag
const RefusedTag = { _tag: 'refused' } as const
type RefusedTag = typeof RefusedTag

export type ExtendsStepDecision =
  | DoneTag & { readonly options: PartialStrykerOptions }
  | ReadTag & { readonly path: string; readonly state: ExtendsStepState }
  | ResolveTag & { readonly specifier: string; readonly directory: string; readonly state: ExtendsStepState }
  | RefusedTag & { readonly reason: ExtendsRefusalReason; readonly file: string }

/**
 * Merge a child config over a parent's resolved options.
 *
 * Arrays and non-records are replaced wholesale except for `plugins`, which is
 * appended, with the first occurrence of a descriptor winning.
 *
 * `plugins` is the one array that APPENDS to the parent's rather than
 * replacing it. An explicit `"plugins": []` cannot mean empty without breaking
 * every inheriting config — a child that names no plugins would wipe the
 * parent's, and every config that inherits from a preset would have to
 * redeclare the preset's plugins to keep them. The append preserves the
 * preset's plugins and lets the child add or deduplicate.
 */
export function mergeConfigs(
  parent: PartialStrykerOptions,
  child: PartialStrykerOptions,
): PartialStrykerOptions {
  const out: Record<string, unknown> = { ...parent }
  for (const [key, value] of Object.entries(child)) {
    if (value === null) {
      delete out[key]
      continue
    }
    const parentValue: unknown = Reflect.get(parent, key)
    if (key === 'plugins') {
      let parentPlugins: readonly unknown[] = []
      if (Array.isArray(parentValue)) {
        parentPlugins = parentValue
      }
      let childPlugins: readonly unknown[] = []
      if (Array.isArray(value)) {
        childPlugins = value
      }
      const merged = [...parentPlugins, ...childPlugins]
      out[key] = merged.filter(
        (descriptor, index) => typeof descriptor !== 'string' || !merged.slice(0, index).includes(descriptor),
      )
      continue
    }
    const bothObjects = parentValue !== null &&
      parentValue !== undefined &&
      typeof parentValue === 'object' &&
      !Array.isArray(parentValue) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    if (bothObjects) {
      out[key] = Object.assign({}, parentValue, value)
    } else {
      out[key] = value
    }
  }
  return out
}

export function isModuleSpecifier(value: string): boolean {
  return !(value.startsWith('./') || value.startsWith('../') ||
    value.startsWith('/') || value.startsWith('\\'))
}

const stripExtends = (document: PartialStrykerOptions): PartialStrykerOptions => {
  const { extends: _ignored, ...rest } = document
  return rest
}

const mergeChainDocuments = (documents: readonly ExtendsStepDocument[]): PartialStrykerOptions =>
  documents.reduceRight<PartialStrykerOptions>(
    (merged, entry) => mergeConfigs(merged, stripExtends(entry.options)),
    {},
  )

export const decideExtendsStep = (
  state: ExtendsStepState,
  document: PartialStrykerOptions,
  file: string,
  pathService: Path.Path,
): ExtendsStepDecision => {
  if (state.visited.includes(file)) {
    return { ...RefusedTag, reason: 'cycle', file }
  }
  const nextState: ExtendsStepState = {
    visited: [...state.visited, file],
    documents: [...state.documents, { path: file, options: document }],
  }
  return Match.value(Reflect.get(document, 'extends')).pipe(
    Match.when(undefined, (): ExtendsStepDecision => ({
      ...DoneTag,
      options: mergeChainDocuments(nextState.documents),
    })),
    Match.when(null, (): ExtendsStepDecision => ({
      ...DoneTag,
      options: mergeChainDocuments(nextState.documents),
    })),
    Match.when(Match.string, (extendValue) =>
      Match.value(isModuleSpecifier(extendValue)).pipe(
        Match.when(true, (): ExtendsStepDecision => ({
          ...ResolveTag,
          specifier: extendValue,
          directory: pathService.dirname(file),
          state: nextState,
        })),
        Match.when(false, (): ExtendsStepDecision => ({
          ...ReadTag,
          path: pathService.resolve(pathService.dirname(file), extendValue),
          state: nextState,
        })),
        Match.exhaustive,
      )),
    Match.orElse((): ExtendsStepDecision => ({ ...RefusedTag, reason: 'non-string-extends', file })),
  )
}

// ── resolve-extends ─────────────────────────────────────────────────

export function readConfigFile(
  configFile: string,
): Effect.Effect<
  PartialStrykerOptions,
  ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const ext = pathService.extname(configFile).toLowerCase()
    if (ext === '.json') {
      const fs = yield* FileSystem.FileSystem
      const fileContent = yield* fs.readFileString(configFile).pipe(
        Effect.mapError((cause) => new ConfigFileUnreadableError({ file: configFile, cause })),
      )
      const parsed = yield* Effect.try({
        try: (): unknown => JSON.parse(fileContent),
        catch: (cause) => new ConfigFileInvalidError({ file: configFile, cause }),
      })
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return yield* new ConfigFileInvalidError({ file: configFile, cause: 'Config must be a JSON object' })
      }
      return yield* S.decodeUnknownEffect(ConfigDocumentSchema)(parsed).pipe(
        Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
      )
    }
    const importResult = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(pathService.resolve(configFile)).toString()),
      catch: (cause) => new ConfigFileUnreadableError({ file: configFile, cause }),
    }).pipe(Effect.result)
    if (Result.isFailure(importResult)) {
      return yield* importResult.failure
    }
    const importedModule: unknown = importResult.success
    const exported = yield* S.decodeUnknownEffect(ImportedModuleSchema)(importedModule).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
      Effect.map((decoded) => decoded.default),
    )
    if (exported === undefined || exported === null || typeof exported !== 'object') {
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Default export of config file must be an object!',
      })
    }
    return yield* S.decodeUnknownEffect(ConfigDocumentSchema)(exported).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
    )
  })
}

function resolveExtendsSpecifier(
  specifier: string,
  configDir: string,
): Effect.Effect<string, ConfigFileUnreadableError, Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    return yield* Effect.try({
      try: () => {
        return createRequire(pathService.join(configDir, 'noop.js')).resolve(specifier)
      },
      catch: (cause) => new ConfigFileUnreadableError({ file: specifier, cause }),
    })
  })
}

export function resolveExtends(
  configFile: string,
  document: PartialStrykerOptions,
): Effect.Effect<
  PartialStrykerOptions,
  ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const absolute = pathService.resolve(configFile)
    const loop = (
      state: ExtendsStepState,
      file: string,
      currentDocument: PartialStrykerOptions,
    ): Effect.Effect<
      PartialStrykerOptions,
      ConfigFileUnreadableError | ConfigFileInvalidError,
      FileSystem.FileSystem | Path.Path
    > =>
      Match.value(decideExtendsStep(state, currentDocument, file, pathService)).pipe(
        Match.tag('done', (d) => Effect.succeed(d.options)),
        Match.tag('read', (d) =>
          readConfigFile(d.path).pipe(Effect.flatMap((nextDocument) => loop(d.state, d.path, nextDocument)))),
        Match.tag('resolve', (d) =>
          resolveExtendsSpecifier(d.specifier, d.directory).pipe(
            Effect.flatMap((resolvedPath) =>
              readConfigFile(resolvedPath).pipe(Effect.flatMap((nextDocument) =>
                loop(d.state, resolvedPath, nextDocument)
              ))
            ),
          )),
        Match.tag('refused', (d) => {
          let message = `Invalid config file "${d.file}". "extends" must be a string`
          if (d.reason === 'cycle') {
            message = `Config inheritance cycle detected at "${d.file}"`
          }
          return Effect.fail(new ConfigFileInvalidError({ file: d.file, cause: message }))
        }),
        Match.exhaustive,
      )
    return yield* loop(initialExtendsStepState, absolute, document)
  })
}

// ── options-validator ───────────────────────────────────────────────

export type ValidationSchemaDocument = {
  readonly properties?: unknown
  readonly [key: string]: unknown
}

// JSON Schema document for the fork's option surface — a *use* of forkOptionsSchema, not a declaration.
// Config.schema.ts declares forkOptionsSchema; this module builds the document where the boundary is crossed.
export const forkCoreSchema: Record<string, unknown> = S.toJsonSchemaDocument(forkOptionsSchema).schema

const decodeOptions = S.decodeUnknownResult(StrykerOptionsSchema, { errors: 'all' })

function recordOf(value: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    out[key] = Reflect.get(value, key)
  }
  return out
}

function validateRemovedSurface(
  rawOptions: Record<string, unknown>,
): Effect.Effect<void, ConfigError> {
  const errors: string[] = []
  for (const key of Object.keys(rawOptions)) {
    if (Object.hasOwn(REMOVED_OPTIONS, key)) {
      errors.push(`Config option "${key}" is no longer supported. ${REMOVED_OPTIONS[key]}`)
    }
  }
  const reporters = rawOptions['reporters']
  if (Array.isArray(reporters)) {
    for (const name of reporters) {
      if (typeof name === 'string' && Object.hasOwn(REMOVED_OPTIONS, name)) {
        errors.push(
          `Config option "reporters" contains removed reporter name "${name}". ${REMOVED_OPTIONS[name]}`,
        )
      }
    }
  }
  return Effect.gen(function*() {
    for (const error of errors) {
      yield* Effect.logError(error)
    }
    yield* throwErrorIfNeeded(errors)
  })
}

function removeStringMutator(rawOptions: Record<string, unknown>): Effect.Effect<void> {
  const mutator = rawOptions['mutator']
  if (typeof mutator !== 'string') return Effect.void
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      'DEPRECATED. Use of "mutator" as string is no longer needed. You can remove it from your configuration. Stryker now supports mutating of JavaScript and friend files out of the box.',
    )
    delete rawOptions['mutator']
  })
}

function removeMutatorName(rawOptions: Record<string, unknown>): Effect.Effect<void> {
  const mutator = rawOptions['mutator']
  if (typeof mutator !== 'object' || mutator === null) return Effect.void
  const mutatorRecord = recordOf(mutator)
  if (mutatorRecord['name'] === undefined) return Effect.void
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      'DEPRECATED. Use of "mutator.name" is no longer needed. You can remove "mutator.name" from your configuration. Stryker now supports mutating of JavaScript and friend files out of the box.',
    )
    delete mutatorRecord['name']
    rawOptions['mutator'] = mutatorRecord
  })
}

function removeTestFramework(rawOptions: Record<string, unknown>): Effect.Effect<void> {
  if (!Object.keys(rawOptions).includes('testFramework')) return Effect.void
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      'DEPRECATED. Use of "testFramework" is no longer needed. You can remove it from your configuration. Your test runner plugin now handles its own test framework integration.',
    )
    delete rawOptions['testFramework']
  })
}

function removeTranspilers(rawOptions: Record<string, unknown>): Effect.Effect<void> {
  const transpilers = rawOptions['transpilers']
  if (!Array.isArray(transpilers)) return Effect.void
  let example = 'npm run build'
  if (transpilers.includes('babel')) {
    example = 'babel src --out-dir lib'
  } else if (transpilers.includes('typescript')) {
    example = 'tsc -b'
  } else if (transpilers.includes('webpack')) {
    example = 'webpack --config webpack.config.js'
  }
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      `DEPRECATED. Support for "transpilers" is removed. You can now configure your own "${
        optionsPath('buildCommand')
      }". For example, ${example}.`,
    )
    delete rawOptions['transpilers']
  })
}

function rewriteFiles(rawOptions: Record<string, unknown>): Effect.Effect<void> {
  const files = rawOptions['files']
  if (!Array.isArray(files)) return Effect.void
  const ignorePatternsName = optionsPath('ignorePatterns')
  const filePatterns = files.filter((uncertain): uncertain is string => typeof uncertain === 'string')
  const newIgnorePatterns: string[] = [
    '**',
    ...filePatterns.map((filePattern) => {
      if (filePattern.startsWith(IGNORE_PATTERN_CHARACTER)) {
        return filePattern.slice(1)
      }
      return `${IGNORE_PATTERN_CHARACTER}${filePattern}`
    }),
  ]
  delete rawOptions['files']
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      `DEPRECATED. Use of "files" is deprecated, please use "${ignorePatternsName}" instead (or remove "files" altogether will probably work as well). For now, rewriting them as ${
        JSON.stringify(newIgnorePatterns)
      }. See https://stryker-mutator.io/docs/stryker-js/configuration/#ignorepatterns-string`,
    )
    let existingIgnorePatterns: unknown[] = []
    const candidate = rawOptions[ignorePatternsName]
    if (Array.isArray(candidate)) {
      existingIgnorePatterns = candidate
    }
    rawOptions[ignorePatternsName] = [...newIgnorePatterns, ...existingIgnorePatterns]
  })
}

function removeJestEnableBail(rawOptions: Record<string, unknown>): Effect.Effect<void> {
  const jestOptions = rawOptions['jest']
  if (typeof jestOptions !== 'object' || jestOptions === null) return Effect.void
  const jestRecord = recordOf(jestOptions)
  const enableBail = jestRecord['enableBail']
  if (enableBail === undefined) return Effect.void
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      'DEPRECATED. Use of "jest.enableBail" is deprecated, please use "disableBail" instead. See https://stryker-mutator.io/docs/stryker-js/configuration#disablebail-boolean',
    )
    rawOptions['disableBail'] = !enableBail
    delete jestRecord['enableBail']
    rawOptions['jest'] = jestRecord
  })
}

function removeHtmlReporterBaseDir(
  rawOptions: Record<string, unknown>,
  pathService: Path.Path,
): Effect.Effect<void> {
  const htmlReporter = rawOptions['htmlReporter']
  if (typeof htmlReporter !== 'object' || htmlReporter === null) return Effect.void
  const reporter = recordOf(htmlReporter)
  const baseDir = reporter['baseDir']
  if (baseDir === undefined || baseDir === null || baseDir === '') return Effect.void
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      `DEPRECATED. Use of "htmlReporter.baseDir" is deprecated, please use "${
        optionsPath('htmlReporter', 'fileName')
      }" instead. See https://stryker-mutator.io/docs/stryker-js/configuration/#reporters-string`,
    )
    let baseDirText = ''
    if (typeof baseDir === 'string') {
      baseDirText = baseDir
    } else {
      baseDirText = JSON.stringify(baseDir)
    }
    if (reporter['fileName'] === undefined) {
      reporter['fileName'] = pathService.join(baseDirText, 'index.html')
    }
    delete reporter['baseDir']
    rawOptions['htmlReporter'] = reporter
  })
}

function migrateMaxConcurrentTestRunners(
  rawOptions: Record<string, unknown>,
): Effect.Effect<void> {
  const maxConcurrent = rawOptions['maxConcurrentTestRunners']
  if (typeof maxConcurrent !== 'number' || maxConcurrent === Number.MAX_SAFE_INTEGER) return Effect.void
  return Effect.gen(function*() {
    yield* Effect.logWarning(
      'DEPRECATED. Use of "maxConcurrentTestRunners" is deprecated. Please use "concurrency" instead.',
    )
    const concurrency = rawOptions['concurrency']
    const availableParallelism = yield* Effect.sync(getAvailableParallelism)
    if (concurrency === undefined && maxConcurrent < availableParallelism - 1) {
      rawOptions['concurrency'] = maxConcurrent
    }
  })
}

function removeDeprecatedOptions(
  rawOptions: Record<string, unknown>,
  pathService: Path.Path,
): Effect.Effect<void> {
  return Effect.gen(function*() {
    yield* removeStringMutator(rawOptions)
    yield* removeMutatorName(rawOptions)
    yield* removeTestFramework(rawOptions)
    yield* removeTranspilers(rawOptions)
    yield* rewriteFiles(rawOptions)
    yield* removeJestEnableBail(rawOptions)
    yield* removeHtmlReporterBaseDir(rawOptions, pathService)
    yield* migrateMaxConcurrentTestRunners(rawOptions)
  })
}

function customValidation(
  options: StrykerOptions,
): Effect.Effect<void, ConfigError> {
  return Effect.gen(function*() {
    const additionalErrors: string[] = []
    if (options.thresholds.high < options.thresholds.low) {
      additionalErrors.push('Config option "thresholds.high" should be higher than "thresholds.low".')
    }
    if (isCommandRunner(options.testRunner)) {
      if (options.testRunnerNodeArgs.length > 0) {
        yield* Effect.logWarning(
          'Using "testRunnerNodeArgs" together with the "command" test runner is not supported, these arguments will be ignored. You can add your custom arguments by setting the "commandRunner.command" option.',
        )
      }
    }
    if (options.ignoreStatic && options.coverageAnalysis !== 'perTest') {
      additionalErrors.push(
        `Config option "${
          optionsPath('ignoreStatic')
        }" is not supported with coverage analysis "${options.coverageAnalysis}". Either turn off "${
          optionsPath('ignoreStatic')
        }", or configure "${optionsPath('coverageAnalysis')}" to be "perTest".`,
      )
    }
    options.mutate.forEach((mutateString, index) => {
      const match = MUTATION_RANGE_REGEX.exec(mutateString)
      if (match !== null) {
        if (new Minimatch(mutateString).hasMagic()) {
          additionalErrors.push(
            `Config option "mutate[${index}]" is invalid. Cannot combine a glob expression with a mutation range in "${mutateString}".`,
          )
        } else {
          const mutationRange = match[2]
          const startLine = match[3]
          const endLine = match[5]
          const start = Number.parseInt(startLine ?? '', 10)
          const end = Number.parseInt(endLine ?? '', 10)
          if (start < 1) {
            additionalErrors.push(
              `Config option "mutate[${index}]" is invalid. Mutation range "${mutationRange}" is invalid, line ${start} does not exist (lines start at 1).`,
            )
          }
          if (start > end) {
            additionalErrors.push(
              `Config option "mutate[${index}]" is invalid. Mutation range "${mutationRange}" is invalid. The "from" line number (${start}) should be less then the "to" line number (${end}).`,
            )
          }
        }
      }
    })
    for (const error of additionalErrors) {
      yield* Effect.logError(error)
    }
    yield* throwErrorIfNeeded(additionalErrors)
  })
}

function schemaValidate(
  options: Record<string, unknown>,
): Effect.Effect<StrykerOptions, ConfigError> {
  const decoded = decodeOptions(options)
  if (Result.isFailure(decoded)) {
    const describedErrors = describeErrors(decoded.failure)
    return Effect.gen(function*() {
      for (const error of describedErrors) {
        yield* Effect.logError(error)
      }
      let headline = 'Please correct these configuration errors and try again.'
      if (describedErrors.length === 1) {
        headline = 'Please correct this configuration error and try again.'
      }
      return yield* new ConfigError({ message: `${headline} ${describedErrors.join(' ')}` })
    }).pipe(Effect.flatMap((error) => Effect.fail(error)))
  }
  Object.assign(options, decoded.success)
  return Effect.succeed(decoded.success)
}

function throwErrorIfNeeded(errors: string[]): Effect.Effect<void, ConfigError> {
  if (errors.length > 0) {
    let headline = 'Please correct these configuration errors and try again.'
    if (errors.length === 1) {
      headline = 'Please correct this configuration error and try again.'
    }
    return Effect.fail(new ConfigError({ message: `${headline} ${errors.join(' ')}` }))
  }
  return Effect.void
}

function markExcessOptions(
  options: StrykerOptions,
  schema: ValidationSchemaDocument,
): Effect.Effect<void> {
  return Effect.gen(function*() {
    const OPTIONS_ADDED_BY_STRYKER = ['set', 'configFile', '$schema']
    if (isWarningEnabled('unknownOptions', options.warnings)) {
      const propsValue = schema['properties']
      let propsObject: object = {}
      if (typeof propsValue === 'object' && propsValue !== null) {
        propsObject = propsValue
      }
      const schemaProperties = recordOf(propsObject)
      const schemaKeys = Object.keys(schemaProperties)
      const excessPropertyNames = Object.keys(options)
        .filter((key) => !key.endsWith('_comment'))
        .filter((key) => !OPTIONS_ADDED_BY_STRYKER.includes(key))
        .filter((key) => !schemaKeys.includes(key))
      if (excessPropertyNames.length > 0) {
        for (const excessPropertyName of excessPropertyNames) {
          yield* Effect.logWarning(`Unknown stryker config option "${excessPropertyName}".`)
        }
        yield* Effect.logWarning(`Possible causes:
     * Is it a typo on your end?
     * Did you only write this property as a comment? If so, please postfix it with "_comment".
     * You might be missing a plugin that is supposed to use it. Stryker loaded plugins from: ${
          JSON.stringify(options.plugins)
        }
     * The plugin that is using it did not contribute explicit validation. 
      (disable "${optionsPath('warnings', 'unknownOptions')}" to ignore this warning)`)
      }
    }
  })
}

function markUnserializableOptions(options: StrykerOptions): Effect.Effect<void> {
  return Effect.gen(function*() {
    if (isWarningEnabled('unserializableOptions', options.warnings)) {
      const unserializables = findUnserializables(options)
      if (unserializables !== undefined) {
        for (const unserializable of unserializables) {
          yield* Effect.logWarning(
            `Config option "${
              unserializable.path.join('.')
            }" is not (fully) serializable. ${unserializable.reason}. Any test runner or checker worker processes might not receive this value as intended.`,
          )
        }
        yield* Effect.logWarning(`(disable ${optionsPath('warnings', 'unserializableOptions')} to ignore this warning)`)
      }
    }
  })
}

function markOptions(
  options: StrykerOptions,
  schema: ValidationSchemaDocument,
): Effect.Effect<void> {
  return Effect.gen(function*() {
    yield* markExcessOptions(options, schema)
    yield* markUnserializableOptions(options)
  })
}

export function validateOptions(
  options: Record<string, unknown>,
  schema: ValidationSchemaDocument,
): Effect.Effect<StrykerOptions, ConfigError, Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    yield* removeDeprecatedOptions(options, pathService)
    yield* validateRemovedSurface(options)
    const typed = yield* schemaValidate(options)
    yield* customValidation(typed)
    yield* markOptions(typed, schema)
    return typed
  })
}

export function createDefaultOptions(): Effect.Effect<StrykerOptions> {
  return S.decodeEffect(StrykerOptionsSchema)({}).pipe(Effect.orDie)
}

export const defaultOptions: Effect.Effect<Immutable<StrykerOptions>, never, never> = Effect.map(
  createDefaultOptions(),
  (opts) => deepFreeze(opts),
)

// ── config-reader ───────────────────────────────────────────────────

const cliOptionsRecord = Wire.record(Wire.string, Wire.mint(S.Unknown)) // plugin sections are foreign by design

export const CONFIG_SYNTAX_HELP = `
Example of how a config file should look:
/**
  * @type {import('@systemfsoftware/stryker-js/Mutant').StrykerOptions}
  */
export default {
  // You're options here!
}

Or using commonjs:
/**
  * @type {import('@systemfsoftware/stryker-js/Mutant').StrykerOptions}
  */
module.exports = {
  // You're options here!
}

See https://stryker-mutator.io/docs/stryker-js/config-file for more information.`.trim()

function exists(fileName: string): Effect.Effect<boolean, ConfigFileUnreadableError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.access(fileName).pipe(
      Effect.as(true),
      Effect.catchTag('PlatformError', (error) =>
        Match.value(error.reason).pipe(
          Match.tag('NotFound', () => Effect.succeed(false)),
          Match.orElse(() => Effect.fail(new ConfigFileUnreadableError({ file: fileName, cause: error }))),
        )),
      Effect.mapError((error) => new ConfigFileUnreadableError({ file: fileName, cause: error })),
    )
  })
}

function findConfigFile(
  configFileName: unknown,
): Effect.Effect<string | undefined, ConfigFileNotFoundError | ConfigFileUnreadableError, FileSystem.FileSystem> {
  if (typeof configFileName === 'string') {
    return exists(configFileName).pipe(
      Effect.flatMap((doesExist) => {
        if (doesExist) {
          return Effect.succeed(configFileName)
        }
        return Effect.fail(new ConfigFileNotFoundError({ file: configFileName }))
      }),
    )
  }
  return Effect.gen(function*() {
    for (const fileName of SUPPORTED_CONFIG_FILE_NAMES) {
      const doesExist = yield* exists(fileName)
      if (doesExist) {
        return fileName
      }
    }
    return undefined
  })
}

function readJsonConfig(
  configFile: string,
): Effect.Effect<Record<string, unknown>, ConfigFileUnreadableError | ConfigFileInvalidError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const fileContent = yield* fs.readFileString(configFile).pipe(
      Effect.mapError((cause) => new ConfigFileUnreadableError({ file: configFile, cause })),
    )
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(fileContent),
      catch: (cause) => new ConfigFileInvalidError({ file: configFile, cause }),
    })
    return yield* S.decodeUnknownEffect(ConfigDocumentSchema)(parsed).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
    )
  })
}

function importJSConfigModule(
  configFile: string,
  basePath: string,
): Effect.Effect<unknown, ConfigFileUnreadableError, Path.Path> {
  return Effect.gen(function*() {
    const pathService = yield* Path.Path
    const url = pathToFileURL(pathService.resolve(configFile)).toString()
    return yield* importModule(url, basePath).pipe(
      Effect.mapError((cause) => new ConfigFileUnreadableError({ file: configFile, cause })),
    )
  })
}

function importJSConfig(
  configFile: string,
  basePath: string,
): Effect.Effect<Record<string, unknown>, ConfigFileUnreadableError | ConfigFileInvalidError, Path.Path> {
  return Effect.gen(function*() {
    const importedModule = yield* importJSConfigModule(configFile, basePath)
    const decodedResult = S.decodeUnknownResult(ImportedModuleSchema)(importedModule)
    if (Result.isFailure(decodedResult)) {
      return yield* new ConfigFileInvalidError({ file: configFile, cause: decodedResult.failure })
    }
    const decodedModule = decodedResult.success
    const maybeOptions = decodedModule.default
    if (maybeOptions === undefined) {
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Config file must have a default export!',
      })
    }
    if (typeof maybeOptions !== 'object' || maybeOptions === null) {
      return yield* new ConfigFileInvalidError({
        file: configFile,
        cause: 'Default export of config file must be an object!',
      })
    }
    const decoded = yield* S.decodeUnknownEffect(ConfigDocumentSchema)(maybeOptions).pipe(
      Effect.mapError((cause) => new ConfigFileInvalidError({ file: configFile, cause })),
    )
    return { ...decoded }
  })
}

function loadOptionsFromConfigFile(
  cliOptions: Record<string, unknown>,
  basePath: string,
): Effect.Effect<
  unknown,
  ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return findConfigFile(cliOptions['configFile']).pipe(
    Effect.flatMap((configFile) => {
      if (configFile === undefined) {
        return Effect.succeed({})
      }
      return Effect.gen(function*() {
        const pathService = yield* Path.Path
        const ext = pathService.extname(configFile).toLowerCase()
        let child: Record<string, unknown>
        if (ext === '.json') {
          child = yield* readJsonConfig(configFile)
        } else {
          child = yield* importJSConfig(configFile, basePath)
        }
        if (!('extends' in child)) {
          return child
        }
        return yield* resolveExtends(configFile, child)
      })
    }),
  )
}
interface ConfigReaderPhases extends Cell.Phases {
  readonly command: ReadConfigCommand
  readonly raw: unknown
  readonly decoded: MergeCommand
  readonly decision: import('./Config.workflow.js').MergeResult
  readonly decisionError: import('./Config.workflow.js').MergeError
  readonly output: StrykerOptions
  readonly response: StrykerOptions
  readonly decodeError: ConfigFileInvalidError
  readonly readError: ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError
  readonly writeError: never
}

const configReaderDescription = (
  cliOptions: Record<string, unknown>,
  basePath: string,
  services: Context.Context<FileSystem.FileSystem | Path.Path>,
): Cell.WriteDone<ConfigReaderPhases> =>
  pipe(
    Cell.read<ConfigReaderPhases>(() =>
      Effect.provideContext(loadOptionsFromConfigFile(cliOptions, basePath), services)
    ),
    Cell.decode<ConfigReaderPhases>((raw) =>
      Result.match(S.decodeUnknownResult(ConfigDocumentSchema)(raw), {
        onFailure: (cause) => Result.fail(new ConfigFileInvalidError({ file: 'config', cause })),
        onSuccess: (fileOptions) =>
          Result.succeed(
            new MergeCommand({
              base: fileOptions,
              overrides: cliOptions,
            }),
          ),
      })
    ),
    Cell.decide<ConfigReaderPhases>(mergeConfigsWorkflow),
    Cell.encode<ConfigReaderPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: (error) => {
          throw error
        },
        onSuccess: (result) => {
          const decoded = S.decodeUnknownResult(StrykerOptionsSchema)(result.merged)
          if (Result.isFailure(decoded)) {
            const describedErrors = describeErrors(decoded.failure)
            let headline = 'Please correct these configuration errors and try again.'
            if (describedErrors.length === 1) {
              headline = 'Please correct this configuration error and try again.'
            }
            throw new ConfigError({ message: `${headline} ${describedErrors.join(' ')}` })
          }
          return decoded.success
        },
      })
    ),
    Cell.write<ConfigReaderPhases>((output) => Effect.succeed(output)),
  )

export function readConfig(
  cliOptions: PartialStrykerOptions,
  basePath: string,
): Effect.Effect<
  StrykerOptions,
  ConfigFileNotFoundError | ConfigFileUnreadableError | ConfigFileInvalidError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function*() {
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>()
    const cliRecord = yield* S.decodeUnknownEffect(cliOptionsRecord)(cliOptions).pipe(Effect.orDie)
    const description = configReaderDescription(cliRecord, basePath, services)
    const command = new ReadConfigCommand({ cliOptions: cliRecord, basePath })
    return yield* Cell.apply(description, command)
  })
}
