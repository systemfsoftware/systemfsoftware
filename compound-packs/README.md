# Compound Packs

A Compound Pack ingests domain knowledge into the steps of Compound Engineering at runtime. Each pack in this folder is a set of prescriptive rules that `ce-brainstorm` and `ce-plan` ground requirements and plans in, and that `ce-code-review` and `ce-doc-review` flag work against. Every constraint a pack shapes is cited as `(pack: <id>, <path within the pack>)`, so a reader can trace it to its file. A rule's text is evidence that those steps quote, not an enforcement contract: no rule here asks for a new test, gate, check or CI job.

Packs are declared in `.compound-engineering/config.yaml` and are never scanned. Other repositories declare packs from this folder by git source, `ref` and `path: compound-packs`.

## Rule shape

A rule is a top-level `.md` file in a pack folder with frontmatter:

```markdown
---
title: A one-line statement of the rule
applies_when:
  - adding a page that needs server data
  - adding or changing an API endpoint consumed by the app's own pages
tags: [inertia, routes, props]
---

Always/never prose a planner or reviewer can quote.
```

- `title` and `applies_when` are required; a file without them is skipped. `tags` helps matching.
- `applies_when` is matched semantically, so write situations in the words a task would use, one per line, not topic labels.
- The body is short, prescriptive always/never prose, with at most a short WRONG/RIGHT example. Incident narratives, history and evidence stay out of it; subfolders are storage the resolver never reads, and git history holds the rest.
- Keep rules in one pack disjoint. Where two rules share a fix, merge them; a carve-out belongs in the broader rule's text too.
- Configuration (a config value, an environment or Doppler variable, a workflow's shape, a version pin, an allowlist) gets no rule that demands a test, check or gate for it (testing pack: `configuration-gets-no-test-and-no-gate.md`).

A pack's `README.md` describes the pack. The resolver ignores it.

## Packs

| Pack                  | Holds                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `cell-architecture`   | File kinds, adapters, layers, handles, scopes and cell composition for `effect-cell-types` |
| `schema-modelling`    | Effect Schema invariants, states, foreign wire shapes and generated laws                   |
| `configuration`       | How settings are declared, redacted and reach code                                         |
| `package-surface`     | What a package exports, and the bump a surface change takes                                |
| `testing`             | Behaviour tests, fakes, adapters, mutants, and that configuration gets no test             |
| `integration-testing` | Where an integration test's IO runs                                                        |
| `e2e-testing`         | Where end-to-end tests live                                                                |
| `property-testing`    | What makes a property a real property                                                      |
| `ui-state`            | Atoms, commands and derivations in React code                                              |
| `ui-testing`          | Storybook journeys, stand-ins and queries                                                  |
| `design-system`       | Building and styling UI with Astryx                                                        |
| `screen-content`      | What screens show and say                                                                  |
| `ci-workflows`        | What a CI check is for                                                                     |
| `public-repository`   | What a public repository never publishes                                                   |
