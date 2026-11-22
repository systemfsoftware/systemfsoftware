---
title: Presentation is a pure formatter in a plain module that the write phase calls on the decided outcome, never part of a decision
applies_when:
  - a workflow's decision carries text, lines, colours, padding or another display form of its result
  - a decide body or a schema operation pluralises, pads, colours, wraps or joins text for a reader
  - a write phase needs a branch to choose how an outcome is shown
  - a schema operation or workflow imports a module that is not a schema or workflow file
tags: [presentation, decision, sandwich, write-phase, formatter, decision-code]
---

A decision is the domain outcome: which variant, carrying which domain data (counts, scores, ids, paths). How that outcome reads on a terminal, in an annotation or in a log is presentation. A pure formatter in a plain module (`render-clear-text-report.ts`, `format-annotations.ts`) owns it, and the cell's write phase calls it with the encoded decision. The formatter returns text only: the write phase's handler record has already chosen the exit code and the I/O by the outcome's `_tag`, so the text cannot steer behaviour. A formatter may branch freely; the write phase stays straight-line.

Never put presentation in decision code. Decision code is every `*.workflow.ts` and `*.schema.ts` file. It is the scope that mutation testing scores. It imports only decision code, `effect`, `effect-cell-types`, type-only imports, another workspace package's schemas used as schemas (never its functions), and owner-reviewed proved kernels; never a plain module. A decision variant never carries display text, and a decide body or schema operation never builds it.

When a write phase needs a branch, ask what the branch chooses. If it chooses a domain outcome, it is a decision variant. If it chooses only how a decided outcome looks, it goes in the formatter.

```typescript
// WRONG: the decision is lines of text; 690 lines of formatting sit in decision code
class ReportRendered extends S.TaggedClass<ReportRendered>()('ReportRendered', { stdout: S.Array(S.String) }) {}
// RIGHT: the decision is the outcome; write hands it to a formatter
class ReportSummarized
  extends S.TaggedClass<ReportSummarized>()('ReportSummarized', { metrics: Metrics, survivors: S.Array(Survivor) })
{}
// write: { ReportSummarized: (summary) => Console.log(renderClearTextReport(summary)), Suppressed: () => Effect.void }
```
