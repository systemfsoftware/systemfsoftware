import { parse as parseJsonc } from '@std/jsonc'
import { Option, Schema } from 'effect'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Role } from '../src/effect-preset-opt-ins.schema.js'
import {
  diagnosticKeysOf,
  entrypointRole,
  libraryRole,
  presetOptIns,
  renderEffectJson,
  renderOptInsJson,
  type RoleSpec,
} from '../src/effect-roles.js'
import { TsgoSchema } from './render.schema.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Rendered {
  readonly file: string
  readonly contents: string
}

const renderedFiles = (): ReadonlyArray<Rendered> => [
  { file: 'effect.json', contents: renderEffectJson(libraryRole) },
  { file: 'effect-entrypoint.json', contents: renderEffectJson(entrypointRole) },
  { file: 'opt-ins.json', contents: renderOptInsJson() },
]

const installedSchemaKeys = (): ReadonlyArray<string> =>
  Option.match(
    Schema.decodeUnknownOption(TsgoSchema)(
      parseJsonc(readFileSync(join(packageRoot, 'node_modules/@effect/tsgo/schema.json'), 'utf8')),
    ),
    {
      onNone: () => [],
      onSome: (schema) =>
        Object.keys(schema.definitions.effectLanguageServicePluginDiagnosticSeverityDefinition.properties),
    },
  )

const exclusionsFor = (role: Role): ReadonlyArray<string> =>
  presetOptIns
    .flatMap((optIn) => 'diagnostic' in optIn.grant ? [optIn.grant] : [])
    .filter((grant) => grant.role === role)
    .map((grant) => grant.diagnostic)

const rolesForCoverage: ReadonlyArray<readonly [Role, RoleSpec]> = [
  ['library', libraryRole],
  ['test', entrypointRole],
]

const coverageProblems = (): ReadonlyArray<string> => {
  const schemaKeys = installedSchemaKeys()
  return rolesForCoverage.flatMap(([role, spec]) => {
    const keys = diagnosticKeysOf(spec)
    const excluded = exclusionsFor(role)
    return [
      ...schemaKeys
        .filter((key) => !keys.includes(key))
        .filter((key) => !excluded.includes(key))
        .map((key) => `${role}: ${key} is not at error and is not a declared exclusion`),
      ...keys.filter((key) => !schemaKeys.includes(key)).map((key) => `${role}: unknown diagnostic ${key}`),
    ]
  })
}

const driftOf = (rendered: ReadonlyArray<Rendered>): ReadonlyArray<string> =>
  rendered
    .filter((entry) => readFileSync(join(packageRoot, entry.file), 'utf8') !== entry.contents)
    .map((entry) => entry.file)

const main = (): number => {
  const rendered = renderedFiles()
  const isCheck = process.argv.includes('--check')
  const drift = driftOf(rendered)
  if (!isCheck) {
    rendered.forEach((entry) => writeFileSync(join(packageRoot, entry.file), entry.contents))
  }
  const failures = isCheck
    ? [...drift.map((file) => `${file}: checked in bytes differ from a fresh render`), ...coverageProblems()]
    : coverageProblems()
  failures.forEach((failure) => console.error(failure))
  return failures.length === 0 ? 0 : 1
}

process.exitCode = main()
