## 3.0.6

### Patch Changes

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.

- The arbitraries derived for several schema filters now construct their valid values directly instead of drawing many samples and discarding them. Filtered schemas such as the worker-call guard, the edit-entry guards, and the restart-cap check generate matching values on the first draws, so property suites that use them finish faster. Every value still satisfies the same filter as before.
