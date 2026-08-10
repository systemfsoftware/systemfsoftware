import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
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

/**
 * Discover publishable workspace packages via pnpm, respecting pnpm-workspace.yaml.
 * Filters out private packages — the root package.json is private and excluded naturally.
 */
function discoverPackagesFromPnpm() {
  const output = execSync('pnpm ls -r --json --depth=-1', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  const packages = JSON.parse(output)
  return packages
    .filter((pkg) => !pkg.private)
    .map((pkg) => ({
      // Strip npm scope so tags and commitlint scopes stay consistent
      name: pkg.name.replace(/^@[^/]+\//, ''),
      cwd: pkg.path,
    }))
}

const publishablePackages = discoverPackagesFromPnpm()

const pluginsFor = () => [
  [filterPlugin, {
    analyzer: { preset: 'conventionalcommits', releaseRules },
    notes: { preset: 'conventionalcommits', presetConfig },
  }],
  ['@semantic-release/exec', {
    prepareCmd: 'pnpm version ${nextRelease.version} --no-git-tag-version --allow-same-version',
    publishCmd: 'pnpm publish --no-git-checks --access public',
  }],
  ['@semantic-release/github', { successComment: false, failComment: false }],
]

let failed = 0
for (const { name, cwd } of publishablePackages) {
  try {
    const result = await semanticRelease({
      branches: ['main'],
      tagFormat: `${name}@v\${version}`,
      dryRun,
      plugins: pluginsFor(),
    }, { cwd })
    const line = result === false ? 'no release' : `${result.nextRelease.type} -> ${result.nextRelease.version}`
    console.log(`[${name}] ${line}`)
  } catch (error) {
    failed += 1
    console.error(`[${name}] failed:`, error?.message ?? error)
  }
}

process.exit(failed > 0 ? 1 : 0)
