---
"@systemfsoftware/stryker-js-platform-node": major
---

Removed the public export LoggingServerNotTcpError from @systemfsoftware/stryker-js-platform-node. The worker log server that could fail with this error no longer exists, so the error can no longer occur. If you imported this symbol, remove the import.
