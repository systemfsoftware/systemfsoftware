## 4.0.3

### Patch Changes

- Every tagged error class now has a one-line message built from its fields, so a failure shows what went wrong instead of an empty message.

- A step whose story is left mid-step (Storybook aborts the play, for example when the visit moves to another story) now always settles the promise handed to Storybook's `step`. Before, an abort that landed just as a step started could leave that promise pending, so Storybook waited on it forever.

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.
