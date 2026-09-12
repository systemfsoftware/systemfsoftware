export type EnforcementLevel = 'error' | 'warn' | 'info'

export interface Rule {
  readonly name: string
  readonly title: string
  readonly level: EnforcementLevel
  readonly body: string
}

export class RuleParseError extends Error {
  constructor(
    readonly source: string,
    readonly reason: string,
  ) {
    super(`cannot parse pattern ${source}: ${reason}`)
  }
}

export class DuplicateRuleError extends Error {
  constructor(readonly names: readonly string[]) {
    super(`duplicate pattern names (the engine shadows duplicates silently): ${names.join(', ')}`)
  }
}

const FENCED_GRIT_BODY = /```grit\r?\n([\s\S]*?)```/

/** Parses an engine markdown pattern file: name, title, level, and grit-fenced body. */
const isEnforcementLevel = (value: string | undefined): value is EnforcementLevel =>
  value === 'error' || value === 'warn' || value === 'info'

export const parsePatternMarkdown = (markdown: string, source: string): Rule => {
  const name = source.replace(/\.(md|grit)$/u, '').replace(/[^a-zA-Z0-9_]/g, '_')
  const body = FENCED_GRIT_BODY.exec(markdown)?.[1]
  if (body === undefined) throw new RuleParseError(source, 'no ```grit fenced body found')
  const title = /^#\s+(.+)$/mu.exec(markdown)?.[1]
  if (title === undefined) throw new RuleParseError(source, 'no `# Title` heading found')
  const level = /^level:\s*(error|warn|info)\s*$/mu.exec(markdown)?.[1]
  return {
    name,
    title,
    level: isEnforcementLevel(level) ? level : 'error',
    body: body.replace(/\s+$/u, ''),
  }
}

/** Consumer rules are namespaced so they can never silently shadow a bundled rule. */
export const namespaceConsumerRule = (rule: Rule): Rule => ({
  ...rule,
  name: `consumer_${rule.name.replace(/^consumer_/u, '')}`,
})

const yamlQuote = (value: string): string => `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`

const yamlBody = (body: string): string =>
  body
    .split('\n')
    .map((line) => `        ${line}`)
    .join('\n')

/**
 * Renders the composed `grit.yaml` with inline pattern bodies — the engine's
 * documented primary config form. The engine loads it via CWD discovery (the
 * `--grit-dir` flag is unreliable in the pinned engine), so the caller writes
 * this to `<workspace>/.grit/grit.yaml` and spawns the engine with that cwd.
 * Fails loud on duplicate names: the engine shadows them silently.
 */
export const composeGritYaml = (rules: readonly Rule[]): string => {
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const rule of rules) {
    if (seen.has(rule.name)) duplicates.push(rule.name)
    seen.add(rule.name)
  }
  if (duplicates.length > 0) throw new DuplicateRuleError([...new Set(duplicates)])

  const entries = rules
    .map(
      (rule) =>
        `  - name: ${rule.name}
    title: ${yamlQuote(rule.title)}
    level: ${rule.level}
    body: |
${yamlBody(rule.body)}`,
    )
    .join('\n')
  return `version: 0.0.2\npatterns:\n${entries}\n`
}
