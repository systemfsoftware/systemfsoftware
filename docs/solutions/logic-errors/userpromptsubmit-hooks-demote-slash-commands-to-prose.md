---
title: "UserPromptSubmit hook context demotes slash commands to prose"
date: 2026-07-29
category: logic-errors
module: omp/plugins/omp-claude-compat
problem_type: logic_error
component: tooling
symptoms:
  - "Slash commands silently become prose — `/compact` reaches the model as prefixed text and is never dispatched as a command"
  - "The demotion fires with zero UserPromptSubmit hooks configured, whenever a pending async-hook note is buffered"
  - "A one-shot async-hook note is consumed onto a command that never reaches a model, so the note is lost outright"
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - assistant
tags:
  - userpromptsubmit-hook
  - async-hook
  - slash-commands
  - omp-claude-compat
  - prompt-destination
---

# UserPromptSubmit hook context demotes slash commands to prose

## Problem

The `@systemfsoftware/omp-claude-compat` extension bridges Claude Code `UserPromptSubmit` hooks onto OMP, but OMP's `InputEventResult` has no `additionalContext` field. The bridge fakes that missing channel by prefixing the prompt text — and the vendored host dispatches slash, bash, python and yield-queue commands off the prompt's first characters before any model is involved, so the prefix demotes a command to prose and the user's slash command silently becomes model input.

## Symptoms

The concrete before/after was reproducible end to end:

- **Before (what the bridge injected):** `<one-shot async note>\n\n/compact`
- **After (what reached the model):** the user's `/compact` was silently rewritten to a plain prompt that started with `extra context\n\n/compact` and therefore no longer opened with `/`.

The same defect fired with **zero `UserPromptSubmit` hooks configured**: any pending async-hook output buffered in `drainAsyncHookOutput()` was unconditionally joined to the prompt, so a one-shot note from an earlier async hook could be appended onto a slash command even when no sync hook ran this turn. (`omp/plugins/omp-claude-compat/src/async-hook-output.state.ts:20-22` — the `pending.splice` drain)

Two observable variants followed from that single root:

1. **Slash / skill / bash / python / yield-queue**: every command form whose dispatch reads `event.text`'s opening characters demoted to prose.
2. **Collab-guest gate (`/`, `!`, `$`)**: a slash command on a guest session also stopped routing through the host-only path (`repos/oh-my-pi/packages/coding-agent/src/modes/controllers/input-controller.ts:707-714`), so it reached the model as ordinary text.

## What Didn't Work

The host dispatches on `event.text` positionally at six sites — `parseQueueShorthand` (`input-controller.ts:676`), `executeBuiltinSlashCommand` (`input-controller.ts:688`), the collab-guest `text.startsWith("/")` and `text.startsWith("!")` / `parsePythonCommandInput(text)` guards (`input-controller.ts:708` and `:713`), `isKnownSkillCommand` (`input-controller.ts:735`), the `!` / `!!` bash path (`input-controller.ts:747`), and `parsePythonCommandInput` (`input-controller.ts:766`). Each reads the opening characters of the text after `emitInput` chains the rewrite (`repos/oh-my-pi/packages/coding-agent/src/extensibility/extensions/runner.ts:925-928`). That ordering forecloses three of the obvious fakes.

(a) **Append after the prompt instead of prefixing.** `runner.ts:925-928` chains the rewrite as `currentText = result.text`, so a suffix would land as trailing text. Slash commands (`/compact <args>`) treat everything after the verb as arguments, so the trailing note would either be parsed as an argument to `/compact` or simply tacked onto the model's view of the prompt. Either way the hook context is rendered as part of the command's user-facing payload, not as auxiliary context.

(b) **Drop hook context on every command.** A `Host` verdict that _also_ drained `pending` would lose the one-shot async note — the note came from a hook that already finished, and nothing will regenerate it on the next prompt. The async buffer is precisely what survives across turns to carry the late note forward, and losing it on a command is the same defect with the trigger moved.

