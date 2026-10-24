---
title: Every job carries the one 60-minute timeout, and nothing kills work sooner
applies_when:
  - adding a job or setting a job's or step's timeout-minutes
  - wrapping a command or tool in a wall-clock limit, or calling a reusable workflow
tags: [ci, timeout, backstop]
---

Title: Every job sets timeout-minutes: 60, and no step, command wrapper or tool flag sets a shorter wall-clock kill.

Every job with runs-on sets timeout-minutes: 60, never another value.

No step, command wrapper (timeout N) or tool flag sets a wall-clock kill below 60 minutes; a per-test timeout inside a test framework is not a step, wrapper or tool flag.

A job that calls a reusable workflow passes no timeout or wall-clock cap through with:, and the callee's jobs carry the backstop.

Gate: judge
