import { parse as parseJsonc } from '@std/jsonc'
import { Array as Arr, Effect, Option, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'
import type { SchemaError } from 'effect/Schema'
import { type EffectPluginBlock, PresetManifest } from './EffectPluginBlock.schema.js'
import { asRawObject, type Raw } from './json.js'
import { OptIns, type OptIns as OptInsType, OptInsModule, type Role } from './OptIn.schema.js'
import { DEFAULT_PLUGIN_BASE, effectPluginBaseOf } from './pluginBase.js'
import { extendsOf, planSync, roleOf, serializeTsconfig } from './syncPlan.js'

export interface SyncOptions {
  readonly dir: string
  readonly check: boolean
}

export interface SyncReport {
  readonly exitCode: number
  readonly messages: ReadonlyArray<string>
}

const PRESET_PACKAGE_DIR = '@systemfsoftware/tsconfig'

const PRESET_EXPORT_BY_ROLE: Readonly<Record<Role, string>> = {
  library: './effect',
  test: './effect/entrypoint',
}

const moduleOptIns = (namespace: Raw): Effect.Effect<Raw, SchemaError> =>
  Effect.map(Schema.decodeUnknownEffect(OptInsModule)(namespace), (shaped) => shaped.default ?? shaped.optIns)

const loadOptIns = (dir: string): Effect.Effect<OptInsType, SchemaError> =>
  Effect.flatMap(
    Effect.promise(() => import(`${dir}/opt-ins.ts`)),
    (namespace) => Effect.flatMap(moduleOptIns(namespace), (value) => Schema.decodeUnknownEffect(OptIns)(value)),
  )

const presetPackageDir = (dir: string): string => `${dir}/node_modules/${PRESET_PACKAGE_DIR}`

const presetPath = (dir: string, role: Role, fs: FileSystem.FileSystem): Effect.Effect<string, PlatformError> =>
  Effect.gen(function*() {
    const text = yield* fs.readFileString(`${presetPackageDir(dir)}/package.json`)
    const manifest = yield* Schema.decodeUnknownEffect(PresetManifest)(parseJsonc(text)).pipe(Effect.orDie)
    const relative = yield* Schema.decodeUnknownEffect(Schema.String)(manifest.exports[PRESET_EXPORT_BY_ROLE[role]])
      .pipe(Effect.orDie)
    return `${presetPackageDir(dir)}/${relative}`
  })

const baseOf = (
  dir: string,
  role: Role,
  fs: FileSystem.FileSystem,
): Effect.Effect<EffectPluginBlock, PlatformError> =>
  Effect.gen(function*() {
    const preset = yield* Effect.map(fs.readFileString(yield* presetPath(dir, role, fs)), parseJsonc)
    return effectPluginBaseOf(preset) ?? DEFAULT_PLUGIN_BASE
  })

const roleOfTsconfig = (tsconfig: Raw): Option.Option<Role> =>
  Option.flatMap(
    Option.fromNullishOr(asRawObject(tsconfig)),
    (object) => Option.fromNullishOr(roleOf(extendsOf(object))),
  )

const diffMessage = (path: string, existing: string, next: string): Option.Option<string> =>
  existing === next ? Option.none() : Option.some(`${path}: synced plugin block differs; run \`opt-in sync\``)

const applyOutcome = (
  check: boolean,
  fs: FileSystem.FileSystem,
  path: string,
  existing: string,
  next: string,
): Effect.Effect<Option.Option<string>, PlatformError> =>
  check
    ? Effect.succeed(diffMessage(path, existing, next))
    : Effect.as(fs.writeFileString(path, next), Option.none())

const applyRole = (
  options: SyncOptions,
  fs: FileSystem.FileSystem,
  optIns: OptInsType,
  path: string,
  existing: string,
  tsconfig: Raw,
  role: Role,
): Effect.Effect<Option.Option<string>, PlatformError> =>
  Effect.gen(function*() {
    const base = yield* baseOf(options.dir, role, fs)
    const next = serializeTsconfig(planSync({ tsconfig: asRawObject(tsconfig) ?? {}, role, base, optIns }))
    return yield* applyOutcome(options.check, fs, path, existing, next)
  })

const outcomeOf =
  (options: SyncOptions, fs: FileSystem.FileSystem, optIns: OptInsType) =>
  (name: string): Effect.Effect<Option.Option<string>, PlatformError> =>
    Effect.gen(function*() {
      const path = `${options.dir}/${name}`
      const existing = yield* fs.readFileString(path)
      const tsconfig = parseJsonc(existing)
      return yield* Option.match(roleOfTsconfig(tsconfig), {
        onNone: () => Effect.succeedNone,
        onSome: (role) => applyRole(options, fs, optIns, path, existing, tsconfig, role),
      })
    })

const candidateNames = (entries: ReadonlyArray<string>): ReadonlyArray<string> =>
  entries.filter((name) => name.startsWith('tsconfig') && name.endsWith('.json'))

export const runSync = (options: SyncOptions) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const optIns = yield* loadOptIns(options.dir)
    const entries = yield* fs.readDirectory(options.dir)
    const outcomes = yield* Effect.forEach(candidateNames(entries), outcomeOf(options, fs, optIns), { concurrency: 1 })
    const messages = Arr.getSomes(outcomes)
    return { exitCode: messages.length === 0 ? 0 : 1, messages }
  })