(c) **Re-hold this run's sync stdout into `pending` for a host verdict.** A `Host` verdict that pushed `stdouts` back into the async buffer would duplicate them on the next model-bound prompt, because the same hooks re-run on every prompt and produce that stdout fresh. The hook context is recoverable; only the async note is not. The fix therefore drains `pending` only on the `Model` branch and lets `stdouts` go to the floor entirely on the `Host` branch (`omp/plugins/omp-claude-compat/src/hook-dispatcher.executor.ts:519-523` for `pending`, `:580-584` for `deliver`).

## Solution

The shipped fix introduces a pure classification cell that picks a destination for the prompt, and routes the executor around it.

`omp/plugins/omp-claude-compat/src/prompt-destination.kernel.ts:19-32` declares the sigil list that mirrors the host's dispatch:

```ts
const HOST_COMMAND_PREFIXES: readonly string[] = [
  '/',
  '!',
  '->',
  '=>',
  '$ ',
  '$\t',
  '$\n',
  '$\r',
  '$$ ',
  '$$\t',
  '$$\n',
  '$$\r',
]
```

Each sigil is suffixed with a sentinel space (`' '`, `'\t'`, `'\n'`, `'\r'`), and the predicate at `prompt-destination.kernel.ts:34-35` tests against a sentinel-suffixed copy of the trimmed input:

```ts
export const isHostBound = (text: string): boolean =>
  HOST_COMMAND_PREFIXES.some((prefix) => `${text.trimStart()} `.startsWith(prefix))
```

The sentinel-space trick is what makes `$` and `$$` match as prefixes without also catching `$HOME` or `${expr}`. Bare `$` reaches the matcher as `"$ "` after the suffix; `$HOME` reaches it as `"$HOME "`, which doesn't startsWith `"$ "`. The host treats `$HOME` as prose (`input-controller.ts:765-766`'s comment spells this out: `Shell-style variables such as $HOME are normal prose unless a space follows the sigil`), so the sentinel matches the host's own gating exactly.

The executor branches on that predicate directly. It deliberately does **not** live in a `*.workflow.ts`: the prompt's opening characters already carry the host-versus-model distinction, so the function preserves an outcome the input held rather than originating one. Per the general theory's origin-versus-pass-through discriminator that is a translation, and a pure domain-blind predicate at those coordinates is a `.kernel.ts` cell — wearing `.workflow.ts` would be a lying name.

`omp/plugins/omp-claude-compat/src/hook-dispatcher.executor.ts:509-585` then branches on the predicate. The `pending` (async-hook note) is read for a model-bound prompt and left undrained for a host-bound one (`:516-523`):

```ts
const hostBound = isHostBound(event.text)
// Left undrained for a host-bound prompt: an async note is one-shot, so it
// has to survive this command and reach the next model-bound prompt.
const pending = Match.value(hostBound).pipe(
  Match.when(true, (): readonly string[] => []),
  Match.when(false, () => drainAsyncHookOutput()),
  Match.exhaustive,
)
```

The hooks still run. A blocking result (exit 2 or `decision: "block"`, parsed at `:539-553` via `interpretHookResult`) short-circuits with `{ handled: true }` regardless of destination, so a blocking hook still blocks a slash command.

The deliver step (`:564-584`) only prefixes a model-bound prompt; for a host-bound one the executor returns `undefined` so `emitInput` keeps the original prompt text untouched (`runner.ts:925-928` chains whatever the handler returns — `undefined` means no rewrite):

```ts
return Match.value(hostBound).pipe(
  Match.when(true, () => undefined),
  Match.when(false, deliver),
  Match.exhaustive,
)
```

`Match.exhaustive` is what closes the dispatch; a `Match.orElse` fallback here would defeat it.

## Why This Works

The root cause is positional: the host dispatches on the _opening characters_ of the prompt after `emitInput` chains handler rewrites (`runner.ts:925-928`, `InputEventResult` at `types.ts:965-972` carries only `handled` / `text` / `images`, with no `additionalContext` channel). A bridge that injects context by rewriting `text` therefore hands the host a payload it must re-parse from the front. The classification lets the bridge opt out of the rewrite on the prefix it knows the host will re-parse.

The sigil list is governed by an asymmetry that pins its scope:

