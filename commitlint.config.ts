import { execFileSync } from 'node:child_process'

import type { UserConfig } from '@commitlint/types'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packagesDir = join(dirname(fileURLToPath(import.meta.url)), 'packages')
const packageScopes = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
const allowedScopes = [...packageScopes, 'repo', 'deps', 'release', 'ci']

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

const ALLOWED_BY_SHAPE: ReadonlyArray<{
  readonly name: string
  readonly match: (path: string) => boolean
  readonly allowed: ReadonlySet<string>
}> = [
  { name: 'docs', match: isDoc, allowed: new Set(['docs', 'chore', 'ai']) },
  { name: 'test', match: isTest, allowed: new Set(['test', 'chore']) },
  { name: 'CI', match: isCI, allowed: new Set(['ci', 'chore']) },
  { name: 'lockfile', match: isLockfile, allowed: new Set(['deps', 'chore']) },
  {
    name: 'tooling',
    match: isTooling,
    allowed: new Set(['chore', 'build', 'ci', 'deps', 'ai', 'security']),
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

const configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],

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
            if (allMatch(shape.match) && !shape.allowed.has(type)) {
              const allowed = [...shape.allowed].sort().join(' / ')
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
    // feat, fix, perf, api, revert appear in changelog; everything else is noise-filtered
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

    // Type constraints
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    'scope-enum': [2, 'always', allowedScopes],
    'scope-case': [2, 'always', 'kebab-case'],

    // Subject constraints
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],

    // Length constraints
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 120],
    'footer-max-line-length': [2, 'always', 100],

    // Structural constraints
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'header-full-stop': [2, 'never', '.'],
    'body-full-stop': [2, 'never', '.'],

    // References encouraged but not required
    'references-empty': [1, 'never'],
  },

  defaultIgnores: true,
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
