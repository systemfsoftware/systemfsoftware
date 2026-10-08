import type { UserConfig } from '@commitlint/types'

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
      },
    },
  ],

  rules: {
    // AI co-author prevention (enforced)
    'no-ai-coauthors': [2, 'always'],

    // Commit types — tidy log/PR grouping only (releases run on changesets, not commit messages)
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

    // Subject — must exist; everything else about it is cosmetic
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [0],

    // Scope — zero release impact and agents can't guess it. OFF; nudge casing
    'scope-enum': [0],
    'scope-case': [1, 'always', 'kebab-case'],

    // Disabled — length cosmetics that burn tokens on retries; no downstream impact
    'header-max-length': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],

    // Punctuation — zero impact. OFF (this is the reported pain)
    'header-full-stop': [0],
    'body-full-stop': [0],

    // Readability nudges — warn, never block
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],

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
