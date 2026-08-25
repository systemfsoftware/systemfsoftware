---
"@systemfsoftware/stryker-js-instrumenter": major
---

svelte is now an optional peer dependency. Install it to mutate .svelte components; without it, every other file type is unaffected. A copy of the Svelte compiler used to be bundled in, which pinned whichever version was present when the package was built and made the compiler version check read the wrong answer.
