## 3.0.5

### Patch Changes

- Re-released to propagate the effect-cell-types and stryker-js workflow-channel migration into their published dependency graphs; no package-local API change

- The arbitraries derived for several schema filters now construct their valid values directly instead of drawing many samples and discarding them. Filtered schemas such as the worker-call guard, the edit-entry guards, and the restart-cap check generate matching values on the first draws, so property suites that use them finish faster. Every value still satisfies the same filter as before.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@6.0.0
