import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import semanticRelease from 'semantic-release'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const filterPlugin = join(repoRoot, 'scripts', 'release-monorepo-filter.mjs')

const releaseRules = [
  { type: 'feat', release: 'minor' },
  { type: 'api', release: 'minor' },
  { type: 'fix', release: 'patch' },
  { type: 'perf', release: 'patch' },
  { type: 'improvement', release: 'patch' },
  { type: 'deps', release: 'patch' },
  { type: 'security', release: 'patch' },
  { type: 'revert', release: 'patch' },
  { type: 'chore', release: false },
  { type: 'docs', release: false },
  { type: 'refactor', release: false },
  { type: 'test', release: false },
  { type: 'style', release: false },
  { type: 'ci', release: false },
  { type: 'build', release: false },
  { type: 'ai', release: false },
]

const presetConfig = {
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'api', section: 'API Changes' },
    { type: 'fix', section: 'Bug Fixes' },
    { type: 'perf', section: 'Performance Improvements' },
    { type: 'improvement', section: 'Improvements' },
    { type: 'deps', section: 'Dependencies' },
    { type: 'security', section: 'Security' },
    { type: 'revert', section: 'Reverts' },
    { type: 'chore', hidden: true },
    { type: 'docs', hidden: true },
    { type: 'refactor', hidden: true },
    { type: 'test', hidden: true },
    { type: 'style', hidden: true },
    { type: 'ci', hidden: true },
    { type: 'build', hidden: true },
    { type: 'ai', hidden: true },
  ],
}

const packagesRoot = join(repoRoot, 'packages')

/**
 * Recursively discover publishable packages under `packages/`.
 * Returns the repo-relative path and the unscoped package name for each.
 */
function discoverPackages(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const packages = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const packagePath = join(dir, entry.name)
    const manifestPath = join(packagePath, 'package.json')

    const manifestExists = (() => {
      try {
        return readdirSync(packagePath).includes('package.json')
      } catch {
        return false
      }
    })()

    if (!manifestExists) {
      // No package.json here — keep descending.
      packages.push(...discoverPackages(packagePath))
      continue
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.private === true) continue
    if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
      throw new Error(
        `Publishable package at ${relative(packagesRoot, packagePath)} is missing a valid "name" field`,
      )
    }

    packages.push({
      path: relative(packagesRoot, packagePath),
      // Strip npm scope so tags and commitlint scopes stay consistent
      name: manifest.name.replace(/^@[^/]+\//, ''),
    })
  }

  return packages
}

const publishablePackages = discoverPackages(packagesRoot)

const pluginsFor = () => [
  [filterPlugin, {
    analyzer: { preset: 'conventionalcommits', releaseRules },
    notes: { preset: 'conventionalcommits', presetConfig },
  }],
  ['@semantic-release/exec', {
    prepareCmd: 'pnpm version ${nextRelease.version} --no-git-tag-version --allow-same-version',
    publishCmd: 'pnpm publish --no-git-checks --access public',
  }],
  ['@semantic-release/git', {
    assets: ['package.json'],
    message: 'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}',
  }],
  ['@semantic-release/github', { successComment: false, failComment: false }],
]

let failed = 0
for (const { path: packagePath, name: packageName } of publishablePackages) {
  const cwd = join(packagesRoot, packagePath)
  try {
    const result = await semanticRelease({
      branches: ['main'],
      tagFormat: `${packageName}@v\${version}`,
      dryRun,
      plugins: pluginsFor(),
    }, { cwd })
    const line = result === false ? 'no release' : `${result.nextRelease.type} -> ${result.nextRelease.version}`
    console.log(`[${packageName}] ${line}`)
  } catch (error) {
    failed += 1
    console.error(`[${packageName}] failed:`, error?.message ?? error)
  }
}

process.exit(failed > 0 ? 1 : 0)
