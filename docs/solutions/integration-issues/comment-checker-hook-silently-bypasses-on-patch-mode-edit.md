---
title: "Content-scanning PostToolUse hooks silently pass on patch-mode edits"
date: 2026-07-29
category: integration-issues
module: omp-utils
problem_type: integration_issue
component: tooling
symptoms:
  - "The comment-checker PostToolUse hook fires on every Write call but never on an Edit that uses hashline or apply-patch mode"
  - "Hooks reading new_string or old_string receive no content on patch-mode edits, while blocking correctly on a Write carrying identical text"
  - "Every edit result carries an empty-tailed warning reading \"Hook exited 0 but produced invalid JSON:\" on plugin versions predating classifyExitZero"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - assistant
tags:
  - posttooluse-hook
  - tool-input-acl
  - patch-mode-edit
  - omp-utils
  - plugin-versioning
---

# Content-scanning PostToolUse hooks silently pass on patch-mode edits

## Problem

A content-scanning PostToolUse hook silently passed on every OMP patch-mode edit while correctly firing on `Write`, so a guard the repo believed was enforcing was enforcing nothing on the most common edit path — and the env-level noise from a stale plugin occupied the slot where the silent skip would otherwise have surfaced as a question.

## Symptoms

The asymmetry was the headline: the `comment-checker` hook — registered in `.claude/settings.json` as a `command`-type `PostToolUse` entry, matcher `Write|Edit|Update|MultiEdit|morph_mcp_edit-file|morph_edit` at line 17 and the command itself at line 21 — fired on every `write` tool call and never on an `edit` tool call.

Every `edit` tool result carried a trailing line:

```
Hook exited 0 but produced invalid JSON:
```

— `raw: ''` (empty stdout after the colon). The visible tail was empty because the warning string printed the raw failure reason and the reason was literally the empty string.

`comment-checker` itself never produced its own output during these calls — the binary's actual stderr lines, confirmed in `/home/ryan/go/bin/comment-checker`:

- `[check-comments] Skipping: No content to check`
- `[check-comments] Success: No problematic comments/docstrings found`

A successful scan and a skipped scan were indistinguishable from the outside — both exited 0 with empty stdout. The `Success:` line is emitted to stderr, and a `Skipping:` line is also stderr, so neither surfaces in the JSON the dispatcher parses.

The silent pass is the dangerous half. A guard that decides "nothing to check, allow" looks identical to a guard that decided "checked and clean, allow". From the operator's perspective, the hook ran and said yes.

## What Didn't Work

The investigation followed five false trails, in the order they fell.

1. **"The matcher is wrong."** Reading `.claude/settings.json` showed the matcher already included `Edit`. The matcher was not the issue.

2. **"The tool-name mapping is wrong."** Proved by reading `omp/packages/omp-utils/src/tool-name.acl.ts:36-42`: `normalizeToolName('edit')` falls into the explicit alias table at line 26 (`edit: 'Edit'`) and returns `'Edit'` — exactly the PascalCase name the Claude Code matcher consumes. The mapping is correct.

3. **"The repo's build output is what OMP loads."** Wrong on the same axis — OMP loads plugins from `~/.omp/plugins/node_modules/`, pinned by `~/.omp/plugins/omp-plugins.lock.json`. The freshly-built output under `omp/plugins/omp-claude-compat/dist` was not the loaded code; only the npm-installed tarball was. The repro path here: rebuild locally, re-run, see no change — the change is not in the loaded module.

4. **"`omp plugin upgrade` keeps plugins current."** It reported "All marketplace plugins are up to date" while `@systemfsoftware/omp-claude-compat` sat two minors behind. The upgrade path covers marketplace plugins, not npm-installed packages. The plugin was at 1.2.0 in `~/.omp/plugins/node_modules/` while `latest` on npm was 1.4.0. The real ground-truth command is `omp plugin list`; `omp plugin upgrade` is not authoritative for npm plugins. The lock file at `~/.omp/plugins/omp-plugins.lock.json` is what shows the actual pinned version.

5. **"`comment-checker` reads the file from disk."** Proved by direct probes: a payload of only `file_path` against a comment-rich file still exited 0 with the `Skipping: No content to check` line. The hook inspects `tool_input.content` (Write) or `tool_input.new_string` (Edit) and nothing else. Adding `file_path` to the payload would not have helped even if the dispatcher forwarded it unmodified.

The order matters: (1)–(3) are environmental — they make you look at the wrong copy of the code. (4) is the _enabler_ — without it the stale plugin would have been found quickly. (5) is the structural blind spot that the env-level noise at (4) was hiding.

## Solution

Two independent defects; both fixed.

### Repo fix — recover edit content from patch-mode payloads

