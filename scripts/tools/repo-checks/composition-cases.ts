#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
// The evidence the composition gates send the judge, for every candidate unit of a workspace, as JSON lines. It is
// how calibration cases are made and refreshed: `composition-cases.ts <root>` prints, for a real repository checkout,
// the same evidence the checks produce (the same functions), and a case is that evidence plus a label.
import { loadWorkspace } from './composition-facts.ts'
import { judgedAsLibrary } from './composition-facts.ts'
import type { JudgedRule } from './composition-judge.ts'
import {
  coChanged,
  commitsTouching,
  coreAdapterEvidence,
  entriesEvidence,
  granularityEvidence,
  testOnlyCandidates,
} from './composition.ts'

export interface Candidate {
  readonly rule: JudgedRule
  readonly id: string
  readonly evidence: unknown
}

export const candidateCases = async (root: string): Promise<readonly Candidate[]> => {
  const ws = await loadWorkspace(root)
  const libraries = ws.units.filter(judgedAsLibrary)
  const out: Candidate[] = []
  for (const unit of libraries) {
    out.push({ rule: 'entries-are-roles', id: `entries-are-roles:${unit.name}`, evidence: entriesEvidence(unit) })
    const core = coreAdapterEvidence(ws, unit)
    if (core !== undefined) {
      out.push({ rule: 'core-adapter-split', id: `core-adapter-split:${unit.name}`, evidence: core })
    }
  }
  let coChanges: ReturnType<typeof coChanged> = []
  try {
    coChanges = libraries.length > 1 ? coChanged(await commitsTouching(ws, libraries)) : []
  } catch { /* a shallow checkout has no history: no co-change evidence */ }
  for (const unit of libraries) {
    out.push({
      rule: 'granularity',
      id: `granularity:${unit.name}`,
      evidence: granularityEvidence(ws, unit, coChanges),
    })
  }
  for (const c of testOnlyCandidates(ws)) {
    const e = c.evidence as { package: string; entryKey: string }
    out.push({ rule: 'test-only-exports', id: `test-only-exports:${e.package}:${e.entryKey}`, evidence: c.evidence })
  }
  return out
}

if (import.meta.main) {
  for (const c of await candidateCases(Deno.args[0] ?? Deno.cwd())) console.log(JSON.stringify(c))
}
