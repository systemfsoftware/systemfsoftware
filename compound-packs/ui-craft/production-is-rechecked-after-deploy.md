---
title: The merged build is captured again on production, and a signed-in surface is walked as a stranger would
applies_when:
  - a UI pull request has merged and deployed
  - a signed-in or flagged surface is about to be enabled for people
  - a UI unit is reported done on the strength of a preview or a local build
tags: [ui-craft, production, walk, flag, deploy, verification]
---

A preview and a production build differ in data, fonts, flags, headers and the services behind the screen. The unit is not done at merge: it is done when the deployed build passes the same checks. A surface that passed locally and fails on production is shown to people only after the production walk passes.

After the deploy is green, the unit records:

- **Captures** of the evidence matrix (`the-build-loop-scores-from-screenshots`) from the production URL with the same facts, as a signed-out visitor for public pages.
- **A walk log** for a signed-in surface: a session signs in as a new person would and completes the core loop the brief names once, with one capture per step. A step that fails, errors or shows "Unavailable" fails the walk, however good the screens look.
- **A production verdict** from the independent judge (`an-independent-judge-gates-the-merge`). A production verdict under the merge verdict reopens the unit with the judge's defect list.
- **Flag state.** A surface behind a feature flag is enabled only after a passing walk, and disabled again if a later walk fails.
- **Fidelity.** A difference between the production captures and the merged preview captures (a missing font, an empty data source) is a defect with its own capture.

The signed-in screens of 2026-10-23, read on production, showed the agent unable to save a version and both venues returning "Unavailable". The loop, not the layout, was broken, and only a walk finds that.

Gate: `fact` — Does the unit record production captures on the matrix and, for a signed-in surface, a walk log with one capture per step ending in the completed core loop? `judge` — Is the production verdict `holds`?
