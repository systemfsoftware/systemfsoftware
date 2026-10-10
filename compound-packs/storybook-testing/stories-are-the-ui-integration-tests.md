---
title: UI behaviour is proven in stories, not in an RTL suite or a unit test of a UI shell
applies_when:
  - deciding how to prove a user-visible behaviour of a UI
  - an AI agent proposes an RTL suite, or a unit test of a store, executor, or other UI shell
  - reviewing a test that drives a UI shell over a hand-built stand-in
tags: [storybook, testing, composition, ui, test-placement]
---

UI behaviour is proven in stories, with no separate RTL suite and no unit test of a UI shell (store, executor) standing in for one.

A behaviour a person sees runs through components, atoms, decisions and the I/O Layer together. A unit test of one shell proves the shell against the stand-in its author built, so it stays green when the wiring around the shell breaks, and the person still loses their work. A second, simulated-DOM suite beside the stories proves the same behaviour less faithfully and drifts from them.

1. **Stories own UI behaviour.** A user-visible behaviour is a story scenario through the real app over the fake I/O Layer (`story-is-the-spec`, `mock-at-the-io-seam-only`).
2. **Other test kinds keep their own homes.** Pure decisions keep property tests, and behaviour without a UI keeps behaviour-lane integration tests. Their names and places are the Test Lanes table's in `packages/oxlint-plugin/oxlint-plugin-test-discipline/README.md`.
3. **Neighbouring rules.** A store's own law suite is governed by `boundary-testing/fake-and-real-store-laws.md`, and doubles of glue by `boundary-testing/no-mocks-on-internal-glue.md`. This rule decides only where UI behaviour is proven.

```tsx
// WRONG: a unit test pins a user-visible behaviour by driving the store over a hand-built
// storage stand-in, and no story proves it
test('a draft is restored when the form reopens', async () => {
  const storage = new Map<string, string>()
  await Effect.runPromise(Drafts.save(draft).pipe(Effect.provide(storageOver(storage))))
  const restored = await Effect.runPromise(Drafts.load.pipe(Effect.provide(storageOver(storage))))
  expect(restored).toEqual(draft)
})

// RIGHT: a story proves the same behaviour through the real app over the fake I/O Layer
export const UnsentDraftIsRestored = f.scenario(
  'An unsent channel draft is restored when the form reopens',
  { with: { person: 'Ada', name: 'Book club' } },
  hasSignedIn,
  startsAChannelNamed,
  leavesAndReopensTheForm,
  draftNameIsShown,
)
```

Gate: `review` — reject an RTL suite and any unit test of a UI shell that stands in for a story; where a repo loads `@systemfsoftware/oxlint-plugin-test-discipline`, its `no-test-file-in-src` rule refuses a colocated unit test of a shell.
