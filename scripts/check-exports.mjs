#!/usr/bin/env node
/**
 * check-exports.mjs — Detect drift between package.json exports and build output.
 *
 * For each publishable package:
 * 1. Every export's `default` and `types` files exist in dist/
 * 2. Every export with an api-extractor rollup filename has a matching config
 * 3. Every api-extractor config's main entry points to an existing tsdown dts output
 * 4. Every export without explicit `types` has a .d.{mts,ts,cts} alongside the JS file
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(repoRoot, 'packages')

let errors = 0
let warnings = 0

function error(msg) {
  errors += 1
  console.error(`  ERROR: ${msg}`)
}
function warn(msg) {
  warnings += 1
  console.warn(`  WARN:  ${msg}`)
}

function discoverPackages(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const packages = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const packagePath = join(dir, entry.name)
    const manifestPath = join(packagePath, 'package.json')
    let manifestExists = false
    try {
      manifestExists = readdirSync(packagePath).includes('package.json')
    } catch {}
    if (!manifestExists) {
      packages.push(...discoverPackages(packagePath))
      continue
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.private === true) continue
    packages.push({ path: packagePath, manifest })
  }
  return packages
}

function resolveUnscopedName(manifest) {
  const name = manifest.name
  const parts = name.split('/')
  return parts.length > 1 ? parts[parts.length - 1] : name
}

function resolveTemplate(template, unscopedName) {
  return template.replace(/<unscopedPackageName>/g, unscopedName)
}

function findDtsSidecar(jsPath) {
  // Check .d.mts, .d.ts, .d.cts alongside the JS file
  for (const ext of ['.d.mts', '.d.ts', '.d.cts']) {
    const candidate = jsPath.replace(/\.(m|c)?js$/, ext)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const packages = discoverPackages(packagesRoot)

for (const { path: pkgPath, manifest } of packages) {
  const name = manifest.name
  const unscopedName = resolveUnscopedName(manifest)
  const distDir = join(pkgPath, 'dist')
  const relPath = relative(packagesRoot, pkgPath)
  const hasDist = existsSync(distDir)

  if (!manifest.exports) {
    warn(`${name} (${relPath}): no exports field`)
    continue
  }

  // Collect api-extractor configs and expand their templates
  let apiExtractorConfigs = []
  try {
    apiExtractorConfigs = readdirSync(pkgPath)
      .filter(f => f.startsWith('api-extractor') && f.endsWith('.json'))
      .map(f => JSON.parse(readFileSync(join(pkgPath, f), 'utf8')))
  } catch {}

  const apiExtractorRollups = new Set(
    apiExtractorConfigs
      .map(c => c.dtsRollup?.untrimmedFilePath)
      .filter(Boolean)
      .map(p => resolveTemplate(p, unscopedName))
      .map(p => {
        const idx = p.lastIndexOf('/')
        return idx >= 0 ? p.slice(idx + 1) : p
      }),
  )

  console.log(`\n${name}`)

  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    if (subpath === './package.json') continue

    const defaultPath = typeof entry === 'string' ? entry : entry.default
    const typesPath = typeof entry === 'object' && entry !== null ? entry.types : undefined

    // CHECK 1: default file exists
    if (defaultPath) {
      const file = defaultPath.replace(/^\.\//, '')
      const fullPath = join(pkgPath, file)
      if (hasDist && !existsSync(fullPath)) {
        error(`${subpath}: default "${file}" not found in dist`)
      }
    }

    // CHECK 2: explicit types file exists
    if (typesPath) {
      const file = typesPath.replace(/^\.\//, '')
      const fullPath = join(pkgPath, file)
      if (hasDist && !existsSync(fullPath)) {
        error(`${subpath}: types "${file}" not found in dist`)
      }

      // CHECK 3: api-extractor rollup coverage
      const rollupFilename = file.split('/').pop()
      if (rollupFilename && apiExtractorRollups.size > 0 && !apiExtractorRollups.has(rollupFilename)) {
        error(
          `${subpath}: types "${file}" has no matching api-extractor config. ` +
            `Existing rollups: [${[...apiExtractorRollups].join(', ')}]`,
        )
      }
    } else if (defaultPath && hasDist) {
      // CHECK 4: no explicit types — verify .d.* sidecar exists
      const defaultFile = defaultPath.replace(/^\.\//, '')
      const fullPath = join(pkgPath, defaultFile)
      const dts = findDtsSidecar(fullPath)
      if (!dts) {
        error(`${subpath}: no types field and no .d.{mts,ts,cts} sidecar for "${defaultFile}"`)
      }
    }
  }

  // CHECK 5: api-extractor config's main entry must exist
  for (const cfg of apiExtractorConfigs) {
    const rawEntry = cfg.mainEntryPointFilePath || ''
    const entryPath = resolveTemplate(rawEntry, unscopedName).replace(/<projectFolder>/g, pkgPath)
    if (entryPath && hasDist && entryPath !== '' && !existsSync(entryPath)) {
      error(`api-extractor "${cfg.dtsRollup?.untrimmedFilePath}": entry "${relative(pkgPath, entryPath)}" not found`)
    }
  }
}

console.log(`\n${errors + warnings} issues (${errors} errors, ${warnings} warnings)`)
process.exit(errors > 0 ? 1 : 0)
