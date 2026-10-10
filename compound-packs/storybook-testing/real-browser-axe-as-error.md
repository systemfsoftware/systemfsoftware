---
title: Stories run as tests in a real browser with axe violations as errors, and an exception names one rule
applies_when:
  - running stories as tests through the Storybook Vitest addon
  - a story trips an axe rule that misfires on markup the app does not own
  - an AI agent proposes setting a story's accessibility test to `'off'` or `'todo'`
  - adding or editing a Vitest setup file that calls `setProjectAnnotations`
tags: [storybook, accessibility, axe, vitest, browser]
---

Stories run as tests in a real browser through the Vitest addon, with axe violations failing the command-line run project-wide, and an exception disables one named axe rule with its reason rather than a story's whole check. Storybook runs the Vitest addon in browser mode because a real browser "is more accurate than simulations like JSDom or HappyDom". A story whose accessibility check is turned off passes every violation it has, including ones unrelated to the rule that prompted the change.

1. **A real browser runs every story.** Stories run as tests under the Vitest addon in browser mode. A simulated DOM never stands in for it (see `stories-are-the-ui-integration-tests.md`).
2. **Violations are errors for the whole project.** The preview sets `parameters.a11y.test` to `'error'`. With `'todo'`, Storybook reports violations as warnings in its UI and produces nothing in CI.
3. **The command-line run is the gate.** The a11y addon throws on violations only when Vitest runs outside Storybook. The Vitest plugin marks a run launched from Storybook's UI, and there the addon records a failed report instead of throwing. CI runs Vitest from the command line, and that run decides.
4. **A setup file composes the a11y annotations itself.** When a Vitest setup file in the Storybook config directory calls `setProjectAnnotations`, the Vitest addon skips its automatic provisioning of preview annotations. The setup file must then compose the a11y addon's annotations (`@storybook/addon-a11y/preview`, as `a11yAnnotations`) alongside the project's own. Otherwise axe never runs and the suite reads green.
5. **An exception names one rule and its reason.** A story that trips an axe rule which misfires on markup the app does not own disables that rule by id in `parameters.a11y.config.rules`, with a comment saying why it misfires there. It never sets its `a11y.test` to `'off'` or `'todo'`.

```tsx
// .storybook/preview.ts
// Violations fail the run for every story in the project.
import type { Preview } from '@storybook/react-vite'

export default { parameters: { a11y: { test: 'error' } } } satisfies Preview

// Composer.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Composer } from './Composer.tsx'

const meta = { component: Composer } satisfies Meta<typeof Composer>
export default meta
type Story = StoryObj<typeof meta>

// WRONG: one misfiring rule turns off every axe check on the story, so an unlabelled
// message field would pass too.
export const ComposerWithEmojiPickerUnchecked: Story = {
  parameters: { a11y: { test: 'off' } },
}

// RIGHT: the story disables the one rule that misfires, by id, with its reason, and
// every other axe rule still fails the run.
export const ComposerWithEmojiPicker: Story = {
  parameters: {
    a11y: {
      config: {
        rules: [
          // The third-party emoji picker ships its own stylesheet, and its grey category
          // labels fail color-contrast; the app cannot restyle markup it does not own.
          { id: 'color-contrast', enabled: false },
        ],
      },
    },
  },
}
```

Grounds: Storybook 10.6, Vitest addon (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) and Accessibility tests (https://storybook.js.org/docs/writing-tests/accessibility-testing); Storybook source, the a11y addon's `afterEach` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/a11y/src/preview.tsx#L64-L76) and `getIsVitestStandaloneRun` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/a11y/src/utils.ts#L1-L8), and the Vitest plugin's `VITEST_STORYBOOK` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/vitest/src/vitest-plugin/index.ts#L401) and `requiresProjectAnnotations` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/vitest/src/vitest-plugin/utils.ts#L41-L61).

Gate: `review` — reject a story whose `a11y.test` is `'off'` or `'todo'`, a disabled axe rule with no stated reason, a preview without `a11y.test: 'error'`, and a Vitest setup file that calls `setProjectAnnotations` without the a11y addon's annotations.
