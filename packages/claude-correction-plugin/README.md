# claude-correction-plugin

A Claude Code plugin with two `UserPromptSubmit` hooks. Both read the prompt you just
submitted and, when it reads a certain way, print an instruction the agent sees before it
starts its turn. Neither ever blocks a prompt.

| Hook                 | Fires when                                                 | Tells the agent to                                                                        |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `correction-capture` | your prompt corrects the agent's previous work             | extract the durable rule, persist it to memory, _then_ apply the fix                      |
| `frustration-guard`  | your prompt reads as frustration or a competence challenge | stop, re-read your last few messages, name the mistake, and prove it saved the correction |

Silence is the default. No match, no output, exit 0 — and that includes unreadable input:
a truncated or non-JSON payload leaves the turn running rather than failing it.

## How the frustration score works

Each pattern category carries a weight, and the hook fires at a total of 2.

- **Weight 2 — sentence-level intent.** Scope drift, competence challenge, dismissal,
  premise challenge, rejection, repetition, direct insult. One match is enough.
- **Weight 1 — a word that is often innocent.** Mild profanity, sarcasm, exasperation.
  One alone is not enough; two of them, or one plus a shouted ALL-CAPS word, is.

Quoted spans are stripped before any of that runs — fenced blocks, inline code, single and
double quotes, and `<--` annotations. Pasting an angry line as an example does not trip it.

## Install

```bash
pnpm --filter @systemfsoftware/claude-correction-plugin build
claude --plugin-dir packages/claude-correction-plugin
```

`build` is required: the hooks run from `dist/`, and the plugin directory is self-contained
once built, so it can be copied anywhere Claude Code can reach.

## Develop

```bash
pnpm --filter @systemfsoftware/claude-correction-plugin test       # behaviour specs
pnpm --filter @systemfsoftware/claude-correction-plugin typecheck
pnpm --filter @systemfsoftware/claude-correction-plugin lint
```

Behaviour lives in two Gherkin feature suites under `__tests__/`, each driving one hook
end to end over an in-memory terminal. To exercise a built hook directly:

```bash
echo '{"hook_event_name":"UserPromptSubmit","prompt":"your code is wrong, fix it"}' \
  | node packages/claude-correction-plugin/dist/correction-capture.js
```
