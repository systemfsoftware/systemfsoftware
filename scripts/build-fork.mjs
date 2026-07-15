#!/usr/bin/env node
import { cpSync, rmSync, readFileSync, existsSync, readdirSync as readDir } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const pkgDir = resolve(rootDir, 'packages', 'stryker-js', 'core')
const distDir = resolve(pkgDir, 'dist')

// Find @stryker-mutator/core from the .pnpm store
const pnpmDir = resolve(rootDir, 'node_modules', '.pnpm')
const coreDirs = readDir(pnpmDir).filter(e => e.startsWith('@stryker-mutator+core@9.6.1') && !e.includes('patch_hash'))
if (coreDirs.length === 0) { console.error('Core not found in .pnpm'); process.exit(1) }
const npmCoreDir = resolve(pnpmDir, coreDirs[0], 'node_modules', '@stryker-mutator', 'core')
console.log('npm core dir:', npmCoreDir)

// Copy entire npm dist (including bin) into our dist
if (existsSync(distDir)) rmSync(distDir, { recursive: true })
cpSync(npmCoreDir + '/dist', distDir, { recursive: true })
cpSync(npmCoreDir + '/bin', pkgDir + '/bin', { recursive: true, force: true })
console.log('Copied npm @stryker-mutator/core dist')

// Compile our TS helpers + preprocessor with bun
const sandboxDir = resolve(pkgDir, 'src', 'sandbox')
const outDir = resolve(distDir, 'src', 'sandbox')
execSync(
  `bun build ${sandboxDir}/parse-config-helper.ts ${sandboxDir}/resolve-reference-helper.ts ${sandboxDir}/ts-config-preprocessor.ts --outdir ${outDir} --target node --format esm --external "@stryker-mutator/*" --external "typed-inject" --external "rxjs" --external "path" --external "fs" --external "url" --external "os" --external "child_process" --external "events" --external "util" --external "stream"`,
  { stdio: 'inherit' }
)
console.log('Compiled patched preprocessor with bun')

// Verify
const preprocessor = readFileSync(outDir + '/ts-config-preprocessor.js', 'utf8')
if (preprocessor.includes('import(') && preprocessor.includes('typescript')) {
  console.error('ERROR: Preprocessor still has import("typescript") — patch failed')
  process.exit(1)
}
if (!preprocessor.includes('parse-config-helper')) {
  console.error('ERROR: Preprocessor does not import parse-config-helper — wrong file')
  process.exit(1)
}
console.log('Build complete — fork ready')
