---
"@systemfsoftware/differential-spec": patch
---

The published tarball now contains the built dist bundle and its type declarations; the manifest's exports pointed at files the tarball did not include, so importing the published package failed. Development files no longer ship and the package now publishes a README.
