---
"@systemfsoftware/stryker-js-engine": patch
---

A worker frame that cannot be delivered now fails the call instead of waiting forever.

Both sides of the worker connection discarded write failures. The parent discarded the
error from sending a call and then waited for a reply to a message that was never sent; a
worker discarded the error from sending its reply and returned as though it had answered.
Either one left the caller waiting on an answer that could not arrive, so a run stopped
making progress without failing, reporting, or timing out — it simply kept emitting
heartbeats.

A send that fails now fails the call that needed it, and a worker that cannot deliver a
reply stops rather than reporting success it did not send.
