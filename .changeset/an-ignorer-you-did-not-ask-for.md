---
"@systemfsoftware/stryker-js-engine": patch
---

An ignore plugin you did not select no longer ignores your mutants.

`ignorers` in your config names which ignore plugins are active. It was read as
documentation: every ignore plugin reachable through `plugins` ran, whether or
not you named it. A shared plugin set therefore imposed its ignore rules on
every project that loaded it.

The consequence was silent and total wherever an unselected plugin's rule
matched broadly: mutants came back ignored, the score was reported as `null`,
and no mutant was ever tested — a run that looks like it worked and proves
nothing. `ignorers` is now the allowlist it claims to be.
