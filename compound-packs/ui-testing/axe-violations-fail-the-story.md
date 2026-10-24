---
title: Every story runs axe as an error, and no story turns it off
applies_when:
  - configuring the Storybook preview or a Vitest setup file that loads story annotations
  - a story fails an accessibility check
tags: [storybook, accessibility, axe]
---

An app's Storybook preview sets parameters.a11y.test to 'error'.

No app story or meta sets a11y.test to 'off' or 'todo', or disables an axe rule through parameters.a11y.config.rules.

A Vitest setup file that calls setProjectAnnotations for an app's stories includes the a11y addon's preview annotations.

Gate: judge
