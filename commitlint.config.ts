import { execFileSync } from 'node:child_process'

import pnpmScopes from '@commitlint/config-pnpm-scopes'
import type { UserConfig } from '@commitlint/types'
import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(fileURLToPath(import.meta.url))
const packagesDir = join(repoRoot, 'packages')

/**
 * Derive intermediate group scopes (e.g. `stryker-js`) for directories that
 * contain workspace packages but are not packages themselves. Preserves the
 * scopes used by historical commits in this repo.
 */
const discoverGroupScopes = (dir: string): readonly string[] => {
  const groups: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const groupPath = join(dir, entry.name)
    const hasPackageJson = (() => {
      try {
        return readdirSync(groupPath).includes('package.json')
      } catch {
        return false
      }
    })()
    if (hasPackageJson) continue // it's a leaf package, not a group

    const hasNestedPackage = readdirSync(groupPath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .some((e) => {
        try {
          return readdirSync(join(groupPath, e.name)).includes('package.json')
        } catch {
          return false
        }
      })

    if (hasNestedPackage) {
      groups.push(relative(packagesDir, groupPath))
    }
  }
  return groups
}

const EXTRA_SCOPES = ['repo', 'deps', 'release', 'ci', ...discoverGroupScopes(packagesDir)] as const

const matchesAny = (...patterns: readonly RegExp[]) => (path: string) => patterns.some((p) => p.test(path))

const isDoc = matchesAny(
  /\.mdx?$/,
  /^docs\//,
  /(^|\/)README\.md$/i,
  /(^|\/)AGENTS\.md$/i,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)CHANGELOG\.md$/i,
)

const isTest = matchesAny(
  /\.(test|spec|tst)\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /(^|\/)__tests__\//,
  /(^|\/)__mocks__\//,
  /(^|\/)tests\//,
  /(^|\/)test-helpers\//,
  /(^|\/)e2e\//,
  /(^|\/)fixtures\//,
)

const isCI = matchesAny(
  /^\.github\/workflows\//,
  /^\.github\/actions\//,
  /^\.github\/dependabot\.ya?ml$/,
)

const isLockfile = matchesAny(
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)bun\.lockb?$/,
  /(^|\/)yarn\.lock$/,
)

const isTooling = matchesAny(
  /^\.claude\//,
  /^\.husky\//,
  /^\.opencode\//,
  /(^|\/)commitlint\.config\.[mc]?[jt]s$/,
  /(^|\/)\.releaserc(\..+)?$/,
  /(^|\/)\.lintstagedrc(\..+)?$/,
  /(^|\/)tsconfig.*\.json$/,
  /(^|\/)vitest\.config\.[mc]?[jt]s$/,
  /(^|\/)stryker\.conf(ig)?\.[mc]?[jt]s$/,
  /(^|\/)stryker(\..+)?\.json$/,
  /(^|\/)\.editorconfig$/,
  /(^|\/)\.gitignore$/,
  /(^|\/)\.prettierrc(\..+)?$/,
  /(^|\/)biome\.json$/,
  /(^|\/)oxlint\.config\.[mc]?[jt]s$/,
  /(^|\/)\.dprint\.jsonc?$/,
  /(^|\/)package\.json$/,
  /(^|\/)pnpm-workspace\.yaml$/,
  /(^|\/)turbo\.json$/,
  /(^|\/)\.npmrc$/,
)

const ALLOWED_BY_SHAPE: readonly {
  readonly name: string
  readonly match: (path: string) => boolean
  readonly allowed: Readonly<Record<string, true>>
}[] = [
  { name: 'docs', match: isDoc, allowed: { docs: true, chore: true, ai: true } },
  { name: 'test', match: isTest, allowed: { test: true, chore: true } },
  { name: 'CI', match: isCI, allowed: { ci: true, chore: true } },
  { name: 'lockfile', match: isLockfile, allowed: { deps: true, chore: true } },
  {
    name: 'tooling',
    match: isTooling,
    allowed: { chore: true, build: true, ci: true, deps: true, ai: true, security: true },
  },
]

