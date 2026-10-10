---
title: Scenario state and faults come from a domain-free controls DSL, bound once and reset by construction
applies_when:
  - setting a story's scenario state, timing, or fault behaviour
  - adding a timing or fault knob to the Storybook fake
  - reviewing a story that sets state through bespoke args, a decorator, or hand-reset flags
tags: [storybook, fixtures, controls, fakes, reset]
---

Scenario state and faults come from a domain-free fixture-controls DSL, bound once to the app's nouns and reset by its registry, never from ad-hoc story args or module-level state.

State a story writes around the fake is state the fake never sees: the app reads one thing while the fake answers another, so the story proves a world that cannot happen. Module-level flags leak into the next story, and a hand-written reset list misses the knob added last month, so stories pass or fail by the order they run in.

1. **Domain-free DSL, app nouns.** The DSL knows only general concepts: a fault that is armed, disarmed and consulted; a write that lands in phases; a question a person answers. The app binds each control once under its own nouns, such as a message-post fault.
2. **The fake consults, a step arms.** The port's `layerTest` reads the control, and a Given step sets it. The story never touches app state directly.
3. **Reset by construction.** Defining a control registers it, and the registry resets every registered control before each story. A control added later is reset without anyone listing it.

```tsx
// WRONG: a decorator writes module-level state the fake reads, so the state bypasses
// the fake's controls and nothing resets it for the next story
let postFails = false

export const PostFailureOffersARetry = {
  decorators: [(Story) => {
    postFails = true
    return <Story />
  }],
}

// RIGHT: one control under a domain noun, bound once; the fake consults it, a step arms it,
// and the registry resets every control before each story
// the app's binding of the controls DSL (defineFault, resetAll come from the DSL)
export const messagePost = defineFault('messagePost')

// in Messages.layerTest: post fails with MessagePostFailed while messagePost.isArmed()

// the step library
export const postingIsDown = Given`the message service has gone down`(() => messagePost.arm())

// .storybook/preview.tsx
export default definePreview({ beforeEach: () => resetAll() })
```

Gate: `review` — reject a story that sets scenario state through a decorator, bespoke args or a module-level variable, and any control the registry does not reset. Component props passed as args are not scenario state and are fine.
