---
title: A story journey is one storybook-gherkin scenario whose Given sets state, whose single When acts, and whose Then asserts what a person observes
applies_when:
  - writing or reviewing a storybook-gherkin journey in a story file
  - adding a .feature file for a UI journey
tags: [storybook, gherkin, journey, steps]
---

A journey is written with @systemfsoftware/storybook-gherkin in a story file that holds one capability and is named for it, never for a component or module, and no .feature file exists beside it.

The story's parameters configure the state a Given names. A Given step definition never clicks, types, navigates or changes a fake.

A scenario has exactly one When.

Then asserts an outcome a person observes, never a fake's call record or an atom's internal value.

Every query, call and assertion lives in a named step definition. Scenario text carries no selector, URL or setup call.

Gate: judge
