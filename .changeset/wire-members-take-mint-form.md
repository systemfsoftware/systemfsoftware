---
'@systemfsoftware/stryker-js': none
'@systemfsoftware/stryker-js-platform-node': none
'@systemfsoftware/stryker-js-instrumenter': none
'@systemfsoftware/stryker-js-typescript-checker': none
---

Nothing changes for a consumer. Every schema these packages export is now
assembled from the schema combinator library directly and wrapped once at the
edge, instead of through the convenience wrappers the wrappers implied. The
exported names, their types, and the decoded values are identical, and no
runtime behaviour moved.
