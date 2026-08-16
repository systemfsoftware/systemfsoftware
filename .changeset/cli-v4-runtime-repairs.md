---
"@systemfsoftware/stryker-js-cli": patch
---

Repair the CLI the effect v4 cutover left unable to run

The parser's Stdio layer was the test layer, whose sinks drain to nowhere, so help and version documents never rendered; the entrypoint passed the full process.argv to a parser that takes the arguments after the program name; the run-event stream's close could race the drain fiber's mailbox registration and hang the process forever; and a consumer closing the pipe crashed the whole process on the stream's unhandled error event. The stream now drains through the platform's Stdio sink, which owns backpressure, the scoped error listener, and the final flush, and every invocation — version, help, the agent manifest, a full run with its reader gone — completes with its classed exit code
