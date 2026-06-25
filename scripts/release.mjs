import { readdirSync, readFileSync } from 'node:fs'
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

const publishablePackages = readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => JSON.parse(readFileSync(join(repoRoot, 'packages', name, 'package.json'), 'utf8')).private !== true)

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
for (const name of publishablePackages) {
  const cwd = join(repoRoot, 'packages', name)
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
