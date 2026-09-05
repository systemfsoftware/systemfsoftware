#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PRIVATE_LEAVES = [
  '@systemfsoftware/oxlint-plugin-effect-native',
  '@systemfsoftware/oxlint-plugin-tag-discipline',
  '@systemfsoftware/oxlint-plugin-structure',
]

const SPECIFIER = new RegExp(
  `(from\\s*|require\\(\\s*|import\\(\\s*)['"](${PRIVATE_LEAVES.map((name) => `${name}(?=[/'"])`).join('|')})['"]`,
)

const offenders = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path)
      continue
    }
    if (!/\.(mjs|cjs|js|mts|cts|ts)$/.test(entry.name)) continue
    const source = readFileSync(path, 'utf8')
    if (SPECIFIER.test(source)) offenders.push(path)
  }
}

walk(new URL('../dist', import.meta.url).pathname)

if (offenders.length > 0) {
  console.error(
    `dist imports private leaf packages; the published tarball would carry unresolvable bare imports:\n${
      offenders.join('\n')
    }`,
  )
  process.exit(1)
}
