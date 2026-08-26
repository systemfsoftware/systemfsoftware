---
'@systemfsoftware/stryker-js-platform-node': patch
---

A run no longer walks your installed dependencies before it starts.

The scan that collects a project's input files descended into `node_modules`. With a
package manager that stores dependencies as links, that tree holds every version of every
transitive dependency, so the scan did not come back: the run printed its opening line and
then only heartbeats, never reaching a phase, and eventually exhausted memory.

Dependency directories are skipped again, so a run reaches its first phase immediately
regardless of how much is installed.
