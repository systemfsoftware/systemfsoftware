---
"@systemfsoftware/stryker-js-mutation-run": major
---

`--inPlace` no longer reports success after failing to put your files back.

Restoring the backup over your working tree swallowed every failure: an
unreadable directory counted as empty, a file that could not be inspected was
skipped, and a failed restore printed a warning and exited 0 — leaving your own
sources on disk still carrying the run's mutations while the command claimed it
was fine. A restore that cannot complete now ends the run, and the backup
directory it names is left in place to recover by hand.

Files that could not be moved directly are now copied as bytes. They were read
as text and written back, which corrupted every file in the project that was not
text, and a read that failed produced an empty file rather than an error.

The temp directory is also removed when a run finishes, instead of failing to
delete itself and logging that it had.