const stagedFiles = (): readonly string[] => {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * SOTA monorepo scope discovery:
 * Use @commitlint/config-pnpm-scopes to derive scopes from pnpm-workspace.yaml,
 * then append repo-wide meta scopes. This automatically handles nested workspace
 * members like packages/stryker-js/* without hand-rolled recursion.
 */
const scopeEnum = async (context: Record<string, unknown>) => {
  const base = (await pnpmScopes.rules['scope-enum'](context)) as [number, 'always' | 'never', readonly string[]]
  return [
    base[0],
    base[1],
    [...base[2], ...EXTRA_SCOPES],
  ] as [number, 'always' | 'never', readonly string[]]
}

const configuration: UserConfig = {
  extends: ['@commitlint/config-conventional', '@commitlint/config-pnpm-scopes'],

  plugins: [
    {
      rules: {
        'no-ai-coauthors': ({ raw }) => {
          if (!raw) {
            return [true, 'OK']
          }

          // AI co-author email patterns
          const aiEmailPatterns = [
            /noreply@anthropic\.com/i,
            /cursoragent@cursor\.com/i,
            /noreply@aider\.dev/i,
            /cascade@windsurf\.com/i,
            /noreply@codeium\.com/i,
            /clio-agent@sisyphuslabs\.ai/i,
            /factory-droid\[bot\]@users\.noreply\.github\.com/i,
          ] as const

          // Only scan Co-authored-by lines for AI model mentions to avoid false positives
          // (e.g., "Opus" audio codec, "Haiku" build tool)
          const coauthorLines = raw.match(/^Co-?-?[Aa]uthored-by:.*$/gmi) || []
          const aiModelPatterns = [
            /\b(Claude\s+)?(Opus|Sonnet|Haiku)\b/i,
            /\bgpt-4o\b/i,
            /\bClaude\b.*\b3\.\d+\b/i,
          ] as const
          const hasAIModelInCoauthor = coauthorLines.some((line: string) =>
            aiModelPatterns.some((pattern) => pattern.test(line))
          )

          const hasAIEmail = aiEmailPatterns.some((pattern) => pattern.test(raw))
          const hasAICoauthor = hasAIEmail || hasAIModelInCoauthor

          return [
            !hasAICoauthor,
            hasAICoauthor
              ? 'AI co-authors and AI model references are not allowed in commit messages'
              : 'OK',
          ]
        },

        'type-matches-diff-shape': ({ type }) => {
          const files = stagedFiles()
          if (files.length === 0 || !type) return [true, 'OK']

          const allMatch = (m: (p: string) => boolean) => files.every(m)

          for (const shape of ALLOWED_BY_SHAPE) {
            if (allMatch(shape.match) && !shape.allowed[type]) {
              const allowed = Object.keys(shape.allowed).sort().join(' / ')
              return [false, `'${type}' with 100% ${shape.name} paths — REQUIRED type: ${allowed}`]
            }
          }

          if (type === 'feat' || type === 'fix') {
            const hasProductionSource = files.some(
              (p) => !isDoc(p) && !isTest(p) && !isCI(p) && !isLockfile(p) && !isTooling(p),
            )
            if (!hasProductionSource) {
              return [
                false,
                `'${type}' MUST touch >=1 production source file (none of: docs, test, CI, lockfile, tooling)`,
              ]
            }
          }

          return [true, 'OK']
        },
      },
    },
  ],

  rules: {
    // AI co-author prevention (enforced)
    'no-ai-coauthors': [2, 'always'],
    'type-matches-diff-shape': [2, 'always'],

    // Commit types — aligned with semantic-release changelog filtering
    // feat/fix/perf/api/revert/improvement/deps/security bump a version; the rest are noise-filtered out of the changelog
    'type-enum': [
      2,
      'always',
      [
        'ai',
        'api',
        'build',
        'chore',
        'ci',
        'deps',
        'docs',
        'feat',
        'fix',
        'improvement',
        'perf',
        'refactor',
        'revert',
        'security',
        'style',
        'test',
      ],
    ],

    // Scopes — auto-discovered from pnpm-workspace.yaml plus repo-wide meta scopes
    'scope-enum': scopeEnum as unknown as [number, 'always' | 'never', readonly string[]],
    'scope-case': [2, 'always', 'kebab-case'],

    // Type constraints
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // Subject — case disabled (agents capitalize; cosmetic, no release impact)
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],

    // Disabled — length / blank-line cosmetics that burn tokens on retries; semantic-release ignores them
    'header-max-length': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'body-leading-blank': [0],
    'footer-leading-blank': [0],

    // Structural constraints (kept — low friction, prevent trailing-period noise)
    'header-full-stop': [2, 'never', '.'],
    'body-full-stop': [2, 'never', '.'],

    // References encouraged but not required (warning, non-blocking)
    'references-empty': [1, 'never'],
  },

  defaultIgnores: true,
  ignores: [(commit) => commit.startsWith("Squashed '") || commit.includes('git-subtree-dir:')],
  formatter: '@commitlint/format',
}

// LLM ONE-SHOT TEMPLATE:
// feat: add user session management
// api: change authentication endpoint response format
//
// body with full details here
//
// BREAKING CHANGE: description if applicable
// Use api!:` for API contract breaking changes that aren't features or fixes

export default configuration
