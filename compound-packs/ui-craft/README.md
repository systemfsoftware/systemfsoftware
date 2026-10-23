# UI Craft Compound Pack

How a user-facing screen is designed and built by an agent so that a design-literate person would share a screenshot of it: a written brief, four directions before code, reference images before the build, a screenshot-and-score loop, an independent judge before merge, and a re-check on production. The pack governs a change that adds or redesigns a page, a screen or a UI surface a person looks at (a landing page, an app shell, a signed-in screen). It does not govern component state or I/O (`ui-state`) or how stories prove behaviour (`storybook-testing`).

The pipeline, in order. Each step names the rule that owns it.

| Step | Output | Rule |
| ---- | ------ | ---- |
| 1 Brief | one `BRIEF.md` with the founder's verdict, purpose, copy source, references, bans and the evidence matrix | `ui-work-starts-from-a-brief` |
| 2 Directions | four different Magic Patterns directions, one chosen and why | `four-directions-then-reference-images` |
| 3 Reference images | one generated image per section of the chosen direction | `four-directions-then-reference-images` |
| 4 Build | Codex `gpt-6-astra` at `xhigh`, loading only the skills the step names | `each-step-loads-its-curated-skills` |
| 5 Self-check | screenshots on the matrix, a harsh score, fixes, repeat until the score is 8 or more | `the-build-loop-scores-from-screenshots` |
| 6 Judge | an independent design judge scores the same screenshots against the rubric | `an-independent-judge-gates-the-merge` |
| 7 Production | the merged build re-captured on production and re-judged | `production-is-rechecked-after-deploy` |

Rules:

- `ui-work-starts-from-a-brief`: the brief template, its required sections and what a section may not leave empty.
- `four-directions-then-reference-images`: four genuinely different directions, then a reference image per section, before any implementation code.
- `each-step-loads-its-curated-skills`: the skills each step loads by name, the ones it must not, and why the list is short.
- `the-build-loop-scores-from-screenshots`: the evidence matrix (390, 768, 1440, light and dark, reduced motion), the facts a capture records and the loop to a score of 8.
- `an-independent-judge-gates-the-merge`: the judge, its rubric, what it may and may not decide, and what its verdict does to the merge.
- `claims-are-true-on-production`: every claim and every number on a screen is true today, and copy comes from real users' words.
- `the-judge-is-calibrated-on-pass-and-fail-cases`: the labelled cases a judge must agree with before its verdict gates anything.
- `production-is-rechecked-after-deploy`: the production capture and the signed-in walk that close the unit.

Evidence base: the YOU-331 landing redesign (`systemfsoftware/younna-ai` #672, merged 2026-10-23), which scored 8.2 on its own loop and was approved by the founder, against the signed-in product screens of the same day, which an outside reviewer scored 1 to 3. The landing run loaded six skills and none of the 177 MengTo skills the workstation then linked to Codex. The references the pipeline draws on: Magic Patterns (`inspiration`, design system and uploaded references), irys.xyz (a scroll-driven page used as a motion and craft reference), Claude.ai (the agent conversation as a product surface: collapsed streaming thinking, compact tool-call rows) and nythrox/Stead (a card slot the agent writes against, rendered natively), the last two as cited prior art only.

How a gate decides. A rule is gated by facts or by a calibrated judge, never by a pattern over source text. Facts come from real tools (a browser's computed layout, `scrollWidth`, the accessibility tree and axe, the console, the file system) and are code. A judgement about what a person sees goes to a vision-capable judge whose evidence-first answer cites those facts and the screenshot regions it relied on, then returns `holds`, `violated` or `uncertain` with a confidence; `uncertain` never merges and never fails, it goes to a person. A typed decision model such as Jev answers only what its state shows, and a screenshot is not state, so Jev is not the visual judge. Jev may decide over the typed facts and the judge's verdicts (for example, route a unit to merge, rework or a person), with thresholds swept on labelled outcomes.

No tool enforces these rules yet: the facts a gate names are what an implementation must read, and until one exists each gate is `review` by a person or by the independent judge of `an-independent-judge-gates-the-merge`.