`omp/packages/omp-utils/src/tool-input.acl.ts:35-38`:

```ts
const patchLines = (input: string, sigil: string): string | undefined => {
  const marked = input.split('\n').filter((line) => line.startsWith(sigil))
  return marked.length === 0 ? undefined : marked.map((line) => line.slice(sigil.length)).join('\n')
}
```

Each marked line is sliced by exactly one sigil's width — that is what turns the patch grammar's `++ item` (an added line whose own first character is `+`) into the inserted `+ item` rather than `item`. The string-joining and the `undefined` return on an empty marked set keep the helper small and total.

`omp/packages/omp-utils/src/tool-input.acl.ts:60-68`:

```ts
if (EDIT_TOOLS[toolName] === true && typeof out['input'] === 'string' && !('new_string' in out)) {
  const added = patchLines(out['input'], '+')
  const removed = patchLines(out['input'], '-')
  out = {
    ...out,
    ...(added === undefined ? {} : { new_string: added }),
    ...(removed === undefined ? {} : { old_string: removed }),
  }
}
```

The keys are only added when the patch actually carries marked lines (`added === undefined && removed === undefined` → empty spread, no fabricated fields). A hashline pure deletion (`DEL N`, which carries no `+` or `-` body rows) therefore yields _no_ `old_string` and _no_ `new_string` key — both are absent rather than present-and-empty, which is what the test at `omp/packages/omp-utils/__tests__/normalize.integration.test.ts:116` asserts. The distinction matters: an absent key tells the consumer there is nothing to check, whereas an empty string is a claim that the user wrote nothing. The `!('new_string' in out)` guard prevents clobbering if a caller has already injected content upstream.

Five integration tests at `omp/packages/omp-utils/__tests__/normalize.integration.test.ts:91-126` cover: an `Edit` whose patch text carries only `+`-lines (line 91), an `Edit` with both sigils that splits correctly into `old_string` and `new_string` (line 101), the `++` sigil-slice edge case (line 111), a pure-deletion patch that adds no content keys (line 116), and a `Write` tool carrying `input:` text untouched (line 123).

### Environment fix — pin what is actually loaded

```bash
omp plugin list                                     # ground truth: real loaded versions
omp plugin install @systemfsoftware/omp-claude-compat@1.4.0
```

The lock file at `~/.omp/plugins/omp-plugins.lock.json` is the source of truth for what is loaded; `omp plugin upgrade` does not update it for npm-installed packages. After the install the lock file shows `"version": "1.4.0"` for `@systemfsoftware/omp-claude-compat`, and the previously-attached `Hook exited 0 but produced invalid JSON:` warning no longer appears.

The discipline that turns a blind upgrade into a checked one: before installing, verify the target build contains the fix. The published tarball ships only build output (`files: ["dist"]` in `omp/plugins/omp-claude-compat/package.json`), so the check is done against the bundled chunks, not against source — `npm pack @systemfsoftware/omp-claude-compat@1.4.0`, unpack, then grep `dist/*.js` for the new symbols (`ExitNoDecision`, and the exit-zero guard emitted as ``startsWith(`{`)``). Their presence is what makes the upgrade deliberate. The corresponding source lives at `omp/plugins/omp-claude-compat/src/hook-verdict.workflow.ts`, where `classifyExitZero` routes exit-0 with non-JSON stdout to `ExitNoDecision → Allow` instead of a forced parse.

