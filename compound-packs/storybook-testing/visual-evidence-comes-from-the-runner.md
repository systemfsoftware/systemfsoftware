---
title: A story's visual evidence comes from the runner's capture hook, never from page.screenshot in a story or a CI collection script
applies_when:
  - adding screenshots or other visual evidence to stories
  - adding or changing a CI step that collects, summarises or uploads story evidence
  - an AI agent writes `page.screenshot` in a story, play function, step handler or a helper they call
  - a pull request commits images under a story capture folder (`__screenshots__/`) or Vitest's attachments folder (`.vitest/`)
tags: [storybook, screenshots, visual-evidence, vitest, ci, artifacts]
---

A story's evidence image comes from one capture hook the test runner runs for every story, and a failure's image comes from Vitest. CI uploads both folders as they are. A capture written into each story records whatever the step reached, under a name the story chose, and a CI step that hunts for those files and summarises them is a second, untested path that decides what evidence exists. Stories already run as Vitest tests, and the runner can capture each one, so the capture belongs to the runner rather than to each story.

1. **One hook, run by the runner for every story.** Each story is captured once, after its test finishes, by one hook registered for every story; no story, play function or step handler registers a capture of its own. The hook captures through a capture library such as `@storycap-testrun/browser` (`screenshot(page, context)`, with its `storycap(...)` Vitest plugin from `@storycap-testrun/browser/vitest-plugin` in the project's `plugins`). Where the test runner admits it, a Vitest setup file's `afterEach` is that hook, as in the reference app. Where it does not, as `@systemfsoftware/vitest` refuses `afterEach`, the Storybook preview's project `beforeEach` registers `onTestFinished` instead, guarded to test mode with the runner modules imported inside the guard so the Storybook UI never loads them (RIGHT below). That works because the Vitest addon runs each composed story inside its Vitest test (Storybook `v10.6.0`, `code/addons/vitest/src/vitest-plugin/test-utils.ts:101-132`), the preview `beforeEach` runs before every story (`code/core/src/csf/story.ts:395-402`), and `onTestFinished` must be called within a test and runs when it finishes, pass or fail (Vitest `v5.0.1`, `packages/vitest/src/runtime/runner/hooks.ts:257-294`).
2. **The preview reaches the runner.** The addon applies the project's preview annotations itself unless a setup file in the Storybook config directory contains `setProjectAnnotations` (`code/addons/vitest/src/vitest-plugin/index.ts:334-343`, `utils.ts:41-51`). Such a file passes the project's own preview annotations, or the preview's `beforeEach` never runs and a hook it registers captures nothing (`real-browser-axe-as-error.md` item 4 composes them the same way).
3. **Failures through Vitest.** The Storybook Vitest project sets `browser.screenshotFailures: true` explicitly: the addon sets it to `false` whenever the project has a `test.browser` config and leaves the flag unset (Storybook `v10.6.0`, `code/addons/vitest/src/vitest-plugin/index.ts:418-425`), which overrides Vitest's own default. Vitest writes failure images to `<attachmentsDir>/failure-screenshots/<test file>/<test>.png` (Vitest `v5.0.1`, `packages/browser/src/client/tester/runner.ts:187-204`), not to the screenshot folder.
4. **No capture in a story.** No story, play function, step handler or helper they call runs `page.screenshot`. The hook captures after the story's test finishes, so a state worth an image is its own story, the way `journeys-are-embedded-gherkin.md` gives each journey one When.
5. **Run output, never committed.** The hook's output folder (default `__screenshots__`) and Vitest's attachments folder (default `.vitest/attachments`, ignored as `.vitest/`), where item 3's failure images land, are both in the repository's ignore list, and no story evidence image is committed. A reference screenshot recorded from the component's own render is the subject's output, which `boundary-testing/expected-values-never-come-from-the-subjects-output.md` already refuses.
6. **CI uploads the folders as they are.** CI uploads both folders, at the paths the run writes them. No step re-captures story images, decides which of them exist, or writes its own summary of them. Failure images exist only for failing runs, so an upload that skips failing runs carries none of item 3's evidence.

Playwright journeys against a running app are outside this rule: their `page` is the server-side Playwright object, which Vitest documents as a different object from its browser `page`.

```tsx
// WRONG (a product repo, 2026-10-11): each story step captures its own image, and a CI
// script later collects whatever files the steps wrote.
import { page } from 'vitest/browser'

export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await page.screenshot({ path: `evidence/${Date.now()}-submitted.png` })
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}

// RIGHT (an unnamed reference app's capture, registered through the preview because
// @systemfsoftware/vitest refuses afterEach): one capture runs for every story.
// .storybook/preview.ts
const captureEachStory = async (): Promise<void> => {
  if (import.meta.env.MODE !== 'test') return
  const [{ onTestFinished }, { page }, { screenshot }] = await Promise.all([
    import('@systemfsoftware/vitest'),
    import('vitest/browser'),
    import('@storycap-testrun/browser'),
  ])
  onTestFinished(async (context) => {
    await screenshot(page, context)
  })
}

export default { beforeEach: captureEachStory }

// vitest.config.ts, the Storybook project
//   plugins: [storybookTest({ configDir: '.storybook' }), storycap({ viewport: { width: 1280, height: 720 } })],
//   test: { browser: { enabled: true, screenshotFailures: true } }
// .gitignore
//   __screenshots__/
//   .vitest/
// CI, after the test step, which runs from apps/web
//   - if: ${{ !cancelled() }}
//     uses: actions/upload-artifact@v7
//     with: { name: story-evidence, path: "apps/web/__screenshots__/\napps/web/.vitest/" }

// The story asserts only what a person sees.
export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}
```

Grounds: the operator's ruling (2026-10-12) that Storybook already produces screenshots through the reference-app pattern, whose one capture hook writes a gitignored folder that CI uploads as the evidence artifact; Storybook source, the addon's project-annotation provisioning (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/index.ts#L334-L343) and its setup-file detection (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/utils.ts#L41-L51), story run (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/test-utils.ts#L101-L132), preview `beforeEach` (https://github.com/storybookjs/storybook/blob/v10.6.0/code/core/src/csf/story.ts#L395-L402) and `screenshotFailures` override (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/index.ts#L418-L425); Vitest source, `onTestFinished` (https://github.com/vitest-dev/vitest/blob/v5.0.1/packages/vitest/src/runtime/runner/hooks.ts#L257-L294) and the failure screenshot (https://github.com/vitest-dev/vitest/blob/v5.0.1/packages/browser/src/client/tester/runner.ts#L187-L204); `@storycap-testrun/browser` README (https://github.com/reg-viz/storycap-testrun/blob/main/packages/browser/README.md); Vitest, `browser.screenshotFailures` (https://vitest.dev/config/browser/screenshotfailures) and the browser context API, whose `page` "is not the same object" as Playwright's (https://vitest.dev/api/browser/context); GitHub Actions status-check functions (https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions).

Gate: `review` — Outside a linter's planted fixtures, does the diff run `page.screenshot` in a story, play function, step handler or a helper they call? Does it register a story capture other than one hook run for every story, or add one without ignore entries for its capture folder and `.vitest/`? Does a setup file it adds or changes in the Storybook config directory call `setProjectAnnotations` without the project's preview annotations? Does a Storybook Vitest project it adds or changes leave `browser.screenshotFailures` unset or `false`? Does it commit a story evidence image? Does a CI step re-capture story images, decide which of them exist, or write its own summary of them?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-properties` for `page.screenshot` on `**/*.stories.ts` and `**/*.stories.tsx`, each message naming `storybook-testing/visual-evidence-comes-from-the-runner`. The file suffix is the lint's proxy for "a story", not the rule's scope: review owns the helpers a story calls, a renamed `page`, the hook registration, ignore entries and CI steps.