- **Over-classifying** (calling something host-bound when it isn't) costs at most one turn of context latency — the next model-bound prompt receives the note.
- **Under-classifying** (calling something model-bound when it is actually a command) loses the command outright. The bridge has injected context onto prose the host never dispatches, and the slash command silently becomes a chat message.

That asymmetry is why the list is widened on doubt rather than narrowed, and it is also why a single sigil — `/`, the most common one — is enough to lose `/compact`. The classifier needs to be conservative.

`parsePythonCommandInput` (`input-controller.ts:113-123`) is the host's own gate and explicitly gates on the same trailing-whitespace rule (`input-controller.ts:765-766`'s comment is the spec); mirroring it in `HOST_COMMAND_PREFIXES` keeps the bridge's notion of "command" identical to the host's.

## Prevention

Concrete and checkable guards:

- **General rule for any bridge faking a missing channel by rewriting a payload.** Before the rewrite, ask whether the consumer parses the payload positionally. `InputEventResult.text` is consumed by `emitInput`'s chain (`runner.ts:925-928`) and then dispatched on its first characters (`input-controller.ts:676, :688, :708, :713, :735, :747, :766`); appending is not a safe alternative (see (a) above). A bridge that fakes a missing field by rewriting must classify the payload's destination before rewriting — and on the wrong destination, return `undefined` so the chain leaves the original alone.
- **Keep `HOST_COMMAND_PREFIXES` in sync with the vendored host's dispatch order.** Any new command form added to `input-controller.ts`'s dispatch sequence (`676, 688, 708, 713, 735, 747, 766`) must be added to the sigil list in `prompt-destination.kernel.ts:19-32` in the same change. The vendored tree is in `repos/` and read-only, so the bridge is the only side that moves.
- **Two repo lint rules shaped the fix.**
  - `@systemfsoftware/oxlint-plugin/no-direct-tag-access` (`packages/oxlint-config/src/oxlint-config.base.ts:41`) forces `Match.tag` over `._tag === 'Host'` — the executor's `Match.value(destination).pipe(Match.tag('Host', ...), Match.tag('Model', ...), Match.exhaustive)` pattern (`hook-dispatcher.executor.ts:519-523, :580-584`) is a direct consequence.
- **A pure classifier is not automatically a workflow.** The first version of this cell was a `*.workflow.ts` returning a `Host | Model` tagged union whose variants both carried zero fields, which made the union isomorphic to a boolean and the "decision" a predicate in costume. The general theory's two-cell split rules that pure behavior carrying no domain decision wearing `.workflow.ts` is a **lying name**, correctable to `.kernel.ts` (vocabulary-free, domain-blind) or `.observer.ts` (operational vocabulary). Note the error channel is _not_ the discriminator — the theory states `Error` MAY be `never` and total decisions like `Allow | Block` are first-class; what disqualified this file was origin, not failability.
- **`Match.orElse` is not a substitute for a closed union.** The first version of this cell dispatched with `Match.when(opensWithSigil, …)` + `Match.orElse(…)` over the raw prompt string — a ternary in `Match` costume, with no exhaustiveness guarantee. `@systemfsoftware/oxlint-plugin-effect-workflow/workflow-match-exhaustive` did not catch it, because both of its report branches were gated on a `Match.tag` arm being present and a predicate dispatch has none. The rule now flags `Match.orElse` as the fallback of any predicate or literal dispatch over an open type; the sole survivor is an `orElse` preceded by an object-literal record arm. Cross from an open type into a closed one with a total constructor (`Option.fromNullable`, `Option.liftPredicate`), then `Match.tag` + `Match.exhaustive`.

Merge state as of this run: pending. The fix is uncommitted; no SHAs are recorded here.

## Related Issues

- [`docs/solutions/architecture-patterns/workflow-error-channel-gates.md`](../architecture-patterns/workflow-error-channel-gates.md) — same plugin and same `.workflow.ts` cell type; shares the workflow error-channel gates and the `pbt-naming` prevention rule. Moderate overlap (referenced files, prevention rules); distinct problem and root cause.
- No related GitHub issues (`gh issue list` over hook / UserPromptSubmit / slash-command / omp-claude-compat returned zero rows).
