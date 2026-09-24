---
"@systemfsoftware/storybook-gherkin": patch
---

A step whose story is left mid-step (Storybook aborts the play, for example when the visit moves to another story) now always settles the promise handed to Storybook's `step`. Before, an abort that landed just as a step started could leave that promise pending, so Storybook waited on it forever.
