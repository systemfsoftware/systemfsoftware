---
'@systemfsoftware/oxlint-plugin-effect-dmmf': major
---

The aggregate now carries `make-command-schema`, enabled as an error in its recommended config. Upgrading with that config on will fail builds that currently pass: the rule refuses a value laundered into looking like a schema class at the command position of `Workflow.make`, in the three forms a type checker accepts — an assertion, an object assembled by a wrapper constructor, and a binding that exists only as a declaration.
