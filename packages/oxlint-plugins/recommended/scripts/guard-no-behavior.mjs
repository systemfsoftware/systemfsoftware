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

const behaviorPatterns = [
  { pattern: /=>/u, name: 'an arrow function' },
  { pattern: /\bfunction\b/u, name: 'a function declaration' },
  { pattern: /\b(?:if|for|while|switch|try)\b/u, name: 'a control-flow keyword' },
]

const stripLiterals = (source) =>
  source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
    .replaceAll(/\/\/[^\n]*/gu, ' ')
    .replaceAll(/`(?:[^`\\]|\\.)*`/gu, "''")
    .replaceAll(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replaceAll(/"(?:[^"\\\n]|\\.)*"/gu, "''")

const violations = []

for (const file of forbiddenFiles) {
  if (existsSync(join(packageDir, file))) violations.push(`${file} exists`)
}

const srcDir = join(packageDir, 'src')
if (existsSync(srcDir)) {
  for (const entry of readdirSync(srcDir)) {
    if (entry.endsWith('.test.ts')) violations.push(`src/${entry} exists`)
    if (!entry.endsWith('.ts')) continue
    const source = stripLiterals(readFileSync(join(srcDir, entry), 'utf8'))
    for (const { pattern, name } of behaviorPatterns) {
      if (pattern.test(source)) violations.push(`src/${entry} contains ${name}`)
    }
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
      'Behavior in oxlint-plugin-recommended is forbidden. Expected: declaration data only — literal rule bags and glob arrays, no functions, no control flow, no test surface.',
      `Actual: ${violations.join('; ')}.`,
      'Fix: express the settings as literal data. A computed glob or rule key is behavior a mutation can get wrong, and a wrong glob is a gate that silently never fires — read AGENTS.md#RC1 before adding logic here; RC2 says what to do when the logic is genuinely required.',
    ].join('\n'),
  )
  process.exit(1)
}
