---
title: A story imports no test fixtures, and the browser-command module is imported only from the Storybook Vitest setup file
applies_when:
  - writing or changing a story, a story step or a Storybook decorator
  - a story needs data and an agent reaches for a file under `tests/__fixtures__`
  - an agent imports `vitest/browser` in a story, a step or a preview file
tags: [storybook, fixtures, vitest-browser, stories, module-graph]
---

A story is a UI integration test that gets its state from the fakes it builds (`fresh-fakes-per-story`), not from files that exist for other tests. A fixture under `tests/__fixtures__` is data written for another suite's assertions; a story that imports it ties the story to that suite's layout and to values it did not choose. The founder's verdict on 2026-10-21 was "it shouldnt be importing test fixtures". The browser-command module (`vitest/browser`) belongs to the Vitest runner, and one file owns it so the runner's capabilities are reached from a single place.

## Rule

No story module, step module or preview module imports a path under `tests/__fixtures__`, and `vitest/browser` is imported only by `.storybook/vitest.setup.ts`.

- **Data comes from the fake.** State for a story is set through the fake's configurable responses or the story's own literal data. A value both a story and another suite need is a typed export of its own module that both import.
- **One file bridges the browser.** Anything a story needs from the browser runner is exposed by `.storybook/vitest.setup.ts`, which is the only importer of `vitest/browser`. A story reaches it through the capture hook the runner runs (`visual-evidence-comes-from-the-runner`) and never imports the module itself.

Evidence. The module graph answers both halves: the resolved import specifiers of every story, step and preview module either include a path under `tests/__fixtures__` or they do not, and the importers of `vitest/browser` are either exactly `.storybook/vitest.setup.ts` or they are not.

Gate: `fact` — Does the TypeScript module graph show that no story, step or preview module resolves a path under `tests/__fixtures__`, and that `vitest/browser` is resolved only from `.storybook/vitest.setup.ts`? Until that check exists, `review` — Does the diff add an import of either to a story, a step or a preview file?
