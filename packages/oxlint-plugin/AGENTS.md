# @systemfsoftware/oxlint-plugin

Custom Oxlint plugins for architectural invariants, Effect-TS idioms, and test discipline.

## Standing Rules

Every rule authored across plugins in this directory must comply with the diagnostic contract.

### OP-D1: The Four-Part Diagnostic Standard

Oxlint operates in agent loops using `--format=agent`, which formats findings as a single line:
`<file>:<line>:<col>: error <plugin>(<rule>): <message>`

To maximize agent repair convergence and prevent hallucinated workarounds, every diagnostic message MUST follow the four-part single-line template:

```typescript
export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
```

Or for presence/absence checks:

```typescript
export const ABSENCE_MESSAGE =
  '{{name}} is untested. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
```

### Diagnostic Quality Rubric

| Segment        | Invariant                                                                    | Example                                                                                                        |
| -------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `{{name}}`     | Unambiguous description of the construct violated                            | `a *.integration.test.ts feature with no environment double`                                                   |
| `{{expected}}` | The required AST or semantic contract                                        | `a Feature builder chained with .withLayer(layer) or .withScenarioLayer(layer)`                                |
| `{{actual}}`   | Exactly what the AST visitor observed (grounds the agent)                    | `a Feature(...) call without .withLayer or .withScenarioLayer`                                                 |
| `{{fix}}`      | Constructive guidance with literal syntax, code tokens, or default factories | `Chain .withLayer(Layer.empty) if in-memory, or provide the boundary Layer (e.g. .withLayer(MyService.Live)).` |

### Banned Formats

- **Multiline formats (e.g. TOON, YAML, multi-line blocks):** Banned. Breaks single-line `--format=agent` parsing across terminal and CI watchers.
- **Negative-only messages:** Banned. Messages stating only that something is forbidden without providing the concrete syntactic replacement in `Fix:` cause LLMs to oscillate or attempt rule suppression.
