#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env

import { SCHEMA_BARE_PRIMITIVE_BASELINE } from '../../packages/oxlint-plugin/oxlint-config/src/schema-rule-baseline.ts'

const RULE_ID = '@systemfsoftware/oxlint-plugin-effect-dmmf/schema-bare-primitive-field'
const RULE_CODE = '@systemfsoftware/effect-dmmf(schema-bare-primitive-field)'

const SCRATCH_CONFIG = '.lint-baseline.oxlint.json'

interface OxlintDiagnostic {
  readonly code?: string
  readonly filename?: string
}

const verdicts = async (): Promise<{ stale: string[]; missing: string[] }> => {
  const missing: string[] = []
  const present: string[] = []
  for (const file of SCHEMA_BARE_PRIMITIVE_BASELINE) {
    try {
      await Deno.stat(file)
      present.push(file)
    } catch {
      missing.push(file)
    }
  }

  await Deno.writeTextFile(
    SCRATCH_CONFIG,
    JSON.stringify({
      jsPlugins: ['./packages/oxlint-plugin/oxlint-plugin-effect-dmmf/dist/index.mjs'],
      rules: { [RULE_ID]: 'error' },
    }),
  )
  const counts = new Map<string, number>()
  try {
    const { stdout } = await new Deno.Command('node_modules/.bin/oxlint', {
      args: ['--config', SCRATCH_CONFIG, '--format=json', ...present],
      stdout: 'piped',
      stderr: 'piped',
    }).output()
    const parsed = JSON.parse(new TextDecoder().decode(stdout)) as { diagnostics?: OxlintDiagnostic[] }
    for (const diagnostic of parsed.diagnostics ?? []) {
      if (diagnostic.code !== RULE_CODE || diagnostic.filename === undefined) continue
      const key = diagnostic.filename.replace(/^\.\//, '')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  } finally {
    await Deno.remove(SCRATCH_CONFIG).catch(() => {})
  }

  return { stale: present.filter((file) => !counts.has(file)), missing }
}

const { stale, missing } = await verdicts()

if (stale.length === 0 && missing.length === 0) {
  console.log(`lint-baseline: ${SCHEMA_BARE_PRIMITIVE_BASELINE.length} baselined sites still violate ${RULE_ID}`)
  Deno.exit(0)
}

for (const file of stale) {
  console.error(`lint-baseline STALE: ${file} no longer violates ${RULE_ID} — remove its baseline entry`)
}
for (const file of missing) {
  console.error(`lint-baseline MISSING: ${file} no longer exists — remove its baseline entry`)
}
Deno.exit(1)
