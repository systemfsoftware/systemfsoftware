---
title: A story's visual evidence comes from the runner's capture hook, never from page.screenshot in a story or a CI collection script
applies_when:
  - adding screenshots or other visual evidence to stories
  - adding or changing a CI step that collects, renames or uploads UI evidence
  - an AI agent writes `page.screenshot` in a story, play function, step handler or Vitest browser test
  - a pull request commits images under a screenshot or attachments folder
tags: [storybook, screenshots, visual-evidence, vitest, ci, artifacts]
---

A story's evidence image comes from one capture hook that the Storybook Vitest project runs after every story, and a failure's image comes from Vitest. CI uploads both folders as they are. A capture written into each story records whatever the step reached, under a name the story chose, and a CI script that hunts for those files and renames them is a second, untested path that decides what evidence exists. Storybook core ships no screenshot API, and its own visual testing (Chromatic) needs a cloud account and a project token, so the capture belongs to the test runner.

1. **One hook, registered.** A setup file's `afterEach` captures every story, through a capture library such as `@storycap-testrun/browser` (`screenshot(page, context)`). The Storybook Vitest project lists that file in `test.setupFiles`. The addon never finds a setup file on its own: it prepends its internal setup files to the ones the project declares (`@storybook/addon-vitest` 10.6.0 `dist/vitest-plugin/index.js:2635-2639`). A setup file that calls `setProjectAnnotations` composes the a11y annotations too (`real-browser-axe-as-error.md` item 4).
2. **Failures through Vitest.** `browser.screenshotFailures` stays on (default `!browser.ui`). Vitest writes failure images to `<attachmentsDir>/failure-screenshots/<test file>/<test>.png` (`@vitest/browser` 5.0.1 `tester` bundle), not to the screenshot folder.
3. **No capture in a story.** No story, play function, step handler or Vitest browser test calls `page.screenshot`, directly or through a helper. The hook captures after the play function ends, so a state worth an image is its own story, the way `journeys-are-embedded-gherkin.md` gives each journey one When.
4. **Run output, never committed.** The hook's output folder (default `__screenshots__`) and Vitest's attachments folder (default `.vitest/`) are both in the repository's ignore list, and no image is committed. A reference screenshot recorded from the component's own render is the subject's output, which `boundary-testing/expected-values-never-come-from-the-subjects-output.md` already refuses.
5. **CI uploads the folders.** One `actions/upload-artifact` step uploads both folders with `if: ${{ !cancelled() }}`, so a failing run keeps its evidence. No step re-captures, copies, renames or post-processes images, and no step sends stories to a cloud visual-testing service.

Playwright journeys against a running app are outside this rule: their `page` is the server-side Playwright object, which Vitest documents as a different object from its browser `page`.

```tsx
// WRONG (a product repo, 2026-10-12): each story step captures its own image, and a CI
// script later collects whatever files the steps wrote.
import { page } from 'vitest/browser'

export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await page.screenshot({ path: `evidence/${Date.now()}-submitted.png` })
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}

// RIGHT (the shape of an unnamed reference app): one hook captures every story.
// .storybook/vitest.setup.ts
import * as a11yAnnotations from '@storybook/addon-a11y/preview'
import { setProjectAnnotations } from '@storybook/react-vite'
import { screenshot } from '@storycap-testrun/browser'
import { afterEach } from 'vitest'
import { page } from 'vitest/browser'
import * as projectAnnotations from './preview.ts'

setProjectAnnotations([a11yAnnotations, projectAnnotations])

afterEach(async (context) => {
  await screenshot(page, context)
})

// vitest.config.ts, the Storybook project
//   test: { setupFiles: ['./.storybook/vitest.setup.ts'], browser: { enabled: true, screenshotFailures: true } }
// .gitignore
//   __screenshots__/
//   .vitest/
// CI, after the test step
//   - if: ${{ !cancelled() }}
//     uses: actions/upload-artifact@v7
//     with: { name: story-evidence, path: "__screenshots__/\n.vitest/", if-no-files-found: ignore }

// The story asserts only what a person sees.
export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}
```

Grounds: `@storycap-testrun/browser` README (https://github.com/reg-viz/storycap-testrun/blob/main/packages/browser/README.md); Vitest, `browser.screenshotFailures` (https://vitest.dev/config/browser/screenshotfailures) and the browser context API, whose `page` "is not the same object" as Playwright's (https://vitest.dev/api/browser/context); Storybook 10.6, Vitest addon (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) and Visual tests (https://storybook.js.org/docs/writing-tests/visual-testing); GitHub Actions status-check functions (https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions).

Gate: `review` — Does the diff call `page.screenshot` in a story, play function, step handler or Vitest browser test, directly or through a helper? Does it add a capture hook in a setup file that no Storybook Vitest project lists in `test.setupFiles`, or without ignore entries for the hook's output folder and `.vitest/`? Does it commit an image under either folder? Does a CI step do more with UI evidence than one `actions/upload-artifact` of those folders that also runs on failure?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-properties` for `page.screenshot` on `**/*.stories.ts` and `**/*.stories.tsx`, each message naming `storybook-testing/visual-evidence-comes-from-the-runner`. Review covers what that lint misses: a renamed `page`, a capture helper, Vitest browser tests, the setup-file registration, ignore entries and CI steps.
