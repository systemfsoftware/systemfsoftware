#!/usr/bin/env -S deno run --allow-env --allow-read
// PreToolUse hook contract: exit 0 allows the write, exit 2 refuses it and the
// stderr text reaches the agent. Neither code is inferable from the source.
// Enforces behaviour only and reads no doctrine file, so REPO-S6 and
// check:script-provenance stay satisfied.

import { isAbsolute, relative } from '@std/path/posix'
import { toText } from '@std/streams'

export interface WritePayload {
  readonly tool_input?: {
    readonly file_path?: string
    readonly path?: string
    readonly content?: string
    readonly new_string?: string
    readonly edits?: ReadonlyArray<{ readonly new_string?: string }>
  }
  readonly session_id?: string
}

export interface Facts {
  readonly root: string
}

export type Verdict =
  | { readonly refused: false }
  | { readonly refused: true; readonly reason: string }

const ALLOWED: Verdict = { refused: false }

export const relativeTarget = (target: string, root: string): string | null => {
  if (!isAbsolute(target)) return target
  const rel = relative(root, target)
  // `..` means the target escapes the project; an absolute path elsewhere on the
  // machine is not this guard's business either way.
  return rel === '' || rel.startsWith('..') ? null : rel
}

export const addedText = (payload: WritePayload): string =>
  [
    payload.tool_input?.content,
    payload.tool_input?.new_string,
    ...(payload.tool_input?.edits ?? []).map((edit) => edit.new_string),
  ]
    .filter((piece): piece is string => typeof piece === 'string')
    .join('\n')

export const decide = (payload: WritePayload, facts: Facts): Verdict => {
  const target = payload.tool_input?.file_path ?? payload.tool_input?.path
  if (target === undefined || target === '') return ALLOWED

  const rel = relativeTarget(target, facts.root)
  if (rel === null) return ALLOWED

  const added = addedText(payload)

  if (rel.startsWith('repos/')) {
    return {
      refused: true,
      reason: 'repos/ is a vendored subtree and is read-only — amend upstream, not the vendored copy (REPO-S3).',
    }
  }

  if (/(^|\/)tsconfig[^/]*\.json$/.test(rel) && /"isolatedDeclarations"\s*:\s*true/.test(added)) {
    return {
      refused: true,
      reason: 'isolatedDeclarations breaks idiomatic Effect across this workspace — leave it disabled (REPO-S1).',
    }
  }

  if (rel === 'pnpm-workspace.yaml' && added.includes('minimumReleaseAgeExclude')) {
    return {
      refused: true,
      reason:
        'minimumReleaseAgeExclude is the supply-chain cutoff — pin the dependency tighter or wait for it (REPO-S2).',
    }
  }

  return ALLOWED
}

if (import.meta.main) {
  const raw = await toText(Deno.stdin.readable)
  let payload: WritePayload
  try {
    payload = JSON.parse(raw) as WritePayload
  } catch {
    // An unparseable payload must not brick every write; the guard declines to rule.
    Deno.exit(0)
  }

  const root = Deno.env.get('CLAUDE_PROJECT_DIR') ?? Deno.cwd()

  const verdict = decide(payload, { root })

  if (verdict.refused) {
    console.error(verdict.reason)
    Deno.exit(2)
  }
  Deno.exit(0)
}
