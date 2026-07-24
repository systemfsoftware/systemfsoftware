import { analyzeCommits as baseAnalyzeCommits } from '@semantic-release/commit-analyzer'
import { generateNotes as baseGenerateNotes } from '@semantic-release/release-notes-generator'
import { execFileSync } from 'node:child_process'
import { relative } from 'node:path'

const repoRoot = () =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim()

const filesInCommit = (hash, root) =>
  execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', hash, '--', '.', ':!repos'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.startsWith('repos/'))

const repoScope = /^[a-z]+\(repo\):/i

const commitsForPackage = (context) => {
  const root = repoRoot()
  const packagePath = `${relative(root, context.cwd)}/`
  return context.commits.filter((commit) => {
    // 1. Direct file match — current behavior
    if (filesInCommit(commit.hash, root).some((file) => file.startsWith(packagePath))) return true
    // 2. Repo-wide scope — release for all packages
    if (repoScope.test(commit.subject)) return true
    return false
  })
}

export const analyzeCommits = (pluginConfig, context) =>
  baseAnalyzeCommits(pluginConfig.analyzer ?? {}, { ...context, commits: commitsForPackage(context) })

export const generateNotes = (pluginConfig, context) =>
  baseGenerateNotes(pluginConfig.notes ?? {}, { ...context, commits: commitsForPackage(context) })
