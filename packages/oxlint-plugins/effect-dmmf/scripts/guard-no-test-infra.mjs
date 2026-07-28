#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenFiles = ['stryker.config.json', 'vitest.config.ts', 'tsconfig.node.json']
const forbiddenScripts = ['test', 'test:run', 'mutation', 'mutation:full']
const forbiddenDependencies = [
  'vitest',
  '@vitest/coverage-v8',
  '@systemfsoftware/vitest-config',
  '@stryker-mutator/vitest-runner',
  '@systemfsoftware/stryker-js-core',
  '@systemfsoftware/stryker-js-typescript-checker',
]

const violations = []

for (const file of forbiddenFiles) {
  if (existsSync(join(packageDir, file))) violations.push(`${file} exists`)
}

const srcDir = join(packageDir, 'src')
if (existsSync(srcDir)) {
  for (const entry of readdirSync(srcDir)) {
    if (entry.endsWith('.test.ts')) violations.push(`src/${entry} exists`)
  }
}

const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))

for (const script of forbiddenScripts) {
  if (script in (pkg.scripts ?? {})) violations.push(`package.json#scripts.${script} exists`)
}

for (const dep of forbiddenDependencies) {
  if (dep in (pkg.dependencies ?? {}) || dep in (pkg.devDependencies ?? {})) {
    violations.push(`package.json depends on ${dep}`)
  }
}

if (violations.length > 0) {
  console.error(
    [
      'effect-dmmf test/mutation infra is forbidden. Expected: a pure re-export package with no test surface.',
      `Actual: ${violations.join('; ')}.`,
      'Fix: read effect-dmmf/AGENTS.md#ED1 before adding tests or a mutation gate here — if you are adding real ' +
      'decision logic (not a spread/lookup), ED2 tells you when the exemption ends.',
    ].join('\n'),
  )
  process.exit(1)
}
