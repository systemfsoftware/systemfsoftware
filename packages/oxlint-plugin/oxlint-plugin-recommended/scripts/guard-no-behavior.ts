#!/usr/bin/env node
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenFiles: readonly string[] = ['stryker.config.json', 'vitest.config.ts', 'tsconfig.node.json']
const forbiddenScripts: readonly string[] = ['test', 'test:run', 'mutation', 'mutation:full']
const forbiddenDependencies: readonly string[] = [
  'vitest',
  '@vitest/coverage-v8',
  '@systemfsoftware/vitest-config',
  '@systemfsoftware/stryker-js-vitest-runner',
  '@systemfsoftware/stryker-js-engine',
  '@systemfsoftware/stryker-js-typescript-checker',
]

type BehaviorPattern = { readonly pattern: RegExp; readonly name: string }

const behaviorPatterns: readonly BehaviorPattern[] = [
  { pattern: /=>/u, name: 'an arrow function' },
  { pattern: /\bfunction\b/u, name: 'a function declaration' },
  { pattern: /\b(?:if|for|while|switch|try)\b/u, name: 'a control-flow keyword' },
]

// Ordering is deliberate and NOT fixed here (declared, CONSTITUTION §V.6).
// Comments are stripped BEFORE string literals are replaced, so a `//` inside a scanned
// string mangles that line and the gate below false-negatives. Reordering the
// passes is a lateral move: replacing literals first breaks on any apostrophe in
// a comment (`don't`). The correct fix is the workspace `oxc-parser`. This
// package also lists `test` in `forbiddenScripts` by design, so the ordering
// cannot be verified by a test here.
const stripLiterals = (source: string): string =>
  source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
    .replaceAll(/\/\/[^\n]*/gu, ' ')
    .replaceAll(/`(?:[^`\\]|\\.)*`/gu, "''")
    .replaceAll(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replaceAll(/"(?:[^"\\\n]|\\.)*"/gu, "''")

const violations: string[] = []

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

const manifest: unknown = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))

// Outside data (CONST-B5): no cast is permitted, and a narrowed `object` cannot be
// indexed, so a section is read through its own-property descriptor.
const declares = (section: string, name: string): boolean => {
  if (typeof manifest !== 'object' || manifest === null) return false
  const entries: unknown = Object.getOwnPropertyDescriptor(manifest, section)?.value
  if (typeof entries !== 'object' || entries === null) return false
  return name in entries
}

for (const script of forbiddenScripts) {
  if (declares('scripts', script)) violations.push(`package.json#scripts.${script} exists`)
}

for (const dep of forbiddenDependencies) {
  if (declares('dependencies', dep) || declares('devDependencies', dep)) {
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
