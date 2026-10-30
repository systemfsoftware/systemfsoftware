---
title: A story journey specifies what a person does and sees in the app, never a component, a library, a third party or the implementation's values
applies_when:
  - writing or reviewing a storybook-gherkin journey in a story file
  - naming a story file, a Feature or a scenario for a screen or component
  - adding a .feature file, a scenario outline or a set of visual-state stories for a UI
tags: [storybook, gherkin, journey, steps, bdd]
---

A journey is a storybook-gherkin Feature in a story file. It specifies the observable behaviour of the app as the person using it meets it, in the app's own domain language. The same bar applies as for a backend Feature (testing pack: features-specify-our-systems-observable-behaviour.md).

- Subject: the Feature title, scenario titles and step text name what a person does or sees. Never name a component, primitive, design-system library, visual state (hover, focus, pressed), atom, fake, route, URL, selector, third-party endpoint, request field or status code. A third party may be named only as what the person themselves sees, picks or connects in the product.
- Swap: titles, steps and expected values read the same if the component tree is restructured, the UI library replaced, or the third-party service swapped.
- Roles: a Given sets state only through the fixture-controls module (the first calls `resetAll()`; see each-journey-starts-from-reset-fixture-controls.md), with a step that never clicks, types, navigates or reaches into a stand-in. Exactly one When, the person's action. Then reads only what the person perceives (queries-are-accessible.md), never a fake's call record, a request sent or an atom's value.
- Expected values follow the testing pack's expected-values-come-from-the-requirement.md.
- One capability per story file, named for it (`placing-an-order.stories.tsx`), with no `.feature` file beside it: the story is the feature file.
- A set of stories that enumerates a component's visual states is a visual or accessibility check written as plain stories, never a Feature.
- Each outline row varies only the input and observed outcome of the one When; rows that render a different screen are separate journeys.
- Every query, call and assertion lives in a named step definition, with no selector, URL or setup call in scenario text.

```typescript
// WRONG: names a component and a visual state, asserts the fake
Feature('AnswerCard sizing')
Then('the fake received one POST to /v1/answers', () => expect(fake.calls).toHaveLength(1))
// RIGHT: placing-an-order.stories.tsx
Feature('Placing an order')
Scenario('A shopper whose card is declined is told so and keeps the basket')
```