The pre-1.3.0 shape is not visible from this tree and cannot be verified here; it was read directly off the published 1.2.0 bundle during this investigation (`npm pack @systemfsoftware/omp-claude-compat@1.2.0`, then reading the minified verdict function in the unpacked tarball's build output). That build carried only three exit kinds — `ExitBlock`, `ExitParse`, `ExitOther` — and routed every exit-0 straight into a JSON parse of stdout with no guard, which is what produced the `raw: ''` warning on `comment-checker`'s empty-stdout clean runs. Reproduce it the same way if the claim ever needs re-checking; the current tree will not show it.

## Why This Works

The root cause is a translation layer that was _partially_ complete.

`omp/packages/omp-utils/src/edit-target.acl.ts:96-105` — `editTargetPaths` — already recovered file _paths_ from the same patch text, both the hashline grammar (`HASHLINE_TAG = /#[0-9a-fA-F]{4}$/u`, line 12; `APPLY_PATCH_FILE`, `APPLY_PATCH_MOVE`, `HASHLINE_MOVE`, lines 13-15) and the apply-patch grammar. So when a patch-mode edit landed, `file_path` was populated from the patch header, and `tool_input` arrived looking well-formed at the path level.

`tool-input.acl.ts` recovered `content`/`new_string` for the _replace_ path (`path` → `file_path`, line 42-45; `edits[]` → synthesized `old_string`/`new_string`, line 47-58) but had no branch for `input: string`. So the path consumers saw a complete payload and the content consumers saw an empty payload. The result: hooks that read only `file_path` (open-file-then-scan, path-based allow/deny) worked; hooks that read `content`/`new_string` (comment checkers, secret scanners, lint guards) silently passed.

A translation that translates _nothing_ fails loudly — every consumer sees the raw foreign shape and reports a missing field. A translation that translates _some_ fields is more dangerous: the payload looks plausible to any consumer that only checks the fields it cares about, and every consumer that _does_ care sees an honest-looking payload with the field they need missing. The plausible-but-broken payload is what hides the defect.

The two defects compounded exactly because of this. The stale plugin (1.2.0) attached a `Hook exited 0 but produced invalid JSON:` warning to every edit result. That warning occupied the slot where a sharp operator would normally notice "the hook says nothing — is that because everything is fine, or because the hook skipped?" The warning made the empty payload _visible_ without making it _questionable_ — it looked like an unrelated parse failure, not a missing-field problem. Once the warning was silenced by upgrading the plugin, the empty payload was exposed as itself an answer to a question nobody was asking.

## Prevention

Concrete, checkable, and grounded in the structure that broke here.

(a) **A hook that can _skip_ must be distinguishable from a hook that _passed_.** Treat a guard's skip path as a failure mode and assert on it. `comment-checker`'s skip and success both produce exit-0 with empty JSON-parsable stdout; a downstream test that only asserts "exit 0" cannot tell them apart. The shape the dispatcher needs is one that returns a verdict JSON with a status field on every code path — that is what 1.3.0+ `classifyExitZero` gives it.

(b) **When translating a payload between two systems, enumerate every field the consumer actually reads — not just the ones the producer happens to send.** `content` and `new_string` are what content-scanning hooks read; `file_path` alone is insufficient because the hook never re-reads the file. Any new edit-mode grammar (or any new content-scanning hook) needs the translation layer to enumerate the read-side fields first, then check whether the producer's shape carries them.

(c) **Keep `tool-input.acl.ts` and `edit-target.acl.ts` in step.** Both files parse the same patch text (`HASHLINE_TAG` at `edit-target.acl.ts:12`, the `+/-` sigil at `tool-input.acl.ts:35-37`). A new edit mode that adds a path grammar to one must add the content grammar to the other. They are a paired ACL: one half alone is the failure mode here.

(d) **Pin what is actually loaded.** `omp plugin list` is the source of truth. `omp plugin upgrade` does not cover npm-installed plugins. The lock file at `~/.omp/plugins/omp-plugins.lock.json` is the only authoritative record of what the next session will run against.

(e) **Verify a target build contains the fix before installing it.** Inspect the published tarball's source for the new symbol (`classifyExitZero`, `ExitNoDecision`) before issuing `omp plugin install`. A blind upgrade on the assumption that "latest" includes the fix will reproduce the original symptom if it does not — and the warning is what surfaces that, not the empty payload.

(f) **Never upgrade a plugin in place while a session has it loaded.** Confirmed the hard way during this very investigation: `omp plugin install ...@1.4.0` replaced the content-hashed chunk files under `~/.omp/plugins/node_modules/@systemfsoftware/omp-claude-compat/dist/`, but the running process still held 1.2.0's `index.js` in memory. That cached module then could not resolve `./hook-dispatcher.executor-eSEEzqYS.js`, a name only 1.2.0 used. Because the failure happened inside the extension's `tool_call` handler, it aborted _every_ tool call — not just the plugin's own feature — so bash, eval, subagent dispatch, and even read/write all died until the session restarted. Install the upgrade, then restart before relying on it; the on-disk state is correct immediately, the in-memory graph is not. The blast radius here is the general lesson: an extension that throws in a broad lifecycle handler takes down the whole harness, so its handler needs to fail closed around its own concern rather than propagate.

## Related Issues

- [`docs/solutions/logic-errors/userpromptsubmit-hooks-demote-slash-commands-to-prose.md`](../logic-errors/userpromptsubmit-hooks-demote-slash-commands-to-prose.md) — same plugin family and hook subsystem, found in the same session. Distinct problem, root cause, and fix; overlap scored **Low** (3/5 dimensions, none of them problem/root-cause/solution). Read together for the full picture of the Claude Code ↔ OMP hook bridge.
- [`docs/solutions/architecture-patterns/workflow-error-channel-gates.md`](../architecture-patterns/workflow-error-channel-gates.md) — same plugin, shares the `Match.tag` / `S.TaggedError` cell gates referenced above.
- No related GitHub issues (`gh issue list` over hook / PostToolUse / omp-utils / plugin version returned zero rows).
