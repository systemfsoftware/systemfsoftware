---
title: A story journey specifies what a person does and sees in the app, never a component, a library, a third party or the implementation's values
applies_when:
  - writing or reviewing a storybook-gherkin journey in a story file
  - naming a story file, a Feature or a scenario for a screen or component
  - adding a .feature file, a scenario outline or a set of visual-state stories for a UI
tags: [storybook, gherkin, journey, steps, bdd]
---

A journey is a storybook-gherkin Feature in a story file. It specifies the observable behaviour of the app as the person using it meets it, in the app's own domain language. The person is the journey's consumer; a backend Feature, whose consumer is the calling code or an operator, is governed by the testing pack's features-specify-our-systems-observable-behaviour.md, and both apply the same bar.

The reviewer applies each decision test to the diff; any "no" fails it, and an uncertain case escalates and never passes.

1. Subject. Do the Feature title, every scenario title and every step's text name what a person does or sees in the app? Text that names a component, primitive, design-system library, visual state (hover, focus, pressed), atom, fake, route, URL, selector, third-party endpoint, request field or status code fails. A third party may be named only as what the person themselves sees, picks or connects in the product (the provider they connect, the checkout page they are sent to); it is never the subject.
2. Swap. Would every title, step text and expected value read the same if the component tree were restructured, the UI library replaced, or the third-party service behind the screen swapped for another? A third party named as what the person sees or picks is swapped everywhere it appears, step text and expected value alike, and fails only if anything else would have to change. Anything else that would have to change fails.
3. Roles. Does every Given set state only through the fixture-controls module, the first calling `resetAll()` and any later one setting a named fixture control (each-journey-starts-from-reset-fixture-controls.md), with a step definition that never clicks, types, navigates or reaches into a stand-in's internals? Is there exactly one When, the person's action? Does Then read only what the person perceives on the screen (queries-are-accessible.md), never a fake's call record, a request sent or an atom's value? A Given whose text names state that no fixture control sets fails (a control a component reads on mount is set in the story's `beforeEach`).
4. Expected values. Do they follow the testing pack's expected-values-come-from-the-requirement.md, read as the person meets them on the screen?
5. One capability. Does the story file hold one capability and carry its name (placing-an-order.stories.tsx), never a component's or module's? Is there no .feature file beside it? The library's invariant is that the story is the feature file; no parallel .feature is produced or required (https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/gherkin/storybook-gherkin/AGENTS.md, rule SG5).
6. Not a matrix. A set of stories that enumerates a component's visual states has no person acting and no outcome; it is a visual or accessibility check written as plain stories, never a Feature.
7. Outline rows. Does each row of a scenario outline vary only the input and the observed outcome of the one When? Rows that render a different screen or component are separate journeys.
8. Steps. Does every query, call and assertion live in a named step definition, with no selector, URL or setup call in scenario text?

Defect prevented: Gherkin worn as a costume on a component test. Such a story stays green while the person's journey is broken (it checks a component or a fake, not what is on the screen) and goes red on refactors that change nothing the person sees (it pins the implementation's names and numbers).

```typescript
// WRONG: names a component and a visual state, pins the implementation's threshold, asserts the fake
Feature('AnswerCard sizing')
Scenario('sixty words use the display style')
Then('the fake received one POST to /v1/answers', () => expect(fake.calls).toHaveLength(1))
```

```typescript
// RIGHT: placing-an-order.stories.tsx
Feature('Placing an order')
Scenario('A shopper whose card is declined is told so and keeps the basket')
Given('a basket holding two books and a card the bank declines') // resetAll(), then the basket and declined-card fixture controls
When('the shopper places the order')
Then('the shopper is told the card was declined and both books are still in the basket')
```

The single When is this pack's ruling: one scenario specifies one behaviour. Sources: Cucumber, Writing better Gherkin (https://cucumber.io/docs/bdd/better-gherkin/): scenarios describe "what, not how"; ask "Will this wording need to change if the implementation does?". Cucumber, Gherkin reference (https://cucumber.io/docs/gherkin/reference/): Then asserts an observable output; a Scenario Outline runs the same scenario with different values. Dan North, Introducing BDD (https://dannorth.net/blog/introducing-bdd/). Kent C. Dodds, Testing implementation details (https://kentcdodds.com/blog/testing-implementation-details).

Gate: judge
